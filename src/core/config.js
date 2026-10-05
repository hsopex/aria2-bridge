export const CONFIG_VERSION = 1;
export const defaults = () => ({
  version: CONFIG_VERSION, enabled: false, askBeforeDownload: false, defaultServerId: 'local',
  servers: [{ id: 'local', name: '本机 aria2', url: 'http://127.0.0.1:6800/jsonrpc', secret: '', dir: '', forwardCookies: false }],
  filters: { allowDomains: [], denyDomains: [], allowExtensions: [], denyExtensions: [] },
});

export function endpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('RPC 地址必须是 HTTP(S)，不能包含账户、查询参数或片段');
  }
  return url.href;
}

export function normalizeConfig(input) {
  if (!input || input.version !== CONFIG_VERSION) throw new Error('不支持的配置版本');
  if (!Array.isArray(input.servers) || !input.servers.length || input.servers.length > 20) throw new Error('请配置 1–20 个 RPC 服务');
  const ids = new Set();
  const servers = input.servers.map(s => {
    if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id)) throw new Error('RPC 标识无效或重复');
    ids.add(s.id);
    for (const field of ['name', 'secret', 'dir']) if (typeof s[field] !== 'string' || s[field].length > 4096 || /[\r\n\0]/.test(s[field])) throw new Error('RPC 配置字段无效');
    return { id: s.id, name: s.name.trim() || s.id, url: endpoint(s.url), secret: s.secret, dir: s.dir, forwardCookies: s.forwardCookies === true };
  });
  if (!ids.has(input.defaultServerId)) throw new Error('默认 RPC 不存在');
  const filters = {};
  for (const key of ['allowDomains', 'denyDomains', 'allowExtensions', 'denyExtensions']) {
    const list = input.filters?.[key] ?? [];
    if (!Array.isArray(list) || list.length > 200) throw new Error('过滤规则无效');
    filters[key] = [...new Set(list.map(value => {
      if (typeof value !== 'string') throw new Error('过滤规则必须为字符串');
      const v = value.trim().toLowerCase().replace(/\.$/, '');
      if (key.endsWith('Domains')) {
        const host = v.replace(/^\*\./, '');
        if (!host || /[\s/:?#@*]/.test(host)) throw new Error('域名规则只能使用域名或 *.域名');
        const canonical = new URL(`https://${host}`).hostname;
        return (v.startsWith('*.') ? '*.' : '') + canonical;
      }
      const ext = v.replace(/^\./, '');
      if (!/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(ext)) throw new Error('扩展名规则无效');
      return ext;
    }))];
  }
  if (input.askBeforeDownload !== undefined && typeof input.askBeforeDownload !== 'boolean') throw new Error('询问选项无效');
  return { version: CONFIG_VERSION, enabled: input.enabled === true, askBeforeDownload: input.askBeforeDownload === true, defaultServerId: input.defaultServerId, servers, filters };
}

export const serverSignature = s => JSON.stringify([s.url, s.secret]);
export function exportConfig(config) {
  return { ...structuredClone(config), enabled: false, servers: config.servers.map(s => ({ ...s, secret: '' })) };
}

export function validateLink(value) {
  if (typeof value !== 'string' || value.length > 16384 || /[\r\n\0]/.test(value)) throw new Error('链接无效');
  const url = new URL(value.trim());
  if (!['http:', 'https:', 'magnet:'].includes(url.protocol) || url.username || url.password) throw new Error('只支持 HTTP(S) 和磁力链接');
  if (url.protocol === 'magnet:' && !url.searchParams.get('xt')?.startsWith('urn:')) throw new Error('磁力链接缺少 xt');
  return url.href;
}
