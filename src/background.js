import { DownloadPrompts, downloadOptions } from './core/download-options.js';
import { translateText } from './core/language.js';
import { ShortcutSettings, shortcutActions } from './core/shortcuts.js';
import { toolbarState } from './core/toolbar.js';
import { readPreferences, validatePreferencePatch } from './core/manager-preferences.js';
import { defaults, normalizeConfig, serverSignature, exportConfig, validateLink } from './core/config.js';
import { rpc, makeGid } from './core/rpc.js';
import { matchesFilters } from './core/rules.js';
import { RequestTracker, requestOptions, selectCookies } from './core/requests.js';
import { Journal, Handoff, activeStates } from './core/handoff.js';

const prompts = new DownloadPrompts(browser.windows, browser.runtime.getURL('confirm/index.html'));
browser.windows.onRemoved.addListener(id => prompts.closed(id));
const tracker = new RequestTracker();
const journal = new Journal(browser.storage.local);
let config;
let shortcuts;
let menuServerIds = [];
let menuQueue = Promise.resolve();
let managerPreferences;
const t = value => translateText(value, managerPreferences?.language);
let preferencesQueue = Promise.resolve();
let verified = {};
const disconnectedSummary = note => ({ connected: false, note, downloadSpeed: '0', uploadSpeed: '0' });
let summary = disconnectedSummary('尚未连接');
let statsRevision = 0;
let statsGeneration = 0;
let appliedStatsRevision = 0;
let badgeQueue = Promise.resolve();
let currentIcon;
let lastNotice = '';
const server = id => config.servers.find(s => s.id === (id || config.defaultServerId));
const notify = async note => {
  if (lastNotice === note) return;
  lastNotice = note;
  await browser.notifications.create('handoff', { type: 'basic', iconUrl: browser.runtime.getURL('icon.svg'), title: 'Aria2 Bridge', message: t(note) });
};
const handoff = new Handoff({ downloads: browser.downloads, journal, call: rpc, server, notify });
const ready = (async () => {
  const stored = await browser.storage.local.get(['config', 'verified', 'managerPreferences']);
  config = normalizeConfig(stored.config || defaults());
  verified = stored.verified || {};
  managerPreferences = readPreferences(stored.managerPreferences);
  const { os } = await browser.runtime.getPlatformInfo();
  shortcuts = new ShortcutSettings(browser.commands, browser.storage.local, os);
  await shortcuts.load();
  await journal.load();
  await browser.alarms.create('bridge-status', { periodInMinutes: 1 });
  await browser.menus.removeAll();
  browser.menus.create({ id: 'send-link', title: t('发送到 Aria2 Bridge'), contexts: ['link'] });
  browser.menus.create({ id: 'quick-actions', title: t('Aria2 Bridge 快捷操作'), contexts: ['action'] });
  for (const action of shortcutActions) browser.menus.create({ id: action.name, parentId: 'quick-actions', title: t(action.label), contexts: ['action'], ...(action.name === 'open-add' ? { command: '_execute_action' } : {}), ...(action.name === 'toggle-takeover' ? { type: 'checkbox', checked: config.enabled } : {}) });
  browser.menus.create({ id: 'toggle-shortcuts', parentId: 'quick-actions', title: t('启用功能快捷键'), type: 'checkbox', checked: shortcuts.state.enabled, contexts: ['action'] });
  browser.menus.create({ id: 'quick-rpc', parentId: 'quick-actions', title: t('切换默认 RPC'), contexts: ['action'] });
  await syncMenus(true);
})();

