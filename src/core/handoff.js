import { makeGid } from './rpc.js';
import { requestOptions } from './requests.js';

export const activeStates = new Set(['awaiting', 'preparing', 'submitting', 'pending', 'accepted', 'cancelling', 'cancelled', 'conflict', 'abandoned']);

export class Journal {
  constructor(storage) { this.storage = storage; this.records = {}; this.queue = Promise.resolve(); }
  async load() { this.records = (await this.storage.get('handoffs')).handoffs || {}; }
  async put(record) {
    const write = this.queue.then(async () => {
      const next = { ...this.records, [record.downloadId]: structuredClone(record) };
      const terminal = Object.values(next).filter(r => !activeStates.has(r.state)).sort((a, b) => b.createdAt - a.createdAt);
      for (const old of terminal.slice(200)) delete next[old.downloadId];
      await this.storage.set({ handoffs: next });
      this.records = next;
      return record;
    });
    this.queue = write.catch(() => {});
    return write;
  }
  async set(record, state, note = '') { return this.put({ ...record, state, note, updatedAt: Date.now() }); }
}

export class Handoff {
  constructor({ downloads, journal, call, server, notify = async () => {} }) {
    Object.assign(this, { downloads, journal, call, server, notify });
    this.locks = new Map();
  }
  locked(id, action) {
    if (this.locks.has(id)) return this.locks.get(id);
    const promise = action().finally(() => this.locks.delete(id));
    this.locks.set(id, promise);
    return promise;
  }
  async item(id) { return (await this.downloads.search({ id }))[0]; }
  async save(record, state, note) {
    const next = await this.journal.set(record, state, note);
    if (['pending', 'conflict', 'retry'].includes(state)) await this.notify(note || '交接待确认');
    return next;
  }
  start(item, server, context, decide) {
    return this.locked(item.id, async () => {
      if (this.journal.records[item.id] || item.state !== 'in_progress' || item.paused || !(item.bytesReceived > 0)) return;
      let r = await this.journal.put({ downloadId: item.id, serverId: server.id, endpoint: server.url,
        gid: makeGid(), filename: item.filename.split(/[\\/]/).pop(), state: 'preparing', createdAt: Date.now(), updatedAt: Date.now() });
      try { await this.downloads.pause(item.id); } catch {
        return this.save(r, 'skipped', '暂停失败，保留浏览器下载');
      }
      let overrides = {};
      if (decide) {
        const paused = await this.item(item.id);
        if (!paused?.paused) return this.resume(r, '浏览器暂停状态未确认，未提交 aria2');
        try {
          r = await this.save(r, 'awaiting', '等待选择下载方式，尚未发送 aria2');
          const choice = await decide(item, server);
          if (!choice) return this.resume(r, '已选择浏览器下载，未提交 aria2');
          server = choice.server; overrides = choice.options;
          r = { ...r, serverId: server.id, endpoint: server.url, filename: overrides.out || r.filename, startPaused: choice.paused };
        } catch { return this.resume(r, '询问失败，已恢复浏览器下载'); }
      }
      // Persist submitting before the first and only addUri. No credentials or cookies enter the journal.
      try { r = await this.save(r, 'submitting'); } catch {
        await this.downloads.resume(item.id).catch(() => this.notify('无法恢复浏览器下载，请从原页面重试'));
        throw new Error('交接状态无法保存，未提交 aria2');
      }
      const current = await this.item(item.id);
      if (!current || !current.paused) {
        if (current?.state === 'complete') return this.save(r, 'skipped', '浏览器下载已完成，未提交 aria2');
        return this.resume(r, '浏览器暂停状态未确认，未提交 aria2');
      }
      try {
        const options = { ...requestOptions(context, server, item.filename), ...overrides, gid: r.gid, pause: 'true' };
        const gid = await this.call(server, 'aria2.addUri', [[context.url], options]);
        if (gid !== r.gid) return this.save(r, 'pending', '返回 GID 不一致，交接待确认');
      } catch (error) {
        if (error.kind === 'rejected') return this.resume(r, '提交失败，已恢复浏览器下载');
        return this.save(r, 'pending', 'RPC 响应丢失，交接待确认；不会重复提交');
      }
      r = await this.save(r, 'accepted');
      return this.finish(r, server);
    });
  }
  async resume(r, note) {
    const item = await this.item(r.downloadId);
    if (item && (item.state === 'in_progress' || (item.state === 'interrupted' && item.canResume))) {
      try { if (item.paused || item.state === 'interrupted') await this.downloads.resume(r.downloadId); }
      catch { return this.save(r, 'retry', '浏览器恢复失败，请从原页面重试'); }
      return this.save(r, 'resumed', note);
    }
    return this.save(r, 'retry', '浏览器任务已结束，请从原页面重试');
  }
  async lookup(r, server) {
    try { return await this.call(server, 'aria2.tellStatus', [r.gid, ['gid', 'status']]); }
    catch (error) {
      if (error.kind !== 'rejected' || error.code !== 1) throw error;
      // Authentication failures also use code 1. Confirm authorization before inferring absence.
      await this.call(server, 'aria2.getVersion', []);
      return null;
    }
  }
  async stop(r, server) {
    try {
      const task = await this.lookup(r, server);
      if (!task) return;
      if (['complete', 'removed', 'error'].includes(task.status)) return;
      await this.call(server, 'aria2.forceRemove', [r.gid]);
    } catch (error) {
      // aria2 uses code 1 for many failures. Only tellStatus in this context means absence;
      // never treat a forceRemove failure as successful cleanup.
      throw error;
    }
  }
  async finish(r, server) {
    let item = await this.item(r.downloadId);
    if (r.state !== 'cancelled') {
      if (r.state === 'cancelling' && item?.state === 'interrupted' && item.error === 'USER_CANCELED' && !item.paused) {
        r = await this.save(r, 'cancelled'); // crash after cancel, before recording it
      } else if (!item || item.state === 'complete' || !item.paused) {
        try { await this.stop(r, server); } catch { return this.save(r, 'conflict', '浏览器任务已改变，aria2 停止状态待确认'); }
        if (item?.state === 'complete' || item?.error === 'USER_CANCELED') return this.save(r, 'skipped', '浏览器任务已完成或被用户取消，aria2 已停止');
        return this.save(r, 'retry', '浏览器任务已改变，aria2 任务已停止；请检查下载记录');
      } else {
        r = await this.save(r, 'cancelling');
        try { await this.downloads.cancel(r.downloadId); }
        catch {
          try { await this.stop(r, server); } catch { return this.save(r, 'conflict', '浏览器取消失败，aria2 停止状态待确认'); }
          return this.resume(r, '浏览器取消失败，aria2 已停止，已恢复浏览器下载');
        }
        r = await this.save(r, 'cancelled');
      }
    }
    try {
      const task = await this.call(server, 'aria2.tellStatus', [r.gid, ['gid', 'status']]);
      if (task.status === 'paused' && !r.startPaused) await this.call(server, 'aria2.unpause', [r.gid]);
      else if (!['active', 'waiting', 'complete', ...(r.startPaused ? ['paused'] : [])].includes(task.status)) return this.save(r, 'retry', 'aria2 任务已停止，请从原页面重试');
      return this.save(r, 'transferred', '已交给 aria2；浏览器历史记录保留');
    } catch { return this.save(r, 'cancelled', '浏览器已取消，aria2 启动状态待确认'); }
  }
  reconcile(id, continueBrowser = false) {
    return this.locked(id, async () => {
      let r = this.journal.records[id];
      if (!r || !activeStates.has(r.state)) return r;
      if (['preparing', 'awaiting'].includes(r.state)) return this.resume(r, '后台重启，未提交 aria2，已恢复浏览器下载');
      const server = this.server(r.serverId);
      if (!server || server.url !== r.endpoint) return this.save(r, 'pending', '原 RPC 配置不可用，交接待确认');
      if (r.state === 'conflict') {
        try { await this.stop(r, server); } catch { return this.save(r, 'conflict', 'aria2 停止状态仍待确认'); }
        return this.resume(r, '冲突已解除，已恢复浏览器下载');
      }
      let task;
      try { task = await this.lookup(r, server); }
      catch {
        return this.save(r, r.state === 'abandoned' ? 'abandoned' : 'pending', '无法核对 GID，交接待确认');
      }
      if (!task) {
        if (continueBrowser || r.state === 'abandoned') {
          // A late addUri can still arrive. It was submitted paused; abandoned GIDs are never unpaused.
          const resumed = r.state === 'abandoned' ? r : await this.resume(r, '已继续浏览器下载；后台继续清理迟到的暂停任务');
          if (resumed.state === 'retry') return resumed;
          return this.save(resumed, 'abandoned', '已继续浏览器下载；不会重新提交或启动此 GID');
        }
        return this.save(r, 'pending', 'GID 尚不可见，交接待确认；不会重新提交');
      }
      if (continueBrowser || r.state === 'abandoned') {
        if (!['removed', 'complete', 'error'].includes(task.status)) {
          try { await this.call(server, 'aria2.forceRemove', [r.gid]); }
          catch { return this.save(r, 'conflict', '无法确认 aria2 已停止，尚未恢复浏览器下载'); }
        }
        return this.resume(r, 'aria2 已停止，已继续浏览器下载');
      }
      if (['removed', 'error'].includes(task.status)) return this.resume(r, 'aria2 任务已停止，已恢复浏览器下载');
      r = await this.save(r, ['cancelled', 'cancelling'].includes(r.state) ? r.state : 'accepted');
      return this.finish(r, server);
    });
  }
  async recover() {
    for (const r of Object.values(this.journal.records)) if (activeStates.has(r.state) && !this.locks.has(r.downloadId)) await this.reconcile(r.downloadId);
  }
}
