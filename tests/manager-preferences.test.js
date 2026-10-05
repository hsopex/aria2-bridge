import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferenceDefaults, readPreferences, validatePreferencePatch } from '../src/core/manager-preferences.js';

test('AriaNg preferences exclude RPC credentials and reject invalid native values', () => {
  for (const patch of [{ secret: 'private' }, { rpcHost: 'host' }, { theme: 'dark' }, { debugMode: true }, { downloadTaskRefreshInterval: 0 }, { browserNotification: 'true' }, { displayOrder: 'progress:desc' }, { title: 'bad\nheader' }, { language: 'unknown' }]) assert.throws(() => validatePreferencePatch(patch));
  assert.deepEqual(validatePreferencePatch({ language: 'zh_Hans', keyboardShortcuts: false, displayOrder: 'percent:desc', globalStatRefreshInterval: 5000 }), { language: 'zh_Hans', keyboardShortcuts: false, displayOrder: 'percent:desc', globalStatRefreshInterval: 5000 });
});
test('versioned manager preferences recover valid fields without trusting corrupt storage', () => {
  const result = readPreferences({ version: 1, options: { language: 'zh_Hans', title: '${title}', secret: 'private', confirmTaskRemoval: 'no', globalStatRefreshInterval: -1 } });
  assert.equal(result.language, 'zh_Hans'); assert.equal(result.title, '${title}');
  assert.equal(result.confirmTaskRemoval, true); assert.equal(result.globalStatRefreshInterval, 1000);
  assert.equal('secret' in result, false);
  assert.deepEqual(readPreferences({ version: 9, options: { language: 'zh_Hans' } }), preferenceDefaults());
});
