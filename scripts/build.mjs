import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
const out = 'build/extension';
await rm('build', { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('extension', out, { recursive: true });
await cp('vendor/ariang/upstream', `${out}/manager`, { recursive: true });
await cp('vendor/ariang/LICENSE', `${out}/manager/ARIA-NG-LICENSE`);
const provenance = JSON.parse(await readFile('vendor/ariang/provenance.json', 'utf8'));
for (const [path, hash] of Object.entries(provenance.files)) {
  if (createHash('sha256').update(await readFile(`vendor/ariang/upstream/${path}`)).digest('hex') !== hash) throw new Error(`AriaNg upstream changed: ${path}`);
}
let html = await readFile(`${out}/manager/index.html`, 'utf8');
// Keep upstream untouched. The complete deterministic adaptation lives here and in manager.js.
html = html.replace('<html ng-app="ariaNg">', '<html lang="zh-CN" ng-csp="no-unsafe-eval">')
  .replaceAll('href="javascript:void(0);"', 'href=""')
  .replace('</head>', '<link rel="stylesheet" href="bridge.css"></head>')
  .replace('</body>', '<script src="bridge.js"></script></body>');
const rpcMenu = '<ul class="dropdown-menu dropdown-menu-right rpcselect-dropdown" role="menu">';
const from = html.indexOf(rpcMenu), to = html.indexOf('</ul>', from);
if (from < 0 || to < from) throw new Error('Pinned AriaNg RPC menu no longer matches');
html = html.slice(0, from) + rpcMenu + '<li ng-repeat="server in bridgeServers"><a class="pointer-cursor" ng-click="bridgeServerId = server.id; selectBridgeServer()" ng-bind="server.name"></a></li><li><a class="pointer-cursor" ng-click="openBridgeSettings()">设置与交接记录</a></li>' + html.slice(to);
// Avoid child-scope shadowing of the selected RPC id.
html = html.replace('bridgeServerId = server.id; selectBridgeServer()', 'selectBridgeServer(server.id)');
await writeFile(`${out}/manager/index.html`, html);
await writeFile(`${out}/manager/bridge.css`, '[ng-cloak],.ng-cloak{display:none!important}body>p{padding:24px}');
const echartsFile = `${out}/manager/js/echarts-common-3.8.5.min.js`;
const echarts = await readFile(echartsFile, 'utf8');
const fallback = 'new Function("return ("+e+");")()';
if (!echarts.includes(fallback)) throw new Error('Pinned ECharts JSON fallback no longer matches');
// Firefox 140 always has JSON.parse; remove the legacy eval fallback instead of relaxing CSP.
await writeFile(echartsFile, echarts.replace(fallback, 'JSON.parse(e)'));
const angularFile = `${out}/manager/js/angular-packages-1.6.10.min.js`;
const angular = await readFile(angularFile, 'utf8');
const compiler = 'new Function("$filter","getStringValue","ifDefined","plus",a)';
if (!angular.includes(compiler) || !angular.includes('new Function("")')) throw new Error('Pinned Angular CSP paths no longer match');
await writeFile(angularFile, angular.replace('new Function("")', 'void 0').replace(compiler, 'function(){throw Error("Aria2 Bridge requires the CSP interpreter")}'));
await build({ entryPoints: { background: 'src/background.js', 'popup/popup': 'src/ui/popup.js', 'options/options': 'src/ui/options.js', 'manager/bridge': 'src/ui/manager.js' },
  outdir: out, bundle: true, format: 'iife', target: 'firefox140', sourcemap: false, legalComments: 'eof' });
// Ensure no executable inline scripts or remote script dependencies slipped into HTML.
for (const dir of ['', '/popup', '/options', '/manager']) {
  for (const file of await readdir(out + dir)) {
    if (!file.endsWith('.html')) continue;
    const page = await readFile(`${out}${dir}/${file}`, 'utf8');
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(page) || /<script[^>]*src=["']https?:/i.test(page) || /\son\w+\s*=/i.test(page)) throw new Error(`Unsafe HTML: ${file}`);
  }
}
console.log(`Built Firefox extension: ${out}`);
