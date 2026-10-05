import {test} from 'node:test'; import assert from 'node:assert/strict';
import {downloadOptions,DownloadPrompts} from '../src/core/download-options.js';
import {defaults,normalizeConfig} from '../src/core/config.js';
test('per-download paths and names reject traversal, control characters and invalid flags without changing defaults',()=>{
  assert.deepEqual(downloadOptions({dir:' /remote/下载 ',out:' 中文.zip ',paused:true}),{dir:'/remote/下载',out:'中文.zip',paused:true});
  for(const out of ['../file','x\\file','..','a\nfile'])assert.throws(()=>downloadOptions({out}));
  assert.throws(()=>downloadOptions({dir:'/tmp\nheader'}));assert.throws(()=>downloadOptions({paused:'true'}));
  assert.equal(normalizeConfig({...defaults(),askBeforeDownload:undefined}).askBeforeDownload,false);
  assert.throws(()=>normalizeConfig({...defaults(),askBeforeDownload:'true'}));
});
test('independent confirmation windows settle once, closing one leaves other downloads pending',async()=>{
  let windowId=0; const windows={create:async()=>({id:++windowId}),remove:async()=>{},get:async id=>({id})};
  const prompts=new DownloadPrompts(windows,'moz-extension://test/confirm/index.html');
  const first=prompts.open({downloadId:1}),second=prompts.open({downloadId:2}); await Promise.resolve();
  prompts.closed(1); assert.equal(await first,null); const id=[...prompts.pending.keys()][0]; assert.equal(prompts.get(id).downloadId,2);
  prompts.finish(id,{paused:true});assert.deepEqual(await second,{paused:true});assert.throws(()=>prompts.finish(id,null));
});
test('failure to open a confirmation window resolves to browser fallback',async()=>{
  const prompts=new DownloadPrompts({create:async()=>{throw Error('no window');}},'moz-extension://test/confirm/index.html');
  assert.equal(await prompts.open({downloadId:1}),null);assert.equal(prompts.pending.size,0);
});
