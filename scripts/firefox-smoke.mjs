// Runs against a local geckodriver. All browser profiles and aria2 data are temporary.
// Usage: GECKODRIVER_URL=http://127.0.0.1:4444 FIREFOX_BINARY=/usr/bin/firefox pnpm test:firefox
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const webdriver = process.env.GECKODRIVER_URL || 'http://127.0.0.1:4444';
const binary = process.env.FIREFOX_BINARY || '/usr/bin/firefox';
const temp = await mkdtemp(`${tmpdir()}/aria2-bridge-smoke-`);
const received = [];
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/partition-page') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<iframe id="frame" src="http://127.0.0.1:${server.address().port}/page?partition=1"></iframe>`);
  } else if (u.pathname === '/page') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><a id="download" href="/file/中文.zip${u.search}">Download</a><a id="redirect" href="/redirect">Redirect</a><a id="unknown" href="/unknown/file.zip">Unknown size</a>`);
  } else if (u.pathname === '/redirect') { res.writeHead(302, { Location: '/file/redirect.zip' }); res.end(); }
  else {
    received.push({ url: req.url, cookie: req.headers.cookie || '', agent: req.headers['user-agent'] || '' });
    const total = 8 * 1024 * 1024;
    const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] || 0);
    res.writeHead(start ? 206 : 200, {
      'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes',
      'Content-Disposition': "attachment; filename*=UTF-8''%E4%B8%AD%E6%96%87.zip",
      ...(u.pathname.startsWith('/unknown/') ? {} : { 'Content-Length': total - start }),
      ...(start ? { 'Content-Range': `bytes ${start}-${total - 1}/${total}` } : {}),
    });
    let bytes = start;
    const timer = setInterval(() => { if (bytes >= total) { clearInterval(timer); res.end(); } else { res.write(Buffer.alloc(Math.min(65536, total - bytes), 65)); bytes += 65536; } }, 30);
    res.on('close', () => clearInterval(timer));
  }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const site = `http://127.0.0.1:${port}`;
