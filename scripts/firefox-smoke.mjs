import { preferenceDefaults } from '../src/core/manager-preferences.js';
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
  await mkdir('dist/validation', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await execute('const select=document.querySelector("#theme"); select.value=arguments[0]; select.dispatchEvent(new Event("change",{bubbles:true}));', [theme]);
    await until(() => request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.storage.local.get("appearance").then(v=>done(v.appearance?.theme));', args: [] }), t => t === theme, 'theme persisted');
    assert.equal(await execute('return document.documentElement.dataset.theme'), theme);
    await writeFile(`dist/validation/firefox-${created.capabilities.browserVersion}-settings-${theme}.png`, Buffer.from(await request(route('/screenshot'), undefined, 'GET'), 'base64'));
  }
  await navigate(base + 'options/index.html');
  await until(() => execute('return document.querySelector("#theme").value'), value => value === 'dark', 'theme restored');
  await request(route('/moz/context'), { context: 'chrome' });
  await execute('Services.wm.getMostRecentWindow("navigator:browser").SidebarController.hide();');
  await request(route('/moz/context'), { context: 'content' });
  // Firefox desktop enforces a 500px minimum outer window width.
  await request(route('/window/rect'), { width: 500, height: 844 });
  await until(() => execute('return window.innerWidth'), width => width >= 450 && width <= 510, 'narrow viewport resize');
  const narrow = await execute('return {width:innerWidth, scroll:document.documentElement.scrollWidth, overflow:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,cls:e.className,id:e.id,right:e.getBoundingClientRect().right}))}');
  assert.ok(narrow.scroll <= narrow.width, `settings fit narrow viewport: ${JSON.stringify(narrow)}`);
  await writeFile(`dist/validation/firefox-${created.capabilities.browserVersion}-settings-mobile.png`, Buffer.from(await request(route('/screenshot'), undefined, 'GET'), 'base64'));
  await request(route('/window/rect'), { width: 1280, height: 900 });
  await until(() => execute('return !document.querySelector("#new").disabled'), Boolean, 'settings ready');
  await execute('document.querySelector("#new").click(); const cards=document.querySelectorAll(".server-card"); cards[1].querySelector("input[type=radio]").click(); cards[1].querySelector("[data-action=remove]").click();');
  assert.ok(await execute('return document.querySelector(".server-card input[type=radio]").checked'), 'default follows remaining server');
  assert.equal(await execute('return document.querySelector("#save-state").dataset.state'), 'dirty');
  await execute('document.querySelector("#save").click();');
  await until(() => execute('return document.querySelector("#save-state").dataset.state'), state => state === 'saved', 'settings saved');
  await navigate(base + 'popup/index.html');
  await until(() => execute('return document.documentElement.dataset.theme'), theme => theme === 'dark', 'popup shares theme');
  await navigate(base + 'options/index.html');
  await execute('const select=document.querySelector("#theme"); select.value="system"; select.dispatchEvent(new Event("change",{bubbles:true}));');
  await until(() => request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.storage.local.get("appearance").then(v=>done(v.appearance?.theme));', args: [] }), theme => theme === 'system', 'system theme saved');
  await until(() => execute('return !!document.querySelector("#manager-language")'), Boolean, 'manager preferences rendered');
  const managed = { language: 'zh_Hans', keyboardShortcuts: false, confirmTaskRemoval: false, title: 'Bridge ${title}', taskListIndependentDisplayOrder: true, displayOrder: 'name:asc', waitingTaskListPageDisplayOrder: 'size:desc', stoppedTaskListPageDisplayOrder: 'percent:desc', fileListDisplayOrder: 'size:desc', peerListDisplayOrder: 'client:asc', showPiecesInfoInTaskDetailPage: 'never', rpcListDisplayOrder: 'rpcAlias' };
  for (const [key, value] of Object.entries(managed)) {
    await execute('const input=document.getElementById("manager-"+arguments[0]); if(input.type==="checkbox") input.checked=arguments[1]; else input.value=String(arguments[1]); input.dispatchEvent(new Event("change",{bubbles:true}));', [key, value]);
    await until(() => message('MANAGER_PREFERENCES_GET'), prefs => prefs[key] === value, `manager preference ${key} saved`);
  }
  await navigate(base + 'options/index.html');
  await until(() => execute('return document.querySelector("#manager-language")?.value'), value => value === 'zh_Hans', 'manager preferences restored');
  await assert.rejects(message('MANAGER_PREFERENCES_PATCH', { patch: { secret: 'forbidden' } }));
  console.log(`Firefox ${created.capabilities.browserVersion}: settings light/dark/system, reload persistence, popup theme, narrow layout and default-service editing passed`);
  let config = await message('CONFIG_GET');
  config.servers[0] = { ...config.servers[0], url: `http://127.0.0.1:${rpcPort}/jsonrpc`, secret, dir: `${temp}/aria2`, forwardCookies: true };
  await message('CONFIG_SAVE', { config });
  await until(() => message('TEST', { serverId: 'local' }).catch(() => null), v => Boolean(v?.version), 'real aria2 connection');
  console.log(`Firefox ${created.capabilities.browserVersion}: installed; real aria2 RPC connected`);
  const toolbar = () => request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; Promise.all([browser.action.getBadgeText({}),browser.action.getTitle({})]).then(([badge,title])=>done({badge,title}));', args: [] });
  const toolbarIcon = async expected => {
    await request(route('/moz/context'), { context: 'chrome' });
    await execute('const w=Services.wm.getMostRecentWindow("navigator:browser"); let ui=w.CustomizableUI; if(!ui) { for(const path of ["resource:///modules/CustomizableUI.sys.mjs","resource:///modules/customizableui/CustomizableUI.sys.mjs"]) { try { ui=ChromeUtils.importESModule(path).CustomizableUI; break; } catch {} } } if(!ui)throw new Error("CustomizableUI unavailable"); const id=arguments[0].toLowerCase().replace(/[^a-z0-9_-]/g,"_")+"-browser-action"; ui.addWidgetToArea(id,ui.AREA_NAVBAR);', [addon]);
    const style = await until(() => execute('const id=arguments[0].toLowerCase().replace(/[^a-z0-9_-]/g,"_")+"-browser-action"; const w=Services.wm.getMostRecentWindow("navigator:browser"); const button=w.document.getElementById(id); const icon=button?.querySelector(".toolbarbutton-icon"); return icon ? w.getComputedStyle(icon).listStyleImage : "";', [addon]), value => value.includes(expected), 'toolbar icon painted');
    await request(route('/moz/context'), { context: 'content' });
    return style;
  };
  const pressShortcut = async key => {
    await request(route('/moz/context'), { context: 'chrome' });
    await execute('const w=Services.wm.getMostRecentWindow("navigator:browser"); w.focus(); w.gBrowser.selectedBrowser.focus();');
    await request(route('/actions'), { actions: [{type:'key',id:'shortcut-keys',actions:[{type:'keyDown',value:'\uE00A'},{type:'keyDown',value:'\uE008'},{type:'keyDown',value:key},{type:'keyUp',value:key},{type:'keyUp',value:'\uE008'},{type:'keyUp',value:'\uE00A'}]}] });
    await request(route('/moz/context'), { context: 'content' });
  };
  const clickQuickMenu = async (label, submenu) => {
    await request(route('/moz/context'), { context: 'chrome' });
    await execute('const w=Services.wm.getMostRecentWindow("navigator:browser"); for(const popup of w.document.querySelectorAll("menupopup")) if(popup.state==="open") popup.hidePopup();');
    const widgetId = addon.toLowerCase().replace(/[^a-z0-9_-]/g,'_')+'-browser-action';
    const widget = await request(route('/element'), {using:'css selector',value:'#'+widgetId});
    await request(route('/actions'), {actions:[{type:'pointer',id:'quick-menu-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:widget,x:0,y:0},{type:'pointerDown',button:2},{type:'pointerUp',button:2}]}]});
    await until(() => execute("const w=Services.wm.getMostRecentWindow(\"navigator:browser\"); const menu=w.document.querySelector('menu[label=\"Aria2 Bridge 快捷操作\"]'); if(!menu)return false; menu.openMenu(true); return menu.querySelector(\"menupopup\")?.state===\"open\";"), Boolean, 'toolbar quick menu');
    if (submenu) await until(() => execute("const w=Services.wm.getMostRecentWindow(\"navigator:browser\"); const root=w.document.querySelector('menu[label=\"Aria2 Bridge 快捷操作\"]'); const menu=[...root.querySelectorAll(\"menu\")].find(m=>m.getAttribute(\"label\")===arguments[0]); if(!menu)return false; menu.openMenu(true); return menu.querySelector(\"menupopup\")?.state===\"open\";", [submenu]), Boolean, 'RPC submenu');
    const item = await until(() => request(route('/element'), {using:'css selector',value:`menu[label="Aria2 Bridge 快捷操作"] menuitem[label="${label}"]`}).catch(()=>null), Boolean, 'quick menu item');
    await request(route('/element/'+item['element-6066-11e4-a52e-4f735466cecf']+'/click'), {});
    await request(route('/moz/context'), {context:'content'});
  };
  assert.equal((await toolbar()).badge, '');
  assert.match((await toolbar()).title, /自动接管已关闭/);
  assert.match(await toolbarIcon('icon-disabled.svg'), /icon-disabled\.svg/, 'gray toolbar icon while disabled');
  await until(() => execute('return !!document.querySelector("#shortcut-toggle-takeover")'), Boolean, 'shortcut editor ready');
  await execute('for(const [name,key] of [["toggle-takeover","Alt+Shift+D"],["open-manager","Alt+Shift+M"],["open-add","Alt+Shift+A"],["toggle-sidebar","Alt+Shift+J"]]) { const input=document.getElementById("shortcut-"+name); input.value=key; input.dispatchEvent(new Event("input",{bubbles:true})); } const enabled=document.querySelector("#shortcuts-enabled"); enabled.checked=true; enabled.dispatchEvent(new Event("change",{bubbles:true}));');
  await until(() => execute('return !document.querySelector("#save-shortcuts").disabled'), Boolean, 'shortcut master enabled');
  await execute('document.querySelector("#shortcut-settings").requestSubmit();');
  await until(() => message('SHORTCUTS_GET'), state => state.enabled && state.bindings['toggle-takeover']==='Alt+Shift+D', 'shortcut UI saved');
  const bindings = await request(route('/execute/async'), {script:'const done=arguments[arguments.length-1]; browser.commands.getAll().then(done);',args:[]});
  assert.equal(bindings.find(c=>c.name==='toggle-takeover').shortcut,'Alt+Shift+D');
  await pressShortcut('d');
  await until(() => message('CONFIG_GET'), value=>value.enabled, 'trusted shortcut enables takeover');
  await pressShortcut('d');
  await until(() => message('CONFIG_GET'), value=>!value.enabled, 'trusted shortcut disables takeover');
  await clickQuickMenu('开启／关闭自动接管');
  await until(() => message('CONFIG_GET'), value=>value.enabled, 'trusted right-click menu enables takeover');
  await clickQuickMenu('开启／关闭自动接管');
  await until(() => message('CONFIG_GET'), value=>!value.enabled, 'trusted right-click menu disables takeover');
  let shortcutState = await message('SHORTCUTS_GET');
  await clickQuickMenu('启用功能快捷键');
  await until(() => message('SHORTCUTS_GET'), state=>!state.enabled, 'menu disables shortcuts');
  await until(() => execute('return document.querySelector("#shortcuts-enabled").checked'), value=>!value, 'settings reflect disabled master');
  const released = await request(route('/execute/async'), {script:'const done=arguments[arguments.length-1]; browser.commands.getAll().then(done);',args:[]});
  assert.ok(released.every(c=>!c.shortcut),'master switch releases native keys');
  await pressShortcut('d'); await delay(300); assert.equal((await message('CONFIG_GET')).enabled,false);
  await clickQuickMenu('启用功能快捷键');
  await until(() => message('SHORTCUTS_GET'), state=>state.enabled, 'menu restores shortcuts');
  await until(() => execute('return document.querySelector("#shortcuts-enabled").checked'), Boolean, 'settings reflect restored master');
  await execute('window.commandProbe=[]; browser.commands.onCommand.addListener(name=>window.commandProbe.push(name));');
  await pressShortcut('j');
  await until(() => request(route('/execute/async'),{script:'const done=arguments[arguments.length-1]; browser.sidebarAction.isOpen({}).then(done);',args:[]}),Boolean,'shortcut opens genuine sidebar').catch(async error => { throw new Error(error.message + JSON.stringify(await execute('return {probe:window.commandProbe,types:{toggle:typeof browser.sidebarAction.toggle}}'))); });
  await pressShortcut('j');
  await until(() => request(route('/execute/async'),{script:'const done=arguments[arguments.length-1]; browser.sidebarAction.isOpen({}).then(done);',args:[]}),value=>!value,'shortcut closes genuine sidebar');
  await pressShortcut('a');
  await until(() => execute('return browser.extension.getViews({type:"popup"}).some(win=>!!win.document.getElementById("urls"))'), Boolean, 'shortcut opens add popup with trusted gesture');
  await execute('for(const win of browser.extension.getViews({type:"popup"})) win.close();');
  await message('SHORTCUTS_SAVE', {shortcuts:{...shortcutState,enabled:false}});
  await clickQuickMenu('添加链接／磁力链接');
  await until(() => execute('return browser.extension.getViews({type:"popup"}).some(win=>!!win.document.getElementById("urls"))'), Boolean, 'right-click opens add popup with trusted gesture');
  await execute('for(const win of browser.extension.getViews({type:"popup"})) win.close();');
  await clickQuickMenu('打开 AriaNg');
  const openedManagers = await until(() => request(route('/execute/async'), {script:'const done=arguments[arguments.length-1]; browser.tabs.query({}).then(tabs=>done(tabs.filter(t=>t.url?.startsWith(arguments[0]))));',args:[base+'manager/index.html']}), tabs=>tabs.length===1, 'menu opens manager tab');
  await clickQuickMenu('打开 AriaNg');
  assert.equal((await request(route('/execute/async'), {script:'const done=arguments[arguments.length-1]; browser.tabs.query({}).then(tabs=>done(tabs.filter(t=>t.url?.startsWith(arguments[0])).length));',args:[base+'manager/index.html']})),1,'manager tab reused');
  await request(route('/execute/async'),{script:'const done=arguments[arguments.length-1]; browser.tabs.remove(arguments[0]).then(done);',args:[openedManagers[0].id]});
  console.log(`Firefox ${created.capabilities.browserVersion}: real toolbar context-menu actions, trusted keyboard shortcuts, sidebar gesture and master disable/restore passed`);

  const queued = await message('RPC', { method: 'system.multicall', params: [Array.from({length:105}, (_,i)=>({methodName:'aria2.addUri',params:[[`${site}/badge-${i}.zip`],{pause:'true'}]}))] });
  await message('STATUS', { refresh: true });
  assert.equal((await toolbar()).badge, '99'); assert.match((await toolbar()).title, /未完成 105/);
  await message('TEST', { serverId: 'local' });
  await message('SET_ENABLED', { enabled: true });
  assert.match((await toolbar()).title, /自动接管已开启/); assert.equal((await toolbar()).badge, '99');
  assert.match(await toolbarIcon('icon-enabled.svg'), /icon-enabled\.svg/, 'green toolbar icon while enabled');
  await message('SET_ENABLED', { enabled: false });
  assert.match((await toolbar()).title, /自动接管已关闭/); assert.equal((await toolbar()).badge, '99');
  assert.match(await toolbarIcon('icon-disabled.svg'), /icon-disabled\.svg/, 'gray toolbar icon restores without clearing tasks');
  await message('RPC', { method: 'system.multicall', params: [queued.map(([gid])=>({methodName:'aria2.forceRemove',params:[gid]}))] });
  await message('STATUS', { refresh: true }); assert.equal((await toolbar()).badge, '');

  const bad = { ...config, servers: [{ ...config.servers[0], secret: 'wrong' }] };
  await message('CONFIG_SAVE', { config: bad });
  await assert.rejects(message('TEST', { serverId: 'local' }));
  const failedStatus = await message('STATUS', { refresh: true });
  assert.equal(failedStatus.connected, false); assert.equal((await toolbar()).badge, '');
  await assert.rejects(message('SET_ENABLED', { enabled: true }));
  await message('CONFIG_SAVE', { config }); await message('TEST', { serverId: 'local' });
  const exported = await message('CONFIG_EXPORT'); assert.equal(exported.servers[0].secret, '');
  await message('SET_ENABLED', { enabled: true });
  await navigate(base + 'manager/index.html#!/downloading');
  const manager = await until(() => execute('return {body:document.body.innerText, angular:typeof angular, injector:typeof angular !== "undefined" && !!angular.element(document).injector()}'), r => r.injector, 'AriaNg CSP bootstrap');
  assert.ok(!manager.body.includes('后台未就绪'));
  await until(() => execute('return angular.element(document.querySelector(".wrapper")).scope().taskContext.rpcStatus'), s => s === 'Connected', 'AriaNg adapter connected');
  const actual = await execute('return angular.element(document).injector().get("ariaNgSettingService").getAllOptions()');
  for (const [key, value] of Object.entries({ ...preferenceDefaults(), ...managed })) assert.equal(actual[key], value, `native preference ${key}`);
  await execute('angular.element(document).injector().get("ariaNgSettingService").setDisplayOrder("dspeed:desc", "downloading");');
  await until(() => message('MANAGER_PREFERENCES_GET'), prefs => prefs.displayOrder === 'dspeed:desc', 'native sorting persisted to plugin preferences');
  await execute('window.bridgeThemeProbe="kept";');
  for (const theme of ['dark', 'light', 'system']) {
    await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.storage.local.set({appearance:{theme:arguments[0]}}).then(done);', args: [theme] });
    await until(() => execute('return angular.element(document).injector().get("ariaNgSettingService").getTheme()'), value => value === theme, 'live manager theme');
    assert.equal(await execute('return window.bridgeThemeProbe'), 'kept', 'theme changes preserve the management document');
    if (theme !== 'system') assert.equal(await execute('return document.body.classList.contains("theme-dark")'), theme === 'dark');
    if (theme === 'dark') await writeFile(`dist/validation/firefox-${created.capabilities.browserVersion}-manager-dark.png`, Buffer.from(await request(route('/screenshot'), undefined, 'GET'), 'base64'));
  }
  await message('MANAGER_PREFERENCES_PATCH', { patch: { language: 'en', keyboardShortcuts: true, globalStatRefreshInterval: 2000 } });
  await until(() => execute('return typeof angular!=="undefined" && angular.element(document).injector()?.get("ariaNgSettingService").getGlobalStatRefreshInterval()'), v => v === 2000, 'refresh interval applied after reload');
  await message('MANAGER_PREFERENCES_PATCH', { patch: { language: 'zh_Hans', keyboardShortcuts: false } });
  await until(() => execute('return angular.element(document).injector().get("ariaNgSettingService").getLanguage()'), v => v === 'zh_Hans', 'language changed live');
  await until(() => execute('return angular.element(document.querySelector(".wrapper")).scope().taskContext.rpcStatus'), s => s === 'Connected', 'RPC survives preference updates');
  await navigate(base + 'manager/index.html#!/settings/ariang');
  await until(() => execute('return document.querySelector("[ng-view]")?.innerText || ""'), text => text.includes('均由插件设置统一管理'), 'native settings redirect to plugin');
  assert.equal(await execute('return document.querySelectorAll("[ng-view] select, [ng-view] input").length'), 0, 'no editable native settings');
  await navigate(base + 'manager/index.html#!/downloading');
  await until(() => execute('return typeof angular!=="undefined" && !!angular.element(document).injector()'), Boolean, 'manager restored');
  console.log(`Firefox ${created.capabilities.browserVersion}: plugin-managed native preferences, live themes/language, interval reload and RPC separation passed`);
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
  const sidebarPreferences = await until(() => execute('const win=browser.extension.getViews({type:"sidebar"})[0]; if(!win?.angular)return null; const injector=win.angular.element(win.document).injector(); if(!injector)return null; const service=injector.get("ariaNgSettingService"); return {language:service.getLanguage(), keyboard:service.getKeyboardShortcuts(), interval:service.getGlobalStatRefreshInterval(), theme:service.getTheme()};'), value => value?.language === 'zh_Hans', 'sidebar shares managed preferences');
  assert.deepEqual(sidebarPreferences, {language:'zh_Hans',keyboard:false,interval:2000,theme:'system'});
  await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.storage.local.set({appearance:{theme:"dark"}}).then(done);', args: [] });
  await until(() => execute('return browser.extension.getViews({type:"sidebar"})[0]?.document.body.classList.contains("theme-dark")'), Boolean, 'sidebar applies theme live');
  await request(route('/execute/async'), { script: 'const done=arguments[arguments.length-1]; browser.storage.local.set({appearance:{theme:"system"}}).then(done);', args: [] });
  await navigate(base + 'options/index.html');
  // Distinct container accounts at the same origin. Cookies are observed on each actual request.
  await execute('window.bridgeProbe=[]; browser.webRequest.onBeforeRequest.addListener(d => window.bridgeProbe.push(d), {urls:[arguments[0]+"/*"]});', [site]);
  config = await message('CONFIG_GET');
  config.servers.push({ id: 'second', name: '第二个 RPC', url: `http://localhost:${rpcPort + 1}/jsonrpc`, secret: secondarySecret, dir: `${temp}/secondary-profile-dir`, forwardCookies: false });
  await message('CONFIG_SAVE', { config });
  await message('SELECT_SERVER', { serverId: 'second' });
  assert.equal((await message('CONFIG_PUBLIC')).enabled, false);
  await message('TEST', { serverId: 'second' });
  assert.equal((await toolbar()).badge, '', 'new RPC does not retain old counts');
  await clickQuickMenu(config.servers[0].name, '切换默认 RPC');
  await until(() => message('CONFIG_GET'), value=>value.defaultServerId==='local' && !value.enabled, 'menu selects local RPC');
  await clickQuickMenu('第二个 RPC', '切换默认 RPC');
  await until(() => message('CONFIG_GET'), value=>value.defaultServerId==='second' && !value.enabled, 'menu selects secondary RPC');
  const manual = await message('ADD', { links: [`${site}/manual.zip?one=1`, `${site}/manual.zip?two=2`, 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789'] });
  assert.ok(manual.every(r => r.state === 'added'));
  for (const r of manual) {
    const options = await message('RPC', { method: 'aria2.getOption', params: [r.gid] });
    assert.equal(options.dir, `${temp}/secondary-profile-dir`);
    assert.ok(!String(options.header).includes('account='));
  }
  await message('STATUS', { refresh: true }); assert.equal((await toolbar()).badge, '3', 'selected RPC task count');
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
  console.log(`Firefox ${created.capabilities.browserVersion}: toolbar takeover state, 105 tasks capped at 99, zero/offline clearing and RPC switching passed`);
  console.log(`Firefox ${created.capabilities.browserVersion}: CSP AriaNg, sidebar, bad Secret, multiple RPC services, remote directories, batch/magnet, container isolation, redirects, unknown size and partitioned cookies passed (${ariaRequests.length} default-agent requests)`);
} finally {
  if (session) await request(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  aria2.kill(); secondary.kill(); server.closeAllConnections(); await new Promise(ok => server.close(ok));
  await rm(temp, { recursive: true, force: true });
}
