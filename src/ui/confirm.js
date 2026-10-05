import { $, send, serverOptions } from './common.js';
const id = new URL(location.href).searchParams.get('id');
let config;
function lock(value) { for (const element of document.querySelectorAll('input, select, button')) element.disabled = value; }
function status(note) { $('#status').textContent = note; }
async function init() {
  const [details, publicConfig] = await Promise.all([send('CONFIRM_GET', { id }), send('CONFIG_PUBLIC')]);
  config = publicConfig;
  serverOptions($('#server'), { ...config, defaultServerId: details.serverId });
  $('#dir').value = details.dir; $('#out').value = details.filename;
  $('#source').textContent = details.source;
  $('#size').textContent = details.size > 0 ? `${(details.size / 1048576).toFixed(2)} MiB` : '大小未知';
  if (!details.downloadId) { $('#browser').textContent = '取消发送'; $('.info-note').textContent = '目录属于 aria2 所在机器。关闭此窗口会取消发送，不创建 aria2 任务。'; }
  status('确认后才会发送，当前尚未提交 aria2'); lock(false);
}
$('#server').addEventListener('change', () => { $('#dir').value = config.servers.find(s => s.id === $('#server').value).dir; });
$('#confirmation').addEventListener('submit', async event => {
  event.preventDefault(); lock(true);
  try { await send('CONFIRM_DECIDE', { id, serverId: $('#server').value, options: { dir: $('#dir').value, out: $('#out').value, paused: $('#paused').checked } }); }
  catch (error) { status(error.message); lock(false); }
});
$('#browser').addEventListener('click', async () => {
  lock(true); try { await send('CONFIRM_DECIDE', { id, browser: true }); } catch (error) { status(error.message); lock(false); }
});
$('#test').addEventListener('click', async () => {
  lock(true); try { const result = await send('TEST', { serverId: $('#server').value }); status(`连接成功 · aria2 ${result.version}`); } catch (error) { status(error.message); } finally { lock(false); }
});
init().catch(error => status(error.message));
