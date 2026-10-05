import { test } from 'node:test';
import assert from 'node:assert/strict';
import { languages, normalizeLanguage, languageTag, translateText } from '../src/core/language.js';
import { preferenceDefaults, readPreferences, validatePreferencePatch } from '../src/core/manager-preferences.js';
import { toolbarState } from '../src/core/toolbar.js';
test('one language preference defaults to Chinese, preserves English and rejects untranslated languages', () => {
  assert.equal(preferenceDefaults().language, 'zh_Hans');
  assert.equal(readPreferences({version:1,options:{language:'en'}}).language, 'en');
  assert.equal(readPreferences({version:1,options:{language:'ja_JP'}}).language, 'zh_Hans');
  assert.deepEqual(languages.map(([id]) => id), ['zh_Hans','en']);
  assert.throws(() => validatePreferencePatch({language:'ja_JP'}));
  assert.equal(normalizeLanguage(undefined), 'zh_Hans'); assert.equal(languageTag('en'), 'en');
});
test('English labels translate dynamic counts and failures without changing GIDs or numeric values', () => {
  const note = 'RPC 响应丢失，交接待确认；不会重复提交 · GID 0123456789abcdef';
  assert.equal(translateText(note,'en'), 'RPC response lost; handoff unconfirmed. No resubmission. · GID 0123456789abcdef');
  assert.equal(translateText('下载中 2 · 等待／暂停 105 · 未完成 107','en'), 'Downloading 2 · Waiting / paused 105 · Unfinished 107');
  assert.equal(translateText(note,'zh_Hans'), note);
  const state = toolbarState({enabled:true,summary:{connected:true,note:'已连接',numActive:'2',numWaiting:'105'},pending:0,serverName:'下载速度',translate:value => translateText(value,'en')});
  assert.match(state.title,/Automatic takeover enabled/); assert.match(state.title,/· 下载速度\n/); assert.equal(state.text,'99');
});
