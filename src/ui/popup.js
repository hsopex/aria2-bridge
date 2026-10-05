import { downloadCounts } from '../core/toolbar.js';
import { $, send, speed, serverOptions, textStatus } from './common.js';
let config;
function updateTaskCount(s) {
  const counts = downloadCounts(s);
  $('#tasks').textContent = counts ? `未完成 ${Math.min(counts.total, 99)}${counts.total > 99 ? '（已达显示上限）' : ''} · 下载中 ${counts.active} · 等待／暂停 ${counts.waiting}` : '任务数量未知';
}
async function update() {
  const s = await send('STATUS', { refresh: true });
  updateTaskCount(s);
  textStatus(`${s.note} · ↓ ${speed(s.downloadSpeed)} · ↑ ${speed(s.uploadSpeed)}`);
}
async function init() {
  config = await send('CONFIG_PUBLIC');
  serverOptions($('#server'), config);
  $('#enabled').checked = config.enabled;
  $('#dir').value = config.servers.find(s => s.id === config.defaultServerId).dir;
  await update();
  const records = await send('HANDOFFS');
  const pending = records.filter(r => ['pending', 'conflict', 'accepted', 'cancelling', 'cancelled', 'submitting'].includes(r.state)).length;
  $('#pending').textContent = pending ? `${pending} 个交接待确认：在设置页核对` : '';
}
$('#enabled').addEventListener('change', async () => {
  try { config.enabled = await send('SET_ENABLED', { enabled: $('#enabled').checked }); }
  catch (error) { $('#enabled').checked = config.enabled; textStatus(error.message); }
});
$('#server').addEventListener('change', async () => {
  try {
    await send('SELECT_SERVER', { serverId: $('#server').value });
    config = await send('CONFIG_PUBLIC');
    $('#enabled').checked = false; $('#dir').value = config.servers.find(s => s.id === config.defaultServerId).dir; await update();
  } catch (error) { $('#server').value = config.defaultServerId; textStatus(error.message); }
});
$('#test').addEventListener('click', async () => {
  try { const version = await send('TEST', { serverId: $('#server').value }); textStatus(`连接成功 · aria2 ${version.version}，现在可以开启接管`); }
  catch (error) { textStatus(error.message); }
});
$('#links').addEventListener('submit', async event => {
  event.preventDefault(); $('#add').disabled = true;
  try {
    const result = await send('ADD', { serverId: $('#server').value, options: { dir: $('#dir').value, out: $('#out').value, paused: $('#paused').checked }, links: $('#urls').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean) });
    textStatus(result.map(r => `${r.state === 'added' ? '已添加' : r.state === 'rejected' ? '被拒绝' : '结果待确认，请勿重复发送'} · ${r.gid}`).join('\n'));
    $('#urls').value = '';
    send('STATUS', { refresh: true }).then(updateTaskCount).catch(() => {});
  } catch (error) { textStatus(error.message); }
  finally { $('#add').disabled = false; }
});
$('#manager').addEventListener('click', () => send('OPEN_MANAGER').then(() => window.close()).catch(e => textStatus(e.message)));
$('#sidebar').addEventListener('click', () => browser.sidebarAction.open().then(() => window.close()).catch(e => textStatus(e.message)));
$('#options').addEventListener('click', () => browser.runtime.openOptionsPage());
init().catch(e => textStatus(e.message));
