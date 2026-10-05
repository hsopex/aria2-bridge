import { $, send, showHandoffs, textStatus } from './common.js';
let config;
const field = (label, value, type = 'text') => {
  const node = document.createElement('label'); const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement('input'); input.type = type;
  if (type === 'checkbox') input.checked = value; else input.value = value;
  node.append(title, input); return { node, input };
};
const editors = new Map();
function render() {
  editors.clear(); $('#servers').replaceChildren();
  for (const server of config.servers) {
    const card = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = server.name;
    card.append(legend);
    const inputs = {};
    for (const [key, label, type] of [['name', '服务名称', 'text'], ['url', 'HTTP(S) JSON-RPC 地址', 'url'], ['secret', 'Secret（仅保存在本地）', 'password'], ['dir', '默认目录（aria2 所在机器的路径）', 'text'], ['forwardCookies', '向此服务转发 Cookie（仅来源可靠时）', 'checkbox']]) {
      const f = field(label, server[key], type); inputs[key] = f.input; card.append(f.node);
    }
    inputs.secret.autocomplete = 'new-password';
    const selected = field('默认服务', config.defaultServerId === server.id, 'radio');
    selected.input.name = 'default-server'; selected.input.checked = config.defaultServerId === server.id;
    selected.input.addEventListener('change', () => { config.defaultServerId = server.id; });
    card.append(selected.node);
    const test = document.createElement('button'); test.type = 'button'; test.textContent = '保存并测试连接';
    test.addEventListener('click', async () => {
      test.disabled = true;
      try { await save(); const v = await send('TEST', { serverId: server.id }); textStatus(`连接成功 · aria2 ${v.version}`); }
      catch (e) { textStatus(e.message); } finally { test.disabled = false; }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '删除服务';
    remove.addEventListener('click', () => {
      read(); config.servers = config.servers.filter(s => s.id !== server.id);
      if (!config.servers.length) { textStatus('至少保留一个 RPC 服务'); config.servers = [server]; }
      if (config.defaultServerId === server.id) config.defaultServerId = config.servers[0].id;
      render();
    });
    card.append(test, remove); $('#servers').append(card); editors.set(server.id, inputs);
  }
  $('#enabled').checked = config.enabled;
  for (const key of ['allowDomains', 'denyDomains', 'allowExtensions', 'denyExtensions']) $(`#${key}`).value = config.filters[key].join('\n');
}
function read() {
  config = { ...config, enabled: $('#enabled').checked,
    servers: config.servers.map(s => { const e = editors.get(s.id); return { ...s, ...Object.fromEntries(Object.entries(e).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value])) }; }),
    filters: Object.fromEntries(['allowDomains', 'denyDomains', 'allowExtensions', 'denyExtensions'].map(key => [key, $(`#${key}`).value.split(/[\n,]/).map(v => v.trim()).filter(Boolean)])),
  };
}
async function save() { read(); config = await send('CONFIG_SAVE', { config }); textStatus('配置已保存'); }
async function handoffs() { showHandoffs(await send('HANDOFFS'), $('#handoffs'), handoffs); }
$('#settings').addEventListener('submit', event => { event.preventDefault(); save().catch(e => textStatus(e.message)); });
$('#new').addEventListener('click', () => {
  read(); config.servers.push({ id: crypto.randomUUID(), name: '新服务', url: 'http://127.0.0.1:6800/jsonrpc', secret: '', dir: '', forwardCookies: false }); render();
});
$('#export').addEventListener('click', async () => {
  try {
    const result = await send('CONFIG_EXPORT');
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'aria2-bridge-config.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    textStatus('已导出，不包含 Secret；自动接管设为关闭');
  } catch (e) { textStatus(e.message); }
});
$('#import').addEventListener('change', async event => {
  try {
    const file = event.target.files[0]; if (!file || file.size > 100000) throw new Error('配置文件过大');
    const input = JSON.parse(await file.text());
    config = await send('CONFIG_SAVE', { config: { ...input, enabled: false } }); render(); textStatus('已导入，请填写 Secret 并测试连接');
  } catch (e) { textStatus(e.message); }
  finally { event.target.value = ''; }
});
$('#manager').addEventListener('click', () => send('OPEN_MANAGER').catch(e => textStatus(e.message)));
$('#refresh-handoffs').addEventListener('click', () => handoffs().catch(e => textStatus(e.message)));
send('CONFIG_GET').then(data => { config = data; render(); return handoffs(); }).catch(e => textStatus(e.message));
