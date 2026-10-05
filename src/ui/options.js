import { shortcutActions, normalizeShortcut } from '../core/shortcuts.js';
import { preferenceGroups } from '../core/manager-preferences.js';
import { $, send, showHandoffs } from './common.js';
import { setTheme } from './theme.js';
let config;
let dirty = false;
let shortcutsDirty = false;
let busy = false;
const editors = new Map();
function status(message, kind = 'success') {
  $('#status').textContent = message;
  $('#status').dataset.kind = kind;
}
function setDirty(value) {
  dirty = value;
  $('#save-state').textContent = value ? '有未保存的更改' : '连接与规则已保存';
  $('#save-state').dataset.state = value ? 'dirty' : 'saved';
}
function field(label, value, type = 'text', hint = '') {
  const node = document.createElement('label'); node.className = 'field';
  const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement('input'); input.type = type;
  if (['checkbox', 'radio'].includes(type)) {
    input.checked = value; node.classList.add('toggle'); node.append(input, title);
  } else { input.value = value; node.append(title, input); }
  if (hint) {
    const help = document.createElement('small'); help.className = 'field-hint'; help.textContent = hint;
    help.id = `hint-${crypto.randomUUID()}`; input.setAttribute('aria-describedby', help.id); node.append(help);
  }
  return { node, input };
}
function updateTitles() {
  for (const [id, e] of editors) {
    const name = e.inputs.name.value.trim();
    if (name) e.title.dataset.userContent = ''; else delete e.title.dataset.userContent;
    e.title.textContent = name || '未命名服务';
    e.badge.hidden = config.defaultServerId !== id;
    e.card.classList.toggle('is-default', config.defaultServerId === id);
  }
}
function render() {
  editors.clear(); $('#servers').replaceChildren();
  for (const server of config.servers) {
    const card = document.createElement('fieldset'); card.className = 'server-card';
    const legend = document.createElement('legend'); const title = document.createElement('span'); title.dataset.userContent = '';
    const badge = document.createElement('span'); badge.className = 'default-badge'; badge.textContent = '默认';
    legend.append(title, badge); card.append(legend);
    const grid = document.createElement('div'); grid.className = 'server-grid';
    const inputs = {};
    for (const [key, label, type, hint] of [
      ['name', '服务名称', 'text', '给这台 aria2 起一个易于识别的名字。'],
      ['url', 'RPC 地址', 'url', 'HTTP(S) JSON-RPC，例如 http://127.0.0.1:6800/jsonrpc'],
      ['secret', 'RPC Secret', 'password', '未设置 Secret 时可留空。'],
      ['dir', '默认下载目录', 'text', 'aria2 所在机器的路径，留空使用服务默认目录。'],
    ]) {
      const f = field(label, server[key], type, hint); inputs[key] = f.input; grid.append(f.node);
    }
    inputs.name.maxLength = 80; inputs.secret.autocomplete = 'new-password'; inputs.url.required = true;
    inputs.name.placeholder = '例如：家里的 NAS'; inputs.url.placeholder = 'http://127.0.0.1:6800/jsonrpc'; inputs.dir.placeholder = '/downloads';
    card.append(grid);
    const toggles = document.createElement('div'); toggles.className = 'server-toggles';
    const selected = field('设为默认服务', config.defaultServerId === server.id, 'radio');
    selected.input.name = 'default-server'; selected.input.value = server.id;
    selected.input.addEventListener('change', () => { config.defaultServerId = server.id; updateTitles(); });
    const cookies = field('转发来源 Cookie', server.forwardCookies, 'checkbox'); inputs.forwardCookies = cookies.input;
    toggles.append(selected.node, cookies.node); card.append(toggles);
    const footer = document.createElement('div'); footer.className = 'server-footer';
    const test = document.createElement('button'); test.type = 'button'; test.className = 'secondary'; test.textContent = '保存并测试连接';
    const feedback = document.createElement('span'); feedback.className = 'server-feedback'; feedback.setAttribute('role', 'status'); feedback.textContent = '尚未测试';
    test.addEventListener('click', () => persist(server.id).catch(e => status(e.message, 'error')));
    for (const key of ['url', 'secret']) inputs[key].addEventListener('input', () => { feedback.textContent = '配置已修改，请重新测试'; delete feedback.dataset.kind; });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '删除'; remove.dataset.action = 'remove';
    remove.disabled = config.servers.length === 1;
    remove.addEventListener('click', () => {
      if (config.servers.length === 1) return;
      read(); config.servers = config.servers.filter(s => s.id !== server.id);
      if (config.defaultServerId === server.id) config.defaultServerId = config.servers[0].id;
      render(); setDirty(true); status('服务已从编辑列表移除，保存后生效');
    });
    footer.append(test, feedback, remove); card.append(footer);
    $('#servers').append(card); editors.set(server.id, { inputs, card, title, badge, feedback });
  }
  $('#enabled').checked = config.enabled;
  for (const key of ['allowDomains', 'denyDomains', 'allowExtensions', 'denyExtensions']) $(`#${key}`).value = config.filters[key].join('\n');
  updateTitles(); setBusy(false);
}
function read() {
  config = { ...config, enabled: $('#enabled').checked,
    servers: config.servers.map(s => { const e = editors.get(s.id).inputs; return { ...s, ...Object.fromEntries(Object.entries(e).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value])) }; }),
    filters: Object.fromEntries(['allowDomains', 'denyDomains', 'allowExtensions', 'denyExtensions'].map(key => [key, $(`#${key}`).value.split(/[\n,]/).map(v => v.trim()).filter(Boolean)])),
  };
}
function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('#settings input, #settings textarea, #settings button, #save')) control.disabled = value;
  if (!value) for (const button of document.querySelectorAll('[data-action="remove"]')) button.disabled = config.servers.length === 1;
  $('#save').textContent = value ? '正在保存…' : '保存设置';
}
async function persist(testId) {
  if (busy || !config) return;
  if (!$('#settings').reportValidity()) return;
  read(); setBusy(true);
  const feedback = testId ? editors.get(testId).feedback : null;
  if (feedback) { feedback.textContent = '正在保存并连接…'; delete feedback.dataset.kind; }
  try {
    config = await send('CONFIG_SAVE', { config }); $('#enabled').checked = config.enabled; setDirty(false); updateTitles(); status('配置已保存');
    if (testId) {
      const v = await send('TEST', { serverId: testId });
      feedback.textContent = `连接成功 · aria2 ${v.version}`; feedback.dataset.kind = 'success'; status('连接成功，现在可以启用自动接管');
    }
  } catch (error) {
    if (feedback) { feedback.textContent = error.message; feedback.dataset.kind = 'error'; }
    throw error;
  } finally { setBusy(false); }
}
async function handoffs() {
  showHandoffs(await send('HANDOFFS'), $('#handoffs'), handoffs);
  if (!$('#handoffs').querySelector('article')) $('#handoffs').classList.add('empty-state');
  else $('#handoffs').classList.remove('empty-state');
}
$('#settings').addEventListener('input', () => { if (config && !busy) { setDirty(true); updateTitles(); $('#status').textContent = ''; } });
$('#settings').addEventListener('change', () => { if (config && !busy) setDirty(true); });
$('#settings').addEventListener('submit', event => { event.preventDefault(); persist().catch(e => status(e.message, 'error')); });
$('#new').addEventListener('click', () => {
  if (!config || busy) return;
  read();
  if (config.servers.length >= 20) { status('最多可配置 20 个服务', 'error'); return; }
  const id = crypto.randomUUID();
  config.servers.push({ id, name: '新服务', url: 'http://127.0.0.1:6800/jsonrpc', secret: '', dir: '', forwardCookies: false });
  render(); setDirty(true); editors.get(id).inputs.name.focus();
});
$('#theme').addEventListener('change', async () => {
  $('#theme').disabled = true;
  try { await setTheme($('#theme').value); status('界面主题已自动保存'); }
  catch { status('主题保存失败，请重试', 'error'); }
  finally { $('#theme').disabled = false; }
});
$('#export').addEventListener('click', async () => {
  try {
    const result = await send('CONFIG_EXPORT');
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'aria2-bridge-config.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000); status('已导出保存的配置，不包含 Secret；导出文件中自动接管为关闭');
  } catch (e) { status(e.message, 'error'); }
});
$('#import').addEventListener('change', async event => {
  try {
    if (busy) throw new Error('请等待当前保存操作结束');
    const file = event.target.files[0]; if (!file || file.size > 100000) throw new Error('配置文件过大');
    const input = JSON.parse(await file.text());
    setBusy(true);
    config = await send('CONFIG_SAVE', { config: { ...input, enabled: false } }); render(); setDirty(false); status('已导入，请填写 Secret 并测试连接');
  } catch (e) { status(e.message, 'error'); }
  finally { if (config) setBusy(false); event.target.value = ''; }
});
$('#manager').addEventListener('click', () => send('OPEN_MANAGER').catch(e => status(e.message, 'error')));
$('#refresh-handoffs').addEventListener('click', async () => {
  $('#refresh-handoffs').disabled = true;
  try { await handoffs(); } catch (e) { status(e.message, 'error'); }
  finally { $('#refresh-handoffs').disabled = false; }
});
function navigation() {
  const current = location.hash || '#appearance';
  for (const link of document.querySelectorAll('.settings-sidebar nav a')) {
    if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', navigation); navigation();
window.addEventListener('beforeunload', event => { if (dirty || shortcutsDirty) { event.preventDefault(); event.returnValue = ''; } });
send('CONFIG_GET').then(async data => {
  config = data; render(); setDirty(false); $('#export').disabled = false; $('#import').disabled = false; await handoffs();
}).catch(e => status(e.message, 'error'));

const preferenceControls = new Map();
function renderManagerPreferences(values) {
  for (const [key, input] of preferenceControls) {
    const value = values[key];
    if (input.type === 'checkbox') input.checked = value; else input.value = String(value);
  }
}
async function initializeManagerPreferences() {
  const values = await send('MANAGER_PREFERENCES_GET');
  $('#manager-preference-fields').replaceChildren();
  for (const group of preferenceGroups) {
    const title = document.createElement('h3'); title.textContent = group.label;
    const grid = document.createElement('div'); grid.className = 'server-grid preference-grid';
    for (const f of group.fields.filter(f => f.key !== 'language')) {
      const label = document.createElement('label'); label.className = f.type === 'boolean' ? 'toggle' : 'field';
      const span = document.createElement('span'); span.textContent = f.label;
      const input = document.createElement(f.type === 'select' ? 'select' : 'input');
      input.id = `manager-${f.key}`;
      if (f.type === 'select') for (const [value, text] of f.options) {
        const option = document.createElement('option'); option.value = String(value); option.textContent = text; input.append(option);
      }
      else input.type = f.type === 'boolean' ? 'checkbox' : 'text';
      if (f.type === 'text') input.maxLength = 500;
      if (f.type === 'boolean') label.append(input, span); else label.append(span, input);
      if (f.hint) { const hint = document.createElement('small'); hint.className = 'field-hint'; hint.textContent = f.hint; label.append(hint); }
      preferenceControls.set(f.key, input); grid.append(label);
      input.addEventListener('change', async () => {
        const previous = values[f.key];
        const value = f.type === 'boolean' ? input.checked : typeof f.default === 'number' ? Number(input.value) : input.value;
        input.disabled = true;
        try {
          if (f.key === 'browserNotification' && value && window.Notification?.permission !== 'granted') {
            if (!window.Notification || await window.Notification.requestPermission() !== 'granted') throw new Error('请在 Firefox 中允许此扩展显示通知后重试');
          }
          const saved = await send('MANAGER_PREFERENCES_PATCH', { patch: { [f.key]: value } });
          Object.assign(values, saved);
          $('#manager-preference-status').textContent = `${f.label}已保存`;
          $('#manager-preference-status').dataset.kind = 'success';
        } catch (error) {
          if (input.type === 'checkbox') input.checked = previous; else input.value = String(previous);
          $('#manager-preference-status').textContent = error.message;
          $('#manager-preference-status').dataset.kind = 'error';
        } finally { input.disabled = false; }
      });
    }
    $('#manager-preference-fields').append(title, grid);
  }
  $('#manager-language').disabled = false;
  preferenceControls.set('language', $('#manager-language'));
  renderManagerPreferences(values);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.managerPreferences) {
      Object.assign(values, changes.managerPreferences.newValue.options);
      renderManagerPreferences(values);
    }
  });
}
initializeManagerPreferences().catch(e => { $('#manager-preference-status').textContent = e.message; });