const rpcPort = port + 1;
const secret = crypto.randomUUID();
const aria2 = spawn('aria2c', ['--no-conf=true', '--enable-rpc', '--rpc-listen-all=false', `--rpc-listen-port=${rpcPort}`, `--rpc-secret=${secret}`, `--dir=${temp}/aria2`, '--enable-dht=false', '--enable-dht6=false', '--enable-peer-exchange=false', '--seed-time=0', '--max-concurrent-downloads=5', '--console-log-level=error', '--quiet=true'], { stdio: 'ignore' });
const secondarySecret = crypto.randomUUID();
const secondary = spawn('aria2c', ['--no-conf=true', '--enable-rpc', '--rpc-listen-all=false', `--rpc-listen-port=${rpcPort + 1}`, `--rpc-secret=${secondarySecret}`, `--dir=${temp}/secondary`, '--enable-dht=false', '--enable-dht6=false', '--console-log-level=error', '--quiet=true'], { stdio: 'ignore' });
const delay = ms => new Promise(ok => setTimeout(ok, ms));
async function request(path, body, method = 'POST') {
  const r = await fetch(webdriver + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json(); if (data.value?.error) throw new Error(`${data.value.error}: ${data.value.message}`); return data.value;
}
async function until(action, predicate, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await action(); if (predicate(result)) return result; await delay(200);
  }
  throw Error(`Timed out: ${label}`);
}
let session;
try {
  const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { binary, args: ['-headless', '-remote-allow-system-access'], prefs: {
    'browser.shell.checkDefaultBrowser': false, 'browser.download.folderList': 2, 'browser.download.dir': `${temp}/browser`, 'browser.download.useDownloadDir': true,
    'browser.helperApps.neverAsk.saveToDisk': 'application/octet-stream', 'browser.download.always_ask_before_handling_new_types': false,
    'network.cookie.cookieBehavior': 5,
  } } } } });
  session = created.sessionId;
  const route = path => `/session/${session}${path}`;
  const execute = (script, args = []) => request(route('/execute/sync'), { script, args });
  const message = (type, fields = {}) => request(route('/execute/async'), {
    script: 'const done = arguments[arguments.length - 1]; browser.runtime.sendMessage(arguments[0]).then(done, e => done({ok:false,error:e.message}));', args: [{ type, ...fields }],
  }).then(r => { if (!r.ok) throw Error(r.error); return r.data; });
  const navigate = url => request(route('/url'), { url });
  const addon = await request(route('/moz/addon/install'), { path: resolve('dist/aria2_bridge-0.1.0.zip'), temporary: true });
  await request(route('/moz/context'), { context: 'chrome' });
  const base = await execute("return ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs').ExtensionParent.GlobalManager.extensionMap.get(arguments[0]).baseURI.spec;", [addon]);
  await request(route('/moz/context'), { context: 'content' });
  await navigate(base + 'options/index.html');
  await until(() => execute('return document.querySelectorAll("#servers fieldset").length'), n => n === 1, 'settings rendered');
  let config = await message('CONFIG_GET');
  config.servers[0] = { ...config.servers[0], url: `http://127.0.0.1:${rpcPort}/jsonrpc`, secret, dir: `${temp}/aria2`, forwardCookies: true };
  await message('CONFIG_SAVE', { config });
  await until(() => message('TEST', { serverId: 'local' }).catch(() => null), v => Boolean(v?.version), 'real aria2 connection');
  console.log(`Firefox ${created.capabilities.browserVersion}: installed; real aria2 RPC connected`);
  const bad = { ...config, servers: [{ ...config.servers[0], secret: 'wrong' }] };
  await message('CONFIG_SAVE', { config: bad });
  await assert.rejects(message('TEST', { serverId: 'local' }));
  await assert.rejects(message('SET_ENABLED', { enabled: true }));
  await message('CONFIG_SAVE', { config }); await message('TEST', { serverId: 'local' });
  const exported = await message('CONFIG_EXPORT'); assert.equal(exported.servers[0].secret, '');
  await message('SET_ENABLED', { enabled: true });
  await navigate(base + 'manager/index.html#!/downloading');
  const manager = await until(() => execute('return {body:document.body.innerText, angular:typeof angular, injector:typeof angular !== "undefined" && !!angular.element(document).injector()}'), r => r.injector, 'AriaNg CSP bootstrap');
  assert.ok(!manager.body.includes('后台未就绪'));
  await until(() => execute('return angular.element(document.querySelector(".wrapper")).scope().taskContext.rpcStatus'), s => s === 'Connected', 'AriaNg adapter connected');
  await mkdir('dist/validation', { recursive: true });
  await writeFile(`dist/validation/firefox-${created.capabilities.browserVersion}-manager.png`, Buffer.from(await request(route('/screenshot'), undefined, 'GET'), 'base64'));
  for (const hash of ['#!/new', '#!/settings/aria2/basic', '#!/status', '#!/waiting', '#!/stopped']) {
    await navigate(base + 'manager/index.html' + hash);
    await until(() => execute('return document.querySelector("[ng-view]")?.children.length || 0'), n => n > 0, hash);
  }
  // Test sidebar document through the genuine sidebarAction API in chrome context (no user profile).
  await request(route('/moz/context'), { context: 'chrome' });
  const sidebarId = addon.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-sidebar-action';
  await execute('const w = Services.wm.getMostRecentWindow("navigator:browser"); w.SidebarController.show(arguments[0]); return true;', [sidebarId]);
  await delay(500);
  const sidebar = await execute('const w = Services.wm.getMostRecentWindow("navigator:browser"); return w.SidebarController.currentID;');
  assert.equal(sidebar, sidebarId);
  await request(route('/moz/context'), { context: 'content' });
  await navigate(base + 'options/index.html');
  // Distinct container accounts at the same origin. Cookies are observed on each actual request.
  await execute('window.bridgeProbe=[]; browser.webRequest.onBeforeRequest.addListener(d => window.bridgeProbe.push(d), {urls:[arguments[0]+"/*"]});', [site]);
  config = await message('CONFIG_GET');
  config.servers.push({ id: 'second', name: '第二个 RPC', url: `http://localhost:${rpcPort + 1}/jsonrpc`, secret: secondarySecret, dir: `${temp}/secondary-profile-dir`, forwardCookies: false });
  await message('CONFIG_SAVE', { config });
  await message('SELECT_SERVER', { serverId: 'second' });
  assert.equal((await message('CONFIG_PUBLIC')).enabled, false);
  await message('TEST', { serverId: 'second' });
  const manual = await message('ADD', { links: [`${site}/manual.zip?one=1`, `${site}/manual.zip?two=2`, 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789'] });
  assert.ok(manual.every(r => r.state === 'added'));
  for (const r of manual) {
    const options = await message('RPC', { method: 'aria2.getOption', params: [r.gid] });
    assert.equal(options.dir, `${temp}/secondary-profile-dir`);
    assert.ok(!String(options.header).includes('account='));
  }
  await message('RPC', { method: 'system.multicall', params: [manual.map(r => ({ methodName: 'aria2.forcePause', params: [r.gid] }))] });
  await message('RPC', { method: 'system.multicall', params: [manual.map(r => ({ methodName: 'aria2.forceRemove', params: [r.gid] }))] });
  await message('SELECT_SERVER', { serverId: 'local' });
  await message('SET_ENABLED', { enabled: true });
  const stores = await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; Promise.all([browser.contextualIdentities.create({name:"Bridge smoke A",color:"blue",icon:"circle"}),browser.contextualIdentities.create({name:"Bridge smoke B",color:"red",icon:"circle"})]).then(v=>done(v.map(x=>x.cookieStoreId)));', args: [] });
  const handles = await request(route('/window/handles'), undefined, 'GET'); const extensionHandle = handles[0];
  for (let i = 0; i < stores.length; i++) {
    await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.cookies.set({url:arguments[0],storeId:arguments[1],name:"account",value:arguments[2]}).then(()=>browser.tabs.create({url:arguments[0]+"/page",cookieStoreId:arguments[1]})).then(done);', args: [site, stores[i], `account${i}`] });
    const all = await request(route('/window/handles'), undefined, 'GET'); const tab = all.at(-1);
    await request(route('/window'), { handle: tab });
    await until(() => execute('return !!document.querySelector("#download")'), Boolean, 'fixture page');
    await execute('document.querySelector("#download").click(); return true;');
    await request(route('/window'), { handle: extensionHandle });
    let complete;
    try { complete = await until(() => message('HANDOFFS'), records => records.filter(r => r.state === 'transferred').length === i + 1, 'automatic container handoff', 20000); }
    catch (error) {
      console.error(await execute('return {requests:window.bridgeProbe}'));
      console.error(await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.downloads.search({}).then(done);', args: [] }));
      console.error(await message('HANDOFFS'));
      throw error;
    }
    const opts = await message('RPC', { method: 'aria2.getOption', params: [complete[0].gid] });
    assert.ok(JSON.stringify(opts.header).includes(`account=account${i}`));
  }
  const records = await message('HANDOFFS');
  assert.equal(records.filter(r => r.state === 'transferred').length, 2);
  // Redirect and unknown-size downloads must hand off from the last actual GET request.
  for (const selector of ['#redirect', '#unknown']) {
    await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.tabs.create({url:arguments[0]+"/page",cookieStoreId:arguments[1]}).then(done);', args: [site, stores[0]] });
    const all = await request(route('/window/handles'), undefined, 'GET');
    await request(route('/window'), { handle: all.at(-1) });
    await until(() => execute('return !!document.querySelector("#download")'), Boolean, 'fixture page');
    await execute('document.querySelector(arguments[0]).click();', [selector]);
    await request(route('/window'), { handle: extensionHandle });
    const count = selector === '#redirect' ? 3 : 4;
    await until(() => message('HANDOFFS'), list => list.filter(r => r.state === 'transferred').length === count, selector, 20000);
  }
  await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; Promise.all([browser.cookies.set({url:arguments[0],storeId:arguments[1],name:"partition",value:"correct",partitionKey:{topLevelSite:arguments[2],hasCrossSiteAncestor:true}}),browser.cookies.set({url:arguments[0],storeId:arguments[1],name:"partition",value:"wrong",partitionKey:{topLevelSite:"http://unrelated.example",hasCrossSiteAncestor:true}})]).then(()=>browser.tabs.create({url:arguments[2],cookieStoreId:arguments[1]})).then(done);', args: [site, stores[0], `http://localhost:${port}/partition-page`] });
  const partitionHandles = await request(route('/window/handles'), undefined, 'GET');
  await request(route('/window'), { handle: partitionHandles.at(-1) });
  const frame = await until(() => execute('return document.querySelector("#frame")'), Boolean, 'partition iframe');
  await request(route('/frame'), { id: frame });
  await until(() => execute('return !!document.querySelector("#download")'), Boolean, 'partition child page');
  await execute('document.querySelector("#download").click();');
  await request(route('/frame'), { id: null });
  await request(route('/window'), { handle: extensionHandle });
  const partitionRecords = await until(() => message('HANDOFFS'), list => list.filter(r => r.state === 'transferred').length === 5, 'partitioned cookie handoff', 20000);
  const partitionOptions = await message('RPC', { method: 'aria2.getOption', params: [partitionRecords[0].gid] });
  if (!JSON.stringify(partitionOptions.header).includes('partition=correct')) console.error('Partition fixture headers:', partitionOptions.header, 'received:', received.map(r => ({ url: r.url, cookie: r.cookie })));
  assert.ok(JSON.stringify(partitionOptions.header).includes('partition=correct'));
  assert.ok(!JSON.stringify(partitionOptions.header).includes('partition=wrong'));
  const ariaRequests = received.filter(r => !r.agent.includes('Firefox'));
  for (let i = 0; i < stores.length; i++) {
    // Bridge forwards Firefox User-Agent; distinguish aria2 requests by the browser being cancelled.
    assert.ok(received.some(r => r.cookie === `account=account${i}`));
  }
  assert.ok(received.every(r => !r.cookie.includes('account0') || !r.cookie.includes('account1')));
  console.log(`Firefox ${created.capabilities.browserVersion}: CSP AriaNg, sidebar, bad Secret, multiple RPC services, remote directories, batch/magnet, container isolation, redirects, unknown size and partitioned cookies passed (${ariaRequests.length} default-agent requests)`);
} finally {
  if (session) await request(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  aria2.kill(); secondary.kill(); server.closeAllConnections(); await new Promise(ok => server.close(ok));
  await rm(temp, { recursive: true, force: true });
}
