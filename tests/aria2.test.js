import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../src/core/rpc.js';
import { createServer } from 'node:http';

// Protocol integration: a real HTTP JSON-RPC endpoint, including a lost response.
test('HTTP transport detects lost responses without retrying and rejects redirect credentials', async () => {
  let additions = 0;
  const remote = createServer(async (req, res) => {
    let raw = ''; for await (const data of req) raw += data;
    const body = JSON.parse(raw);
    if (body.method === 'aria2.addUri') { additions++; req.socket.destroy(); return; }
    if (body.method === 'aria2.getVersion') { res.writeHead(302, { Location: '/other' }); res.end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { gid: '1234567890abcdef', status: 'paused' } }));
  });
  try {
    await new Promise(ok => remote.listen(0, '127.0.0.1', ok));
    const server = { url: `http://127.0.0.1:${remote.address().port}/jsonrpc`, secret: 'test' };
    await assert.rejects(rpc(server, 'aria2.addUri', [['http://example.org/file'], { gid: '1234567890abcdef', pause: 'true' }]), e => e.kind === 'uncertain');
    assert.equal(additions, 1);
    assert.equal((await rpc(server, 'aria2.tellStatus', ['1234567890abcdef'])).status, 'paused');
    await assert.rejects(rpc(server, 'aria2.getVersion'), e => e.kind === 'uncertain');
  } finally { remote.closeAllConnections(); await new Promise(ok => remote.close(ok)); }
});
