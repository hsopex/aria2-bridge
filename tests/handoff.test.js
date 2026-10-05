import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Journal, Handoff } from '../src/core/handoff.js';
import { RpcError } from '../src/core/rpc.js';
function setup(fault = {}) {
  const server = { id: 'one', url: 'http://localhost:6800/jsonrpc', dir: '/remote', secret: 'hidden', forwardCookies: true };
  let saved = {};
  const events = [], tasks = new Map();
  const item = { id: 8, state: 'in_progress', paused: false, bytesReceived: 65536, filename: '/tmp/中文.zip' };
  const storage = { get: async () => structuredClone(saved), set: async v => { if (fault.storage) throw Error('disk'); saved = structuredClone(v); events.push('persist:' + Object.values(v.handoffs)[0].state); } };
  const journal = new Journal(storage);
  const downloads = {
    search: async () => [structuredClone(item)],
    pause: async () => { events.push('pause'); if (fault.pause) throw Error('pause'); item.paused = true; item.canResume = true; item.state = 'interrupted'; item.error = 'USER_CANCELED'; },
    resume: async () => { events.push('resume'); if (fault.resume) throw Error('resume'); item.paused = false; item.state = 'in_progress'; },
    cancel: async () => { events.push('cancel'); if (fault.cancel) throw Error('cancel'); item.paused = false; item.canResume = false; item.state = 'interrupted'; item.error = 'USER_CANCELED'; },
  };
  const call = async (_, method, params) => {
    events.push(method);
    if (method === 'aria2.getVersion') {
      if (fault.auth) throw new RpcError('rejected', 1);
      return { version: '1.37.0' };
    }
    if (method === 'aria2.addUri') {
      assert.equal(params[1].pause, 'true');
      assert.equal(journal.records[8].state, 'submitting');
      if (fault.reject) throw new RpcError('rejected', 1);
      const gid = params[1].gid; tasks.set(gid, { gid, status: 'paused' });
      if (fault.lost) throw new RpcError('uncertain');
      return gid;
    }
    if (method === 'aria2.tellStatus') {
      if (fault.offline) throw new RpcError('uncertain');
      const task = tasks.get(params[0]); if (!task) throw new RpcError('rejected', 1); return task;
    }
    if (method === 'aria2.unpause') { tasks.get(params[0]).status = 'active'; return params[0]; }
    if (method === 'aria2.forceRemove') { if (fault.remove) throw new RpcError('uncertain'); tasks.get(params[0]).status = 'removed'; return params[0]; }
    throw Error(method);
  };
  const h = new Handoff({ downloads, journal, call, server: () => server, notify: async () => {} });
  const start = () => h.start(item, server, { url: 'https://a/file.zip', cookie: 'session=secret' });
  return { h, start, journal, tasks, events, item, storage, server, fault };
}
test('successful handoff persists before each side effect, starts aria2 only after cancellation and keeps browser history', async () => {
  const s = setup(); await s.start();
  assert.equal(s.journal.records[8].state, 'transferred');
  assert.ok(s.events.indexOf('persist:submitting') < s.events.indexOf('aria2.addUri'));
  assert.ok(s.events.indexOf('persist:accepted') < s.events.indexOf('cancel'));
  assert.ok(s.events.indexOf('persist:cancelling') < s.events.indexOf('cancel'));
  assert.ok(s.events.indexOf('cancel') < s.events.indexOf('aria2.unpause'));
  assert.equal(s.item.error, 'USER_CANCELED');
  assert.ok(!JSON.stringify(s.journal.records).includes('secret'));
});
test('pause failure never submits or cancels the browser download', async () => {
  const s = setup({ pause: true }); await s.start();
  assert.equal(s.journal.records[8].state, 'skipped');
  assert.equal(s.events.includes('aria2.addUri'), false); assert.equal(s.events.includes('cancel'), false);
});
test('explicit rejection resumes the browser; resume failure produces a visible retry state', async () => {
  for (const resume of [false, true]) {
    const s = setup({ reject: true, resume }); await s.start();
    assert.equal(s.journal.records[8].state, resume ? 'retry' : 'resumed'); assert.equal(s.events.includes('cancel'), false);
  }
});
test('lost response remains pending; GID query confirms acceptance without resubmitting', async () => {
  const s = setup({ lost: true }); await s.start();
  assert.equal(s.journal.records[8].state, 'pending'); assert.equal(s.item.paused, true);
  await s.h.reconcile(8);
  assert.equal(s.journal.records[8].state, 'transferred');
  assert.equal(s.events.filter(e => e === 'aria2.addUri').length, 1);
});
test('background restart loads journal and queries the preallocated GID exactly once', async () => {
  const s = setup({ lost: true }); await s.start();
  const restored = new Journal(s.storage); await restored.load();
  const h = new Handoff({ downloads: s.h.downloads, journal: restored, call: s.h.call, server: () => s.server });
  await h.recover();
  assert.equal(restored.records[8].state, 'transferred');
  assert.equal(s.events.filter(e => e === 'aria2.addUri').length, 1);
});
test('offline queries do not resume, cancel or resend a pending handoff', async () => {
  const s = setup({ lost: true, offline: true }); await s.start(); await s.h.reconcile(8);
  assert.equal(s.journal.records[8].state, 'pending'); assert.equal(s.item.paused, true);
  assert.equal(s.events.includes('cancel'), false); assert.equal(s.events.includes('resume'), false);
});
test('cancel failure removes aria2 before browser resume; failed cleanup blocks resume', async () => {
  for (const remove of [false, true]) {
    const s = setup({ cancel: true, remove }); await s.start();
    assert.equal(s.journal.records[8].state, remove ? 'conflict' : 'resumed');
    assert.equal(s.events.includes('aria2.unpause'), false);
    if (!remove) assert.ok(s.events.indexOf('aria2.forceRemove') < s.events.indexOf('resume'));
    else assert.equal(s.events.includes('resume'), false);
  }
});
test('continue-browser removes a confirmed GID without ever starting it', async () => {
  const s = setup({ lost: true }); await s.start(); await s.h.reconcile(8, true);
  assert.equal(s.journal.records[8].state, 'resumed'); assert.equal(s.item.paused, false);
  assert.equal([...s.tasks.values()][0].status, 'removed'); assert.equal(s.events.includes('aria2.unpause'), false);
});
test('absent GID remains pending unless the user chooses browser; late acceptance is cleaned up while paused', async () => {
  const s = setup({ lost: true }); await s.start(); const task = [...s.tasks.values()][0]; s.tasks.clear();
  await s.h.reconcile(8); assert.equal(s.journal.records[8].state, 'pending');
  await s.h.reconcile(8, true); assert.equal(s.journal.records[8].state, 'abandoned'); assert.equal(s.item.paused, false);
  s.tasks.set(task.gid, task); await s.h.reconcile(8);
  assert.equal(task.status, 'removed'); assert.equal(s.events.includes('aria2.unpause'), false);
});
test('parallel events for a download share one handoff and storage failure prevents side effects', async () => {
  const s = setup(); await Promise.all([s.start(), s.start(), s.start()]);
  assert.equal(s.events.filter(e => e === 'aria2.addUri').length, 1);
  const disk = setup({ storage: true }); await assert.rejects(disk.start());
  assert.equal(disk.events.includes('pause'), false); assert.equal(disk.events.includes('aria2.addUri'), false);
});
test('restart after cancellation but before unpause finishes aria2 without erasing history', async () => {
  const s = setup({ lost: true }); await s.start();
  await s.journal.set(s.journal.records[8], 'cancelling');
  s.item.state = 'interrupted'; s.item.error = 'USER_CANCELED';
  s.item.paused = false;
  await s.h.reconcile(8);
  assert.equal(s.journal.records[8].state, 'transferred');
  assert.equal(s.events.includes('cancel'), false); assert.equal(s.events.includes('aria2.unpause'), true);
});

test('a browser download cancelled by the user never starts the pending aria2 task', async () => {
  const s = setup({ lost: true }); await s.start();
  s.item.state = 'interrupted'; s.item.error = 'USER_CANCELED'; s.item.paused = false; s.item.canResume = false;
  await s.h.reconcile(8);
  assert.equal(s.journal.records[8].state, 'skipped');
  assert.equal([...s.tasks.values()][0].status, 'removed');
  assert.equal(s.events.includes('aria2.unpause'), false);
});

test('a secret rotated remotely is never mistaken for an absent GID during browser recovery', async () => {
  const s = setup({ lost: true }); await s.start(); s.tasks.clear(); s.fault.auth = true;
  await s.h.reconcile(8, true);
  assert.equal(s.journal.records[8].state, 'pending');
  assert.equal(s.item.paused, true); assert.equal(s.events.includes('resume'), false);
});

test('Firefox downloads without partial bytes are never paused prematurely', async () => {
  const s = setup(); s.item.bytesReceived = 0; await s.start();
  assert.equal(s.events.includes('pause'), false);
  assert.equal(s.events.includes('aria2.addUri'), false);
  assert.equal(s.item.state, 'in_progress');
});
