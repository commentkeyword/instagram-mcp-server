// End-to-end tests: spawn the MCP server over stdio against a local mock of the CommentKeyword API.
// No dependencies: a minimal newline-delimited JSON-RPC client stands in for an MCP client.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { validate, TOOLS } from '../server/core.mjs';

const serverPath = fileURLToPath(new URL('../server/commentkeyword-mcp.mjs', import.meta.url));
const KEYWORD_ID = '11111111-1111-4111-8111-111111111111';
const requests = [];
// The last request other than the /usage check that follows saving an active keyword.
const lastApiCall = () => requests.filter((r) => r.url !== '/api/usage').at(-1);
let mock;
let client;
let noToken;

function startClient(env) {
  const child = spawn(process.execPath, [serverPath], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method, params) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
    });
  return {
    request,
    notify: (method, params) => send({ jsonrpc: '2.0', method, params }),
    call: async (name, args) => (await request('tools/call', { name, arguments: args })).result,
    close: () => child.kill(),
  };
}

async function connect(env) {
  const c = startClient(env);
  await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  c.notify('notifications/initialized');
  return c;
}

before(async () => {
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer test-token') {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }));
      }
      if (req.method === 'POST' && req.url === '/api/keywords') {
        const input = JSON.parse(body);
        if (input.keyword === 'TAKEN') {
          res.statusCode = 409;
          return res.end(JSON.stringify({ error: 'Conflict', message: 'This keyword already exists' }));
        }
        res.statusCode = 201;
        return res.end(JSON.stringify({
          data: { publicId: KEYWORD_ID, keyword: input.keyword, isActive: true, scope: input.scope, nextPostStatus: input.includeNextPost ? 'waiting' : null },
          meta: { authType: 'pat', workspaceId: 1 },
        }));
      }
      if (req.method === 'GET' && req.url === '/api/usage') {
        return res.end(JSON.stringify({ data: {
          plan: 'Free', dms: { used: 300, included: 300 }, activeKeywords: { used: 3, limit: 3 },
          instagram: { connected: true, username: 'bakery', needsReconnect: false },
          issues: [
            { code: 'dm_quota_used', message: "This month's Free plan DMs are used up (300 of 300)." },
            { code: 'keyword_limit_reached', message: 'All 3 active keyword slots of the Free plan are in use.' },
          ],
        } }));
      }
      if (req.method === 'GET' && req.url.startsWith('/api/keywords')) {
        return res.end(JSON.stringify({ data: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } }));
      }
      if (req.method === 'PATCH' || req.method === 'DELETE') {
        return res.end(JSON.stringify({ data: { publicId: KEYWORD_ID, keyword: 'GUIDE', isActive: false }, message: 'ok' }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not Found', message: 'nope' }));
    });
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const { port } = mock.address();
  client = await connect({ ...process.env, COMMENTKEYWORD_API_TOKEN: 'test-token', COMMENTKEYWORD_API_URL: `http://127.0.0.1:${port}/api/` });
  const env = { ...process.env };
  delete env.COMMENTKEYWORD_API_TOKEN;
  noToken = await connect(env);
});

after(() => {
  client?.close();
  noToken?.close();
  mock?.close();
});

test('initialize negotiates the protocol and advertises tools', async () => {
  const c = startClient({ ...process.env, COMMENTKEYWORD_API_TOKEN: 'x' });
  try {
    const known = await c.request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    assert.equal(known.result.protocolVersion, '2025-03-26');
    assert.deepEqual(known.result.capabilities, { tools: { listChanged: false } });
    assert.equal(known.result.serverInfo.name, 'commentkeyword');
    const unknown = await c.request('initialize', { protocolVersion: '1999-01-01' });
    assert.equal(unknown.result.protocolVersion, '2025-11-25');
    assert.deepEqual((await c.request('ping')).result, {});
    assert.equal((await c.request('resources/list')).error.code, -32601);
  } finally {
    c.close();
  }
});

test('lists the tools with annotations', async () => {
  const { result } = await client.request('tools/list');
  assert.deepEqual(result.tools.map((t) => t.name).sort(), ['create_keyword', 'delete_keyword', 'get_keyword', 'get_usage', 'list_agents', 'list_keywords', 'update_keyword']);
  const byName = Object.fromEntries(result.tools.map((t) => [t.name, t]));
  assert.equal(byName.delete_keyword.annotations.destructiveHint, true);
  assert.equal(byName.update_keyword.annotations.destructiveHint, true);
  assert.equal(byName.list_keywords.annotations.openWorldHint, false);
  for (const tool of result.tools) assert.equal(tool.inputSchema.type, 'object');
});

