const TTL = 90000;
const http = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
const header = (headers, name) => (headers || []).filter(h => h.name.toLowerCase() === name).map(h => h.value || '').join(name === 'cookie' ? '; ' : ', ');

// Keep the headers Firefox actually sent, rather than reconstructing a jar from another tab.
// Those headers already reflect containers, FPI, partitioning and SameSite decisions.
export class RequestTracker {
  constructor(now = Date.now) { this.now = now; this.records = new Map(); }
  prune() { for (const [id, r] of this.records) if (this.now() - r.started > TTL) this.records.delete(id); }
  before(details) {
    this.prune();
    if (details.incognito || !http(details.url)) return;
    const old = this.records.get(details.requestId);
    const source = details.originUrl || details.documentUrl;
    const top = details.frameAncestors?.at(-1)?.url || (details.frameId === 0 ? source : null);
    const record = old || { started: details.timeStamp, urls: [], initialMethod: details.method, used: false };
    record.urls.push(details.url);
    Object.assign(record, { url: details.url, method: details.method, storeId: details.cookieStoreId,
      tabId: details.tabId, private: details.incognito, source, top, headersReady: false });
    this.records.set(details.requestId, record);
  }
  headers(details) {
    const record = this.records.get(details.requestId);
    if (!record || record.url !== details.url) return;
    record.headersReady = true;
    record.cookie = header(details.requestHeaders, 'cookie');
    record.referer = header(details.requestHeaders, 'referer');
    record.userAgent = header(details.requestHeaders, 'user-agent');
    record.authorization = header(details.requestHeaders, 'authorization');
  }
  match(item) {
    this.prune();
    const started = Date.parse(item.startTime);
    if (!Number.isFinite(started) || !item.cookieStoreId) return null;
    const candidates = [...this.records.values()].filter(r =>
      r.storeId === item.cookieStoreId && Boolean(r.private) === Boolean(item.incognito) &&
      r.started <= started + 1000 && r.started >= started - 30000 &&
      (r.urls.includes(item.url) || r.urls.includes(item.finalUrl)));
    // Consumed candidates remain until expiry, so simultaneous same-URL downloads cannot reuse them.
    if (candidates.length !== 1) return null;
    const r = candidates[0];
    if (r.used || !r.headersReady || r.initialMethod !== 'GET' || r.method !== 'GET' ||
      r.private || r.tabId < 0 || !http(r.source) || !http(r.top) || r.authorization) return null;
    // Never forward cookies from a redirect hop to an earlier origin.
    if (r.url !== (item.finalUrl || item.url)) return null;
    r.used = true;
    return { url: r.url, cookie: r.cookie, referer: r.referer, userAgent: r.userAgent, storeId: r.storeId, top: r.top };
  }
}

export function requestOptions(context, server, filename) {
  const options = {};
  if (server.dir) options.dir = server.dir;
  if (filename) {
    const name = filename.split(/[\\/]/).pop();
    if (name && name !== '.' && name !== '..' && !/[\r\n\0]/.test(name)) options.out = name;
  }
  if (context) {
    const headers = [];
    for (const [name, value] of [['Referer', context.referer], ['User-Agent', context.userAgent], ['Cookie', server.forwardCookies ? context.cookie : '']]) {
      if (value && !/[\r\n\0]/.test(value)) headers.push(`${name}: ${value}`);
    }
    if (headers.length) options.header = headers;
  }
  return options;
}

// Manual context-menu sends use only the clicked top-level tab's store and site.
// Query all partitions in that store, then select the one corresponding to that site.
export function selectCookies(cookies, topUrl) {
  const top = new URL(topUrl);
  const siteMatches = site => {
    try {
      const u = new URL(site);
      return u.protocol === top.protocol && (!u.port || u.port === top.port) && (top.hostname === u.hostname || top.hostname.endsWith(`.${u.hostname}`));
    } catch { return false; }
  };
  const chosen = cookies.filter(c => {
    if (c.firstPartyDomain && top.hostname !== c.firstPartyDomain && !top.hostname.endsWith(`.${c.firstPartyDomain}`)) return false;
    if (c.partitionKey?.topLevelSite && (!siteMatches(c.partitionKey.topLevelSite) || c.partitionKey.hasCrossSiteAncestor === true)) return false;
    return true;
  });
  const partitions = new Set(chosen.filter(c => c.partitionKey?.topLevelSite).map(c => c.partitionKey.topLevelSite));
  const firstParties = new Set(chosen.filter(c => c.firstPartyDomain).map(c => c.firstPartyDomain));
  if (partitions.size > 1 || firstParties.size > 1) throw new Error('Cookie 分区无法可靠确认');
  // Equal-name/path cookies in two scopes are ambiguous; do not guess their precedence.
  const keys = new Set();
  for (const c of chosen) {
    const key = JSON.stringify([c.name, c.domain, c.path]);
    if (keys.has(key)) throw new Error('Cookie 上下文存在歧义');
    keys.add(key);
  }
  return chosen.sort((a, b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join('; ');
}