function syncMenus(rebuild = false) {
  const work = menuQueue.then(async () => {
    for (const [id, title] of [['send-link', '发送到 Aria2 Bridge'], ['quick-actions', 'Aria2 Bridge 快捷操作'], ['quick-rpc', '切换默认 RPC'], ['toggle-shortcuts', '启用功能快捷键'], ...shortcutActions.map(a => [a.name, a.label])]) await browser.menus.update(id, { title: t(title) });
    for (const action of shortcutActions) await browser.commands.update({ name: action.name, description: t(action.label) });
    await browser.menus.update('toggle-takeover', { checked: config.enabled });
    await browser.menus.update('toggle-shortcuts', { checked: shortcuts.state.enabled });
    if (rebuild) {
      for (const id of menuServerIds) await browser.menus.remove(id);
      menuServerIds = config.servers.map(s => ({ server: s, menuId: `quick-rpc-${s.id}` }));
      for (const item of menuServerIds) browser.menus.create({ id: item.menuId, parentId: 'quick-rpc', title: item.server.name, type: 'radio', checked: item.server.id === config.defaultServerId, contexts: ['action'] });
      menuServerIds = menuServerIds.map(item => item.menuId);
    }
  });
  menuQueue = work.catch(() => {});
  return work;
}
function runQuickAction(name) {
  // These APIs need the original trusted menu/keyboard gesture.
  if (name === 'open-add') return browser.action.openPopup();
  if (name === 'toggle-sidebar') return browser.sidebarAction.toggle();
  return ready.then(async () => {
    switch (name) {
      case 'open-manager': return openManager();
      case 'open-options': return browser.runtime.openOptionsPage();
      case 'toggle-takeover':
        try { return await saveConfig(current => ({ ...current, enabled: !current.enabled })); }
        finally { await syncMenus(); }
      case 'test-connection': {
        const version = await handle({ type: 'TEST', serverId: config.defaultServerId });
        return notify(`连接成功 · aria2 ${version.version}`);
      }
      case 'refresh-status': {
        const status = await refresh();
        return notify(status.note);
      }
      default: throw new Error('未知快捷功能');
    }
  });
}
browser.commands.onCommand.addListener(name => {
  if (!shortcuts?.enabled || !shortcutActions.some(a => a.name === name)) return;
  runQuickAction(name).catch(error => notify(error.message));
});

function badge() {
  const work = badgeQueue.then(async () => {
    const pending = Object.values(journal.records).filter(r => activeStates.has(r.state) && r.state !== 'abandoned').length;
    const state = toolbarState({ enabled: config.enabled, summary, pending, serverName: server().name, translate: t });
    if (currentIcon !== state.icon) {
      await browser.action.setIcon({ path: state.icon });
      currentIcon = state.icon;
    }
    await browser.action.setBadgeText({ text: state.text });
    await browser.action.setBadgeBackgroundColor({ color: state.color });
    await browser.action.setBadgeTextColor({ color: '#ffffff' });
    await browser.action.setTitle({ title: state.title });
  });
  badgeQueue = work.catch(() => {});
  return work;
}

async function queryGlobalStats(s, params = []) {
  const selected = server();
  const current = s.id === selected.id && serverSignature(s) === serverSignature(selected);
  const generation = statsGeneration;
  const revision = current ? ++statsRevision : null;
  const stillCurrent = () => current && generation === statsGeneration && revision >= appliedStatsRevision && s.id === config.defaultServerId && serverSignature(s) === serverSignature(server());
  try {
    const result = await rpc(s, 'aria2.getGlobalStat', params);
    if (stillCurrent()) {
      appliedStatsRevision = revision;
      summary = { ...result, connected: true, note: '已连接', checkedAt: Date.now() };
      await badge();
    }
    return result;
  } catch (error) {
    if (stillCurrent()) {
      appliedStatsRevision = revision;
      summary = disconnectedSummary('连接失败，请检查地址、Secret 和网络');
      await badge();
    }
    throw error;
  }
}
async function refresh() {
  try { await queryGlobalStats(server()); } catch { /* The query clears stale counts on failure. */ }
  return summary;
}

