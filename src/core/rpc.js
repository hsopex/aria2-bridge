export class RpcError extends Error {
  constructor(kind, code) {
    super(kind === 'rejected' ? `aria2 拒绝请求${Number.isInteger(code) ? `（${code}）` : ''}` : 'RPC 连接中断或响应无法确认');
    this.kind = kind;
    this.code = code;
  }
}

function authenticate(method, params, secret) {
  const copy = structuredClone(params ?? []);
  if (!Array.isArray(copy)) throw new Error('RPC 参数必须为数组');
  // AriaNg never receives a secret. Replace any legacy token, including multicall tokens.
  if (method === 'system.multicall') {
    if (!Array.isArray(copy[0]) || copy[0].length > 1000) throw new Error('批量 RPC 参数无效');
    copy[0] = copy[0].map(call => ({ methodName: call.methodName, params: authenticate(call.methodName, call.params, secret) }));
  } else if (method.startsWith('aria2.')) {
    if (typeof copy[0] === 'string' && copy[0].startsWith('token:')) copy.shift();
    if (secret) copy.unshift(`token:${secret}`);
  } else if (!['system.listMethods', 'system.listNotifications'].includes(method)) throw new Error('不支持的 RPC 方法');
  return copy;
}

export async function rpc(server, method, params = [], { fetchImpl = fetch, timeout = 10000 } = {}) {
  if (!/^(aria2\.[a-zA-Z]+|system\.(multicall|listMethods|listNotifications))$/.test(method)) throw new Error('RPC 方法无效');
  const id = crypto.randomUUID();
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: authenticate(method, params, server.secret) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new RpcError('uncertain');
    const data = await response.json();
    if (data?.jsonrpc !== '2.0' || data.id !== id) throw new RpcError('uncertain');
    if (data.error && Number.isInteger(data.error.code)) throw new RpcError('rejected', data.error.code);
    if (!Object.hasOwn(data, 'result')) throw new RpcError('uncertain');
    return data.result;
  } catch (error) {
    if (error instanceof RpcError) throw error;
    throw new RpcError('uncertain');
  } finally { clearTimeout(timer); }
}

export function makeGid() {
  let gid;
  do { gid = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''); } while (/^0+$/.test(gid));
  return gid;
}
