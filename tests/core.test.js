import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeConfig, exportConfig, validateLink } from '../src/core/config.js';
import { domainMatches, matchesFilters } from '../src/core/rules.js';
import { rpc, RpcError } from '../src/core/rpc.js';
import { RequestTracker, selectCookies, requestOptions } from '../src/core/requests.js';

test('configuration validates endpoints, filters and redacts exported credentials', () => {
  const c = defaults(); c.servers[0].secret = 'sensitive'; c.enabled = true;
  c.filters.allowDomains = ['*.例子.中国']; c.filters.allowExtensions = ['.ZIP', 'tar.gz'];
  const n = normalizeConfig(c);
  assert.equal(n.filters.allowDomains[0], '*.xn--fsqu00a.xn--fiqs8s');
  assert.deepEqual(n.filters.allowExtensions, ['zip', 'tar.gz']);
  assert.equal(exportConfig(n).servers[0].secret, '');
  assert.equal(exportConfig(n).enabled, false);
  for (const url of ['ws://localhost/', 'https://u:p@host/', 'https://host/?secret=x', 'https://host/#x']) {
    c.servers[0].url = url; assert.throws(() => normalizeConfig(c));
  }
});
test('domain and extension exclusions win, wildcard never matches the apex', () => {
  assert.equal(domainMatches('a.example.com', '*.example.com'), true);
  assert.equal(domainMatches('example.com', '*.example.com'), false);
  assert.equal(domainMatches('badexample.com', '*.example.com'), false);
  const f = { allowDomains: ['*.example.com'], denyDomains: ['blocked.example.com'], allowExtensions: ['zip'], denyExtensions: ['private.zip'] };
  assert.equal(matchesFilters({ url: 'https://ok.example.com/a.ZIP' }, f), true);
  assert.equal(matchesFilters({ url: 'https://blocked.example.com/a.zip' }, f), false);
  assert.equal(matchesFilters({ url: 'https://ok.example.com/a.private.zip' }, f), false);
  assert.equal(matchesFilters({ url: 'https://ok.example.com/a', filename: '/tmp/中文.ZIP' }, f), true);
});
test('link validation supports magnet and rejects unsupported schemes and header injection', () => {
  assert.ok(validateLink('magnet:?xt=urn:btih:abcdef').startsWith('magnet:'));
  for (const s of ['blob:abc', 'data:,abc', 'https://x/\r\nCookie:bad', 'magnet:?dn=x']) assert.throws(() => validateLink(s));
});
test('RPC uses POST, recursively authenticates multicall and hides raw server errors', async () => {
  const server = { url: 'https://rpc.example/jsonrpc', secret: 'secret' };
  let options;
  const fetchImpl = async (url, opts) => { options = opts; const b = JSON.parse(opts.body); return { ok: true, json: async () => ({ jsonrpc: '2.0', id: b.id, result: 'ok' }) }; };
  assert.equal(await rpc(server, 'system.multicall', [[{ methodName: 'aria2.getVersion', params: ['token:old'] }]], { fetchImpl }), 'ok');
  assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(options.body).params[0][0].params, ['token:secret']);
  const reject = async (_, opts) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: JSON.parse(opts.body).id, error: { code: 1, message: 'secret leaked' } }) });
  await assert.rejects(rpc(server, 'aria2.getVersion', [], { fetchImpl: reject }), e => e.kind === 'rejected' && !e.message.includes('leaked'));
  await assert.rejects(rpc(server, 'aria2.getVersion', [], { fetchImpl: async () => { throw Error('secret'); } }), e => e instanceof RpcError && e.kind === 'uncertain' && !e.message.includes('secret'));
});
function request(id, store = 'firefox-container-1', extra = {}) {
  return { requestId: id, url: 'https://a.example/file.zip', timeStamp: 10000, method: 'GET', tabId: 5, frameId: 0, cookieStoreId: store, originUrl: 'https://a.example/page', incognito: false, ...extra };
}
function item(store = 'firefox-container-1', extra = {}) { return { url: 'https://a.example/file.zip', cookieStoreId: store, startTime: new Date(10010).toISOString(), incognito: false, ...extra }; }
function observe(t, req, cookie = 'account=one') { t.before(req); t.headers({ ...req, requestHeaders: [{ name: 'Cookie', value: cookie }, { name: 'User-Agent', value: 'Firefox' }] }); }
test('observed cookies never cross stores and consumed requests are not reused', () => {
  const t = new RequestTracker(() => 11000);
  observe(t, request('1')); observe(t, request('2', 'firefox-container-2'), 'account=two');
  assert.equal(t.match(item()).cookie, 'account=one');
  assert.equal(t.match(item('firefox-container-2')).cookie, 'account=two');
  assert.equal(t.match(item()), null);
});
test('concurrent same URL, missing source, POST redirects, private windows and unknown partition sources are left alone', () => {
  for (const extra of [{ originUrl: undefined }, { method: 'POST' }, { tabId: -1 }, { incognito: true }, { frameId: 8 }]) {
    const t = new RequestTracker(() => 11000); observe(t, request('1', undefined, extra)); assert.equal(t.match(item(undefined, { incognito: Boolean(extra.incognito) })), null);
  }
  const t = new RequestTracker(() => 11000); observe(t, request('1')); observe(t, request('2')); assert.equal(t.match(item()), null);
  const p = new RequestTracker(() => 11000); observe(p, request('1', undefined, { method: 'POST' })); observe(p, request('1')); assert.equal(p.match(item()), null);
});
test('redirect association only forwards headers from final hop, preserving the actual Cookie partition', () => {
  const t = new RequestTracker(() => 11000);
  observe(t, request('1'), 'original=one');
  observe(t, request('1', undefined, { url: 'https://cdn.example/final.zip' }), 'partitioned=two');
  assert.equal(t.match(item(undefined, { finalUrl: 'https://cdn.example/final.zip' })).cookie, 'partitioned=two');
});
test('manual cookies select the top-level partition and refuse ambiguous jars', () => {
  const cookie = { name: 'session', domain: 'a.example', path: '/', value: 'one' };
  const cookies = [{ ...cookie, partitionKey: { topLevelSite: 'https://example.org' } }, { ...cookie, value: 'wrong', partitionKey: { topLevelSite: 'https://evil.org' } }];
  assert.equal(selectCookies(cookies, 'https://www.example.org/page'), 'session=one');
  assert.throws(() => selectCookies([cookie, cookies[0]], 'https://example.org'));
  assert.equal(selectCookies([{ ...cookie, firstPartyDomain: 'evil.org' }], 'https://example.org'), '');
  assert.equal(selectCookies([{ ...cookie, partitionKey: { topLevelSite: 'http://localhost:8081' } }], 'http://localhost:8080'), '');
});
test('header forwarding honors the service toggle and uses remote directory and basename', () => {
  const options = requestOptions({ cookie: 'a=b', referer: 'https://a/', userAgent: 'Firefox' }, { dir: '/remote', forwardCookies: false }, '/local/中文.zip');
  assert.equal(options.dir, '/remote'); assert.equal(options.out, '中文.zip');
  assert.equal(options.header.some(h => h.startsWith('Cookie:')), false);
});