let configQueue = Promise.resolve();
function saveConfig(input) {
  const work = configQueue.then(async () => {
    const next = normalizeConfig(typeof input === 'function' ? input(config) : input);
    if (handoff.locks.size && config.servers.some(old => {
      const changed = next.servers.find(s => s.id === old.id);
      return !changed || serverSignature(old) !== serverSignature(changed);
    })) throw new Error('交接正在执行，请完成后再修改 RPC 地址和 Secret');
    for (const r of Object.values(journal.records).filter(r => activeStates.has(r.state))) {
      const old = server(r.serverId), changed = next.servers.find(s => s.id === r.serverId);
      if (!changed || !old || serverSignature(old) !== serverSignature(changed)) throw new Error('有未确认交接，暂不能删除或修改其 RPC 地址和 Secret');
    }
    const selected = next.servers.find(s => s.id === next.defaultServerId);
    if (next.enabled && verified[selected.id] !== serverSignature(selected)) throw new Error('请先成功测试默认 RPC，再开启自动接管');
    const changedServer = config.defaultServerId !== next.defaultServerId || serverSignature(server()) !== serverSignature(selected);
    await browser.storage.local.set({ config: next });
    config = next;
    if (changedServer) { statsGeneration++; summary = disconnectedSummary('正在连接'); }
    if (!config.enabled) tracker.records.clear();
    await badge();
    await syncMenus(true);
    if (changedServer) refresh().catch(report);
    return config;
  });
  configQueue = work.catch(() => {});
  return work;
}