test('next_post target arms the keyword for the next upload', async () => {
  const result = await client.call('create_keyword', { target: 'next_post', keyword: 'GUIDE', dmMessages: ['Here it is {{namefirst}}: https://example.com'] });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /waiting for the next post/);
  // Says plainly that DMs can't go out, without the keyword-slot note or upgrade links.
  assert.match(result.content[0].text, /Heads-up: This month's Free plan DMs are used up \(300 of 300\)\./);
  assert.doesNotMatch(result.content[0].text, /slots|upgrade|checkout/i);
  const sent = lastApiCall();
  assert.equal(sent.auth, 'Bearer test-token');
  assert.deepEqual(sent.body, { keyword: 'GUIDE', dmMessages: ['Here it is {{namefirst}}: https://example.com'], scope: 'post_specific', includeNextPost: true });
});

test('all_posts maps to global scope and passes variants and the agent', async () => {
  const agent = '22222222-2222-4222-8222-222222222222';
  await client.call('create_keyword', { target: 'all_posts', keyword: 'PRICE', dmMessages: ['a', 'b'], commentReplies: ['Check your DMs!'], aiAgentId: agent });
  assert.deepEqual(lastApiCall().body, { keyword: 'PRICE', dmMessages: ['a', 'b'], commentReplies: ['Check your DMs!'], aiAgentId: agent, scope: 'global' });
});

test('invalid arguments are tool errors and never reach the API', async () => {
  const before = requests.length;
  const cases = [
    { target: 'specific_posts', keyword: 'X', dmMessages: ['hi'] },
    { target: 'next_post', keyword: 'X', dmMessages: [] },
    { target: 'next_post', keyword: 'X', dmMessages: Array(11).fill('hi') },
    { target: 'somewhere', keyword: 'X', dmMessages: ['hi'] },
    { target: 'next_post', dmMessages: ['hi'] },
    { target: 'next_post', keyword: 'X', dmMessages: ['hi'], aiAgentId: 'not-a-uuid' },
    { target: 'next_post', keyword: 'X', dmMessages: ['hi'], delaySec: 5 },
  ];
  for (const args of cases) {
    const result = await client.call('create_keyword', args);
    assert.equal(result.isError, true, JSON.stringify(args));
  }
  assert.equal(requests.length, before);
});

test('API errors come back as tool errors with the API message', async () => {
  const result = await client.call('create_keyword', { target: 'all_posts', keyword: 'TAKEN', dmMessages: ['hi'] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /409.*already exists/);
});

test('update re-targets, pauses and detaches the agent', async () => {
  await client.call('update_keyword', { id: KEYWORD_ID, target: 'next_post' });
  assert.deepEqual(lastApiCall(), { method: 'PATCH', url: `/api/keywords/${KEYWORD_ID}`, auth: 'Bearer test-token', body: { scope: 'post_specific', includeNextPost: true } });
  await client.call('update_keyword', { id: KEYWORD_ID, isActive: false, aiAgentId: null });
  assert.deepEqual(requests.at(-1).body, { isActive: false, aiAgentId: null });
});

test('list_keywords passes filters as query params', async () => {
  await client.call('list_keywords', { search: 'guide', status: 'active', limit: 10 });
  assert.equal(requests.at(-1).url, '/api/keywords?search=guide&status=active&limit=10');
});

test('delete only confirms when asked', async () => {
  await client.call('delete_keyword', { id: KEYWORD_ID });
  assert.equal(requests.at(-1).url, `/api/keywords/${KEYWORD_ID}`);
  await client.call('delete_keyword', { id: KEYWORD_ID, confirm: true });
  assert.equal(requests.at(-1).url, `/api/keywords/${KEYWORD_ID}?confirm=true`);
});

test('get_usage summarises the plan and what blocks DMs', async () => {
  const result = await client.call('get_usage', {});
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /Plan: Free\. DMs this period: 300 of 300 used\. Active keywords: 3 of 3\./);
  assert.match(result.content[0].text, /Heads-up: All 3 active keyword slots/);
});

test('TOOL_SCOPES covers every tool', async () => {
  const { TOOL_SCOPES } = await import('../server/core.mjs');
  assert.deepEqual(Object.keys(TOOL_SCOPES).sort(), TOOLS.map((t) => t.name).sort());
});

test('unknown tools get a JSON-RPC error', async () => {
  const unknown = await client.request('tools/call', { name: 'nope', arguments: {} });
  assert.equal(unknown.error.code, -32602);
});

test('starts without a token and reports it on tool calls', async () => {
  const { result } = await noToken.request('tools/list');
  assert.equal(result.tools.length, 7);
  const call = await noToken.call('list_keywords', {});
  assert.equal(call.isError, true);
  assert.match(call.content[0].text, /COMMENTKEYWORD_API_TOKEN is not set/);
});

test('validator accepts every tool with only its required fields', () => {
  const samples = {
    list_keywords: {},
    get_keyword: { id: KEYWORD_ID },
    create_keyword: { target: 'next_post', keyword: 'GUIDE', dmMessages: ['hi'] },
    update_keyword: { id: KEYWORD_ID },
    delete_keyword: { id: KEYWORD_ID },
    list_agents: {},
    get_usage: {},
  };
  for (const tool of TOOLS) assert.deepEqual(validate(tool.inputSchema, samples[tool.name]), [], tool.name);
});
