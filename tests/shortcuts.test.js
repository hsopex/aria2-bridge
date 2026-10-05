import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShortcutSettings, shortcutDefaults, normalizeShortcut, normalizeShortcutSettings, shortcutActions } from '../src/core/shortcuts.js';
function harness() {
  const assigned = Object.fromEntries(shortcutActions.map(a => [a.name, '']));
  let stored, failKey = false, failStorage = false;
  const commands = { async update({ name, shortcut }) { if (failKey && shortcut === 'Alt+Shift+A') throw new Error('unsupported'); assigned[name] = shortcut; } };
  const storage = { async get() { return { shortcuts: stored }; }, async set(value) { if (failStorage) throw new Error('storage'); stored = structuredClone(value.shortcuts); } };
  return { controller: new ShortcutSettings(commands, storage, 'linux'), assigned, failKeys: () => { failKey = true; }, failWrites: () => { failStorage = true; } };
}
test('shortcut settings normalize modifier order, Mac semantics and prevent duplicate or unknown actions', () => {
  assert.equal(normalizeShortcut('Alt+Ctrl+M'), 'Ctrl+Alt+M'); assert.equal(normalizeShortcut('Ctrl+Shift+M', 'mac'), 'Command+Shift+M'); assert.equal(normalizeShortcut('F19'), 'F19');
  for (const value of ['Shift+M', 'M', 'Ctrl+Ctrl+M', 'Ctrl+Shift+Alt+M', 'Alt+F20', 'Ctrl+Enter']) assert.throws(() => normalizeShortcut(value));
  const state = shortcutDefaults(); state.bindings['open-manager'] = 'Alt+Ctrl+M'; state.bindings['open-add'] = 'Ctrl+Alt+M'; assert.throws(() => normalizeShortcutSettings(state, 'linux'));
  assert.throws(() => normalizeShortcutSettings({ ...shortcutDefaults(), bindings: { unknown: 'Alt+M' } }, 'linux'));
});
test('shortcut master switch releases all bindings and restores configured keys without losing them', async () => {
  const h = harness(); await h.controller.load();
  const state = shortcutDefaults(); state.enabled = true; state.bindings['open-manager'] = 'Alt+Shift+M';
  await h.controller.save(state); assert.equal(h.assigned['open-manager'], 'Alt+Shift+M'); assert.equal(h.controller.enabled, true);
  const disabled = await h.controller.save({ ...state, enabled: false }); assert.ok(Object.values(h.assigned).every(v => v === '')); assert.equal(disabled.bindings['open-manager'], 'Alt+Shift+M'); assert.equal(h.controller.enabled, false);
  await h.controller.save({ ...disabled, enabled: true }); assert.equal(h.assigned['open-manager'], 'Alt+Shift+M');
});
test('failed API changes and persistence roll back prior assignments; swapping keys is serialized', async () => {
  const h = harness(); const original = shortcutDefaults(); original.enabled = true; original.bindings['open-manager'] = 'Alt+Shift+M'; original.bindings['open-options'] = 'Alt+Shift+O';
  await h.controller.save(original);
  h.failKeys(); await assert.rejects(h.controller.save({ ...original, bindings: { ...original.bindings, 'open-add': 'Alt+Shift+A' } })); assert.equal(h.assigned['open-manager'], 'Alt+Shift+M'); assert.equal(h.controller.enabled, true);
  const swapped = { ...original, bindings: { ...original.bindings, 'open-manager': 'Alt+Shift+O', 'open-options': 'Alt+Shift+M' } };
  await h.controller.save(swapped); assert.equal(h.assigned['open-manager'], 'Alt+Shift+O');
  h.failWrites(); await assert.rejects(h.controller.save({ ...swapped, enabled: false })); assert.equal(h.assigned['open-manager'], 'Alt+Shift+O'); assert.equal(h.controller.enabled, true);
});
test('queued master toggles preserve bindings from a concurrent settings save', async () => {
  const h = harness();
  const next = shortcutDefaults(); next.enabled = true; next.bindings['open-manager'] = 'Alt+Shift+M';
  await Promise.all([h.controller.save(next), h.controller.save(current => ({ ...current, enabled: !current.enabled }))]);
  assert.equal(h.controller.enabled, false); assert.equal(h.controller.state.bindings['open-manager'], 'Alt+Shift+M'); assert.ok(Object.values(h.assigned).every(v => v === ''));
});