async function openManager() {
  const url = browser.runtime.getURL('manager/index.html');
  const existing = (await browser.tabs.query({})).find(t => t.url?.split(/[?#]/)[0] === url);
  if (existing) {
    await browser.tabs.update(existing.id, { active: true });
    await browser.windows.update(existing.windowId, { focused: true });
  } else await browser.tabs.create({ url });
}

async function addLinks(message, context) {
  if (!Array.isArray(message.links) || !message.links.length || message.links.length > 100) throw new Error('每次请添加 1–100 个链接');
  const links = message.links.map(validateLink); // validate the whole batch before sending anything
  let s = server(message.serverId);
  if (!s) throw new Error('RPC 服务不存在');
  const custom = message.options ? downloadOptions(message.options) : null;
  if (custom?.out && links.length > 1) throw new Error('自定义文件名仅适用于单个链接');
  if (custom) s = { ...s, dir: custom.dir };
  const result = [];
  for (const link of links) {
    const gid = makeGid();
    try {
      const options = { ...requestOptions(link.startsWith('magnet:') ? null : context, s), ...(custom?.out ? { out: custom.out } : {}), ...(custom?.paused ? { pause: 'true' } : {}), gid };
      const added = await rpc(s, 'aria2.addUri', [[link], options]);
      result.push({ gid, state: added === gid ? 'added' : 'uncertain' });
    } catch (e) { result.push({ gid, state: e.kind === 'rejected' ? 'rejected' : 'uncertain' }); }
  }
  if (s.id === config.defaultServerId) refresh().catch(report);
  return result;
}

async function handle(message) {
  await ready;
  switch (message?.type) {
    case 'CONFIRM_GET': return prompts.get(message.id);
    case 'CONFIRM_DECIDE': {
      prompts.get(message.id);
      if (message.browser) { prompts.finish(message.id, null); return true; }
      const selected = server(message.serverId);
      if (!selected || verified[selected.id] !== serverSignature(selected)) throw new Error('请先成功测试所选 RPC，再发送下载');
      const custom = downloadOptions(message.options);
      prompts.finish(message.id, { server: { ...selected, dir: custom.dir }, options: custom.out ? { out: custom.out } : {}, paused: custom.paused });
      return true;
    }
    case 'SHORTCUTS_GET': return shortcuts.state;
    case 'SHORTCUTS_SAVE': {
      const saved = await shortcuts.save(message.shortcuts);
      await syncMenus();
      return saved;
    }
    case 'MANAGER_PREFERENCES_GET': return managerPreferences;
    case 'MANAGER_PREFERENCES_PATCH': {
      const patch = validatePreferencePatch(message.patch);
      const work = preferencesQueue.then(async () => {
        const next = { ...managerPreferences, ...patch };
        await browser.storage.local.set({ managerPreferences: { version: 1, options: next } });
        managerPreferences = next;
        if (patch.language) { lastNotice = ''; syncMenus().then(badge).catch(report); }
        return next;
      });
      preferencesQueue = work.catch(() => {});
      return work;
    }
    case 'CONFIG_GET': await configQueue; return config;
    case 'CONFIG_PUBLIC': await configQueue; return { ...config, servers: config.servers.map(({ secret: _secret, ...s }) => s) };
    case 'SELECT_SERVER': await saveConfig({ ...config, defaultServerId: message.serverId, enabled: false }); return true;
    case 'SET_ENABLED': await saveConfig({ ...config, enabled: message.enabled }); return config.enabled;
    case 'CONFIG_SAVE': return saveConfig(message.config);
    case 'CONFIG_EXPORT': return exportConfig(config);
    case 'TEST': {
      const s = server(message.serverId);
      if (!s) throw new Error('RPC 服务不存在');
      const version = await rpc(s, 'aria2.getVersion');
      verified[s.id] = serverSignature(s);
      await browser.storage.local.set({ verified });
      await refresh();
      return version;
    }
    case 'STATUS': return message.refresh ? refresh() : summary;
    case 'ADD': return addLinks(message);
    case 'RPC': {
      const s = server(message.serverId);
      if (!s) throw new Error('RPC 服务不存在');
      const params = structuredClone(message.params || []);
      // AriaNg new tasks share the selected server's remote default directory.
      if (['aria2.addUri', 'aria2.addTorrent', 'aria2.addMetalink'].includes(message.method)) {
        const at = message.method === 'aria2.addTorrent' ? 2 : 1;
        if (s.dir) params[at] = { dir: s.dir, ...(params[at] || {}) };
      }
      if (message.method === 'aria2.getGlobalStat') return queryGlobalStats(s, params);
      const result = await rpc(s, message.method, params);
      if (s.id === config.defaultServerId && (/^aria2\.(add|pause|forcePause|unpause|remove|forceRemove)/.test(message.method) || message.method === 'system.multicall')) refresh().catch(report);
      return result;
    }
    case 'HANDOFFS': return Object.values(journal.records).sort((a, b) => b.createdAt - a.createdAt);
    case 'RECHECK': await handoff.reconcile(message.downloadId); await badge(); return journal.records[message.downloadId];
    case 'CONTINUE': await handoff.reconcile(message.downloadId, true); await badge(); return journal.records[message.downloadId];
    case 'OPEN_MANAGER': await openManager(); return true;
    default: throw new Error('未知内部请求');
  }
}

// No externally_connectable, no content scripts and no web-accessible extension pages.
// Only our actual UI documents can use the backend; a website tab is never authorized.
browser.runtime.onMessage.addListener((message, sender) => {
  const root = browser.runtime.getURL('');
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(root) ||
    !['popup/index.html', 'options/index.html', 'manager/index.html', 'confirm/index.html'].includes(sender.url.slice(root.length).split(/[?#]/)[0])) return undefined;
  return handle(message).then(data => ({ ok: true, data }), error => ({ ok: false, error: t(error.message), sourceError: error.message }));
});

const filter = { urls: ['http://*/*', 'https://*/*'] };
browser.webRequest.onBeforeRequest.addListener(d => { if (config?.enabled) tracker.before(d); }, filter);
browser.webRequest.onBeforeSendHeaders.addListener(d => { if (config?.enabled) tracker.headers(d); }, filter, ['requestHeaders']);

const considering = new Set();
async function consider(item) {
  await ready;
  if (considering.has(item.id)) return;
  considering.add(item.id);
  try { await considerReady(item); } finally { considering.delete(item.id); }
}
async function considerReady(item) {
  if (!config.enabled || item.incognito || item.byExtensionId || item.state !== 'in_progress' || item.paused || journal.records[item.id]) return;
  if (!matchesFilters(item, config.filters)) return;
  // Firefox pause() calls Download.cancel(). Before partial data exists this is irreversible.
  // Wait briefly for actual bytes, then verify the native paused flag rather than its interrupted state.
  for (let attempt = 0; !item.bytesReceived && attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    item = (await browser.downloads.search({ id: item.id }))[0];
    if (!item || !config.enabled || item.state !== 'in_progress' || item.paused || journal.records[item.id]) return;
  }
  if (!item.bytesReceived || !matchesFilters(item, config.filters)) return;
  const s = server();
  if (verified[s.id] !== serverSignature(s)) return;
  const context = tracker.match(item);
  if (!context) return;
  await handoff.start(item, s, context, config.askBeforeDownload ? async (download, selected) => {
    badge().catch(report);
    return prompts.open({ downloadId: download.id, filename: download.filename.split(/[\\/]/).pop(), serverId: selected.id, dir: selected.dir,
      source: new URL(context.url).hostname, size: download.totalBytes, storeId: download.cookieStoreId });
  } : undefined);
  await refresh();
}
const report = () => notify('后台操作失败，请打开交接记录核对；浏览器下载未被主动删除').catch(() => {});
browser.downloads.onCreated.addListener(item => { consider(item).catch(report); });
browser.downloads.onChanged.addListener(delta => {
  if (delta.state?.current === 'complete' || delta.paused?.current === false || delta.error?.current === 'USER_CANCELED') {
    browser.downloads.search({ id: delta.id }).then(items => { const item = items[0]; if (!item || (!item.paused && (item.state !== 'in_progress' || delta.paused?.current === false))) prompts.changed(delta.id); }).catch(report);
  }
  if (delta.state?.current === 'in_progress' || delta.filename || delta.url) {
    browser.downloads.search({ id: delta.id }).then(items => items[0] && consider(items[0])).catch(report);
  }
});
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'bridge-status') ready.then(async () => { tracker.prune(); await handoff.recover(); await refresh(); }).catch(report);
});
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggle-shortcuts') {
    shortcuts.save(current => ({ ...current, enabled: !current.enabled })).finally(() => syncMenus()).catch(error => notify(error.message));
    return;
  }
  if (shortcutActions.some(a => a.name === info.menuItemId)) { runQuickAction(info.menuItemId).catch(error => notify(error.message)); return; }
  if (String(info.menuItemId).startsWith('quick-rpc-')) {
    const selected = config.servers.find(s => s.id === String(info.menuItemId).slice('quick-rpc-'.length));
    if (selected) ready.then(() => saveConfig({ ...config, defaultServerId: selected.id, enabled: false })).catch(error => { syncMenus(true).catch(report); notify(error.message); });
    return;
  }
  if (info.menuItemId !== 'send-link') return;
  ready.then(async () => {
    let s = server();
    let context;
    let selectedId = s.id, custom;
    if (config.askBeforeDownload) {
      const choice = await prompts.open({ serverId: s.id, dir: s.dir, filename: '', source: new URL(info.linkUrl).hostname || 'magnet:', size: -1 });
      if (!choice) return;
      selectedId = choice.server.id; custom = { dir: choice.server.dir, out: choice.options.out || '', paused: choice.paused };
      s = choice.server;
    }
    if (s.forwardCookies && !info.linkUrl.startsWith('magnet:')) {
      // Private or cross-site manual sends need observed network context; do not synthesize cookies.
      if (tab.incognito || info.frameId !== 0 || !tab.cookieStoreId || new URL(tab.url).origin !== new URL(info.linkUrl).origin) {
        throw new Error('此链接无法可靠读取登录态；请关闭 Cookie 转发后发送，或从原页面下载');
      }
      const cookies = await browser.cookies.getAll({ url: info.linkUrl, storeId: tab.cookieStoreId, firstPartyDomain: null, partitionKey: {} });
      context = { cookie: selectCookies(cookies, tab.url), referer: info.pageUrl, userAgent: navigator.userAgent };
    }
    const results = await addLinks({ serverId: selectedId, links: [info.linkUrl], options: custom }, context);
    await notify(results[0].state === 'added' ? '已发送到 aria2' : `发送结果待核对，GID：${results[0].gid}；请勿直接重复发送`);
  }).catch(error => notify(error.message));
});
ready.then(async () => { await handoff.recover(); await refresh(); }).catch(report);
