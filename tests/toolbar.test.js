import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadCounts, toolbarState } from '../src/core/toolbar.js';
const state = (overrides = {}) => toolbarState({ enabled: false, summary: { connected: true, note: '已连接', numActive: '2', numWaiting: '3' }, pending: 0, serverName: '本机', ...overrides });
test('toolbar icon reflects takeover independently of task counts and RPC connectivity', () => {
  assert.equal(state().icon, 'icon-disabled.svg'); assert.equal(state({ enabled: true }).icon, 'icon-enabled.svg');
  assert.equal(state({ enabled: true, summary: { connected: false, note: '断网' } }).icon, 'icon-enabled.svg');
  assert.match(state().title, /自动接管已关闭/); assert.equal(state().text, '5');
});
test('task badge counts unfinished jobs, caps at 99, hides zero and never retains stale disconnected counts', () => {
  assert.equal(state({ summary: { connected: true, numActive: '99', numWaiting: '10' } }).text, '99');
  assert.match(state({ summary: { connected: true, numActive: '99', numWaiting: '10' } }).title, /未完成 109/);
  assert.equal(state({ summary: { connected: true, numActive: '0', numWaiting: '0' } }).text, '');
  assert.equal(state({ summary: { connected: false, numActive: '12', numWaiting: '3' } }).text, '');
  for (const numActive of [undefined, null, '', '-1', '1.2', Infinity, true, {}, 'wrong', Number.MAX_SAFE_INTEGER]) assert.equal(downloadCounts({ connected: true, numActive, numWaiting: '1' }), null);
});
test('pending handoffs retain warning color and tooltip without hiding the numeric count', () => {
  assert.equal(state({ pending: 2 }).text, '5'); assert.equal(state({ pending: 2 }).color, '#b35c00');
  assert.match(state({ pending: 2 }).title, /2 个交接待确认/);
  assert.equal(state({ pending: 2, summary: { connected: false, note: '断网' } }).text, '?');
});
