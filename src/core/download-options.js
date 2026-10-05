export function downloadOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('下载选项无效');
  const { dir = '', out = '', paused = false } = input;
  if (typeof dir !== 'string' || dir.length > 4096 || /[\r\n\0]/.test(dir)) throw new Error('下载目录无效');
  if (typeof out !== 'string' || out.length > 255 || /[\\/\r\n\0]/.test(out) || ['.', '..'].includes(out.trim())) throw new Error('文件名不能包含路径分隔符或换行');
  if (typeof paused !== 'boolean') throw new Error('暂停选项无效');
  return { dir: dir.trim(), out: out.trim(), paused };
}
export class DownloadPrompts {
  constructor(windows, url) { this.windows = windows; this.url = url; this.pending = new Map(); }
  async open(details) {
    const id = crypto.randomUUID();
    let settle;
    const result = new Promise(resolve => { settle = resolve; });
    const entry = { details, settle, windowId: null };
    this.pending.set(id, entry);
    try {
      const window = await this.windows.create({ url: `${this.url}?id=${id}`, type: 'popup', width: 620, height: 720 });
      entry.windowId = window.id;
      await this.windows.get(window.id);
      if (!this.pending.has(id)) await this.windows.remove(window.id).catch(() => {});
    } catch { this.pending.delete(id); settle(null); }
    return result;
  }
  get(id) { const entry = this.pending.get(id); if (!entry) throw new Error('询问已结束，浏览器下载已恢复或已处理'); return entry.details; }
  finish(id, choice) {
    const entry = this.pending.get(id);
    if (!entry) throw new Error('询问已结束，浏览器下载已恢复或已处理');
    this.pending.delete(id); entry.settle(choice);
    if (entry.windowId !== null) this.windows.remove(entry.windowId).catch(() => {});
  }
  closed(windowId) { for (const [id, entry] of this.pending) if (entry.windowId === windowId) { this.pending.delete(id); entry.settle(null); } }
  changed(downloadId) { for (const [id, entry] of this.pending) if (entry.details.downloadId === downloadId) this.finish(id, null); }
}
