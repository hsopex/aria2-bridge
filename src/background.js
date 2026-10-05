import { readPreferences, validatePreferencePatch } from './core/manager-preferences.js';
import { defaults, normalizeConfig, serverSignature, exportConfig, validateLink } from './core/config.js';
import { rpc, makeGid } from './core/rpc.js';
import { matchesFilters } from './core/rules.js';
import { RequestTracker, requestOptions, selectCookies } from './core/requests.js';
import { Journal, Handoff, activeStates } from './core/handoff.js';

const tracker = new RequestTracker();
const journal = new Journal(browser.storage.local);
let config;
let managerPreferences;
let preferencesQueue = Promise.resolve();
let verified = {};
let summary = { connected: false, note: '尚未连接', downloadSpeed: '0', uploadSpeed: '0' };
let lastNotice = '';
const server = id => config.servers.find(s => s.id === (id || config.defaultServerId));
const notify = async note => {
  if (lastNotice === note) return;
  lastNotice = note;
  await browser.notifications.create('handoff', { type: 'basic', iconUrl: browser.runtime.getURL('icon.svg'), title: 'Aria2 Bridge', message: note });
};
const handoff = new Handoff({ downloads: browser.downloads, journal, call: rpc, server, notify });
const ready = (async () => {
  const stored = await browser.storage.local.get(['config', 'verified', 'managerPreferences']);
  config = normalizeConfig(stored.config || defaults());
  verified = stored.verified || {};
  managerPreferences = readPreferences(stored.managerPreferences);
  await journal.load();
  await browser.alarms.create('bridge-status', { periodInMinutes: 1 });
  await browser.menus.removeAll();
  browser.menus.create({ id: 'send-link', title: '发送到 Aria2 Bridge', contexts: ['link'] });
})();

async function badge() {
  const pending = Object.values(journal.records).filter(r => activeStates.has(r.state) && r.state !== 'abandoned').length;
  await browser.action.setBadgeText({ text: pending ? '?' : config.enabled ? 'ON' : '' });
  await browser.action.setBadgeBackgroundColor({ color: pending ? '#b35c00' : summary.connected ? '#237747' : '#8a3440' });
  await browser.action.setTitle({ title: pending ? `Aria2 Bridge · ${pending} 个交接待确认` : `Aria2 Bridge · ${summary.note}` });
}

async function refresh() {
  try {
    const result = await rpc(server(), 'aria2.getGlobalStat');
    summary = { ...result, connected: true, note: '已连接', checkedAt: Date.now() };
  } catch { summary = { connected: false, note: '连接失败，请检查地址、Secret 和网络', downloadSpeed: '0', uploadSpeed: '0', checkedAt: Date.now() }; }
  await badge();
  return summary;
}

let configQueue = Promise.resolve();
function saveConfig(input) {
  const work = configQueue.then(async () => {
    const next = normalizeConfig(input);
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
    await browser.storage.local.set({ config: next });
    config = next;
    if (!config.enabled) tracker.records.clear();
    await badge();
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
  const s = server(message.serverId);
  if (!s) throw new Error('RPC 服务不存在');
  const result = [];
  for (const link of links) {
    const gid = makeGid();
    try {
      const options = { ...requestOptions(link.startsWith('magnet:') ? null : context, s), gid };
      const added = await rpc(s, 'aria2.addUri', [[link], options]);
      result.push({ gid, state: added === gid ? 'added' : 'uncertain' });
    } catch (e) { result.push({ gid, state: e.kind === 'rejected' ? 'rejected' : 'uncertain' }); }
  }
  return result;
}

async function handle(message) {
  await ready;
  switch (message?.type) {
    case 'MANAGER_PREFERENCES_GET': return managerPreferences;
    case 'MANAGER_PREFERENCES_PATCH': {
      const patch = validatePreferencePatch(message.patch);
      const work = preferencesQueue.then(async () => {
        const next = { ...managerPreferences, ...patch };
        await browser.storage.local.set({ managerPreferences: { version: 1, options: next } });
        managerPreferences = next;
        return next;
      });
      preferencesQueue = work.catch(() => {});
      return work;
    }
    case 'CONFIG_GET': return config;
    case 'CONFIG_PUBLIC': return { ...config, servers: config.servers.map(({ secret: _secret, ...s }) => s) };
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
      return rpc(s, message.method, params);
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
    !['popup/index.html', 'options/index.html', 'manager/index.html'].includes(sender.url.slice(root.length).split(/[?#]/)[0])) return undefined;
  return handle(message).then(data => ({ ok: true, data }), error => ({ ok: false, error: error.message }));
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
  await handoff.start(item, s, context);
  await badge();
}
const report = () => notify('后台操作失败，请打开交接记录核对；浏览器下载未被主动删除').catch(() => {});
browser.downloads.onCreated.addListener(item => { consider(item).catch(report); });
browser.downloads.onChanged.addListener(delta => {
  if (delta.state?.current === 'in_progress' || delta.filename || delta.url) {
    browser.downloads.search({ id: delta.id }).then(items => items[0] && consider(items[0])).catch(report);
  }
});
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'bridge-status') ready.then(async () => { tracker.prune(); await handoff.recover(); await refresh(); }).catch(report);
});
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'send-link') return;
  ready.then(async () => {
    const s = server();
    let context;
    if (s.forwardCookies && !info.linkUrl.startsWith('magnet:')) {
      // Private or cross-site manual sends need observed network context; do not synthesize cookies.
      if (tab.incognito || info.frameId !== 0 || !tab.cookieStoreId || new URL(tab.url).origin !== new URL(info.linkUrl).origin) {
        throw new Error('此链接无法可靠读取登录态；请关闭 Cookie 转发后发送，或从原页面下载');
      }
      const cookies = await browser.cookies.getAll({ url: info.linkUrl, storeId: tab.cookieStoreId, firstPartyDomain: null, partitionKey: {} });
      context = { cookie: selectCookies(cookies, tab.url), referer: info.pageUrl, userAgent: navigator.userAgent };
    }
    const results = await addLinks({ serverId: s.id, links: [info.linkUrl] }, context);
    await notify(results[0].state === 'added' ? '已发送到 aria2' : `发送结果待核对，GID：${results[0].gid}；请勿直接重复发送`);
  }).catch(error => notify(error.message));
});
ready.then(async () => { await handoff.recover(); await refresh(); }).catch(report);
