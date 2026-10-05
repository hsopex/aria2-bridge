import { initializeLanguage } from './language.js';
initializeLanguage();
export async function send(type, fields = {}) {
  const response = await browser.runtime.sendMessage({ type, ...fields });
  if (!response?.ok) throw new Error(response?.sourceError || response?.error || '后台未响应');
  return response.data;
}
export const $ = selector => document.querySelector(selector);
export function textStatus(value) { $('#status').textContent = value; }
export const speed = value => {
  const n = Number(value) || 0;
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB/s` : `${(n / 1024).toFixed(1)} KiB/s`;
};
export function serverOptions(select, config) {
  select.replaceChildren(...config.servers.map(s => {
    const option = document.createElement('option');
    option.dataset.userContent = ''; option.value = s.id; option.textContent = s.name; return option;
  }));
  select.value = config.defaultServerId;
}
export function showHandoffs(records, container, reload) {
  container.replaceChildren();
  const active = new Set(['preparing', 'submitting', 'pending', 'accepted', 'cancelling', 'cancelled', 'conflict']);
  for (const r of records.slice(0, 50)) {
    const row = document.createElement('article');
    const title = document.createElement('strong'); if (r.filename) title.dataset.userContent = ''; title.textContent = r.filename || `下载 ${r.downloadId}`;
    const note = document.createElement('p'); note.textContent = `${r.note || r.state} · GID ${r.gid}`;
    row.append(title, note);
    if (active.has(r.state)) {
      for (const [label, type] of [['重新查询', 'RECHECK'], ['继续浏览器下载', 'CONTINUE']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await send(type, { downloadId: r.downloadId }); await reload(); }
          catch (error) { note.textContent = error.message; }
          finally { button.disabled = false; }
        });
        row.append(button);
      }
    }
    container.append(row);
  }
  if (!records.length) container.textContent = '暂无自动交接记录';
}