async function initializeShortcuts() {
  const [{ os }, state] = await Promise.all([browser.runtime.getPlatformInfo(), send('SHORTCUTS_GET')]);
  const inputs = new Map();
  let saved = state;
  let saving = false;
  function shortcutStatus(message, kind = 'success') {
    shortcutsDirty = [...inputs].some(([name, input]) => input.value !== saved.bindings[name]);
    $('#shortcut-status').textContent = message; $('#shortcut-status').dataset.kind = kind;
  }
  function populate(value) {
    $('#shortcuts-enabled').checked = value.enabled;
    for (const [name, input] of inputs) input.value = value.bindings[name];
    shortcutsDirty = false;
  }
  function lock(value) {
    saving = value;
    for (const input of document.querySelectorAll('#shortcut-settings input, #shortcut-settings button')) input.disabled = value;
  }
  for (const action of shortcutActions) {
    const label = document.createElement('label'); label.className = 'field';
    const span = document.createElement('span'); span.textContent = action.label;
    const input = document.createElement('input'); input.type = 'text'; input.id = `shortcut-${action.name}`; input.maxLength = 80; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = '未绑定 · 按组合键或输入';
    input.addEventListener('keydown', event => {
      if (['Tab', 'Enter', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      if (event.key === 'Escape') { event.preventDefault(); input.value = saved.bindings[action.name]; shortcutStatus('已恢复此快捷键'); input.blur(); return; }
      if (['Backspace', 'Delete'].includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); input.value = ''; shortcutStatus('有未保存的快捷键更改'); return; }
      if (!event.ctrlKey && !event.altKey && !event.metaKey && !/^F\d+$/.test(event.key)) return;
      event.preventDefault();
      const names = { ',': 'Comma', '.': 'Period', ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
      const key = names[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
      const parts = [event.ctrlKey ? (os === 'mac' ? 'MacCtrl' : 'Ctrl') : '', event.altKey ? 'Alt' : '', event.metaKey ? 'Command' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean);
      try { input.value = normalizeShortcut(parts.join('+'), os); shortcutStatus('有未保存的快捷键更改'); }
      catch (error) { shortcutStatus(error.message, 'error'); }
    });
    input.addEventListener('input', () => shortcutStatus('有未保存的快捷键更改'));
    inputs.set(action.name, input); label.append(span, input); $('#shortcut-fields').append(label);
  }
  populate(state); lock(false);
  browser.storage.onChanged.addListener((changes, area) => {
    const next = changes.shortcuts?.newValue;
    if (area !== 'local' || !next) return;
    const previous = saved; saved = next;
    $('#shortcuts-enabled').checked = next.enabled;
    for (const [name, input] of inputs) if (input.value === previous.bindings[name]) input.value = next.bindings[name];
    if (!saving) shortcutStatus(next.enabled ? '快捷键已启用' : '快捷键已停用，绑定已保留');
  });
  $('#shortcut-settings').addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return;
    const next = { version: 1, enabled: $('#shortcuts-enabled').checked, bindings: Object.fromEntries([...inputs].map(([name, input]) => [name, input.value])) };
    lock(true);
    try { saved = await send('SHORTCUTS_SAVE', { shortcuts: next }); populate(saved); shortcutStatus(saved.enabled ? '快捷键已保存并启用' : '快捷键已保存并停用，按键已释放'); }
    catch (error) { shortcutStatus(error.message, 'error'); }
    finally { lock(false); }
  });
  // Apply only the master switch immediately; editable bindings use their own save.
  $('#shortcuts-enabled').addEventListener('change', async () => {
    const enabled = $('#shortcuts-enabled').checked; lock(true);
    try { saved = await send('SHORTCUTS_SAVE', { shortcuts: { ...saved, enabled } }); shortcutStatus(enabled ? '快捷键已启用，编辑的按键需保存后生效' : '快捷键已停用，绑定已保留'); }
    catch (error) { $('#shortcuts-enabled').checked = saved.enabled; shortcutStatus(error.message, 'error'); }
    finally { lock(false); }
  });
  $('#suggest-shortcuts').addEventListener('click', () => {
    for (const action of shortcutActions) inputs.get(action.name).value = action.suggested;
    shortcutStatus('已填入建议按键，保存后生效');
  });
}
initializeShortcuts().catch(e => { $('#shortcut-status').textContent = e.message; });

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config?.newValue && config && !dirty && !busy) {
    config = changes.config.newValue; render(); setDirty(false);
  }
});

$('#manager-language').addEventListener('change', async () => {
  const input = $('#manager-language'); const previous = document.documentElement.lang === 'en' ? 'en' : 'zh_Hans'; input.disabled = true;
  try { await send('MANAGER_PREFERENCES_PATCH', { patch: { language: input.value } }); status('界面语言已自动保存'); }
  catch (error) { input.value = previous; status(error.message, 'error'); }
  finally { input.disabled = false; }
});
