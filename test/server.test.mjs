// End-to-end test: spawn the built MCP server over stdio against a local mock of the CommentKeyword API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = fileURLToPath(new URL('../dist/index.mjs', import.meta.url));
const requests = [];
let mock;
let client;

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
          data: { publicId: '11111111-1111-4111-8111-111111111111', keyword: input.keyword, isActive: true, scope: input.scope, nextPostStatus: input.includeNextPost ? 'waiting' : null },
          meta: { authType: 'pat', workspaceId: 1 },
        }));
      }
      if (req.method === 'GET' && req.url.startsWith('/api/keywords')) {
        return res.end(JSON.stringify({ data: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } }));
      }
      if (req.method === 'DELETE') {
        return res.end(JSON.stringify({ message: 'Keyword deleted successfully' }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not Found', message: 'nope' }));
    });
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const { port } = mock.address();

  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, COMMENTKEYWORD_API_TOKEN: 'test-token', COMMENTKEYWORD_API_URL: `http://127.0.0.1:${port}/api/` },
  }));
});

after(async () => {
  await client?.close();
  mock?.close();
});

test('lists the tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['create_keyword', 'delete_keyword', 'get_keyword', 'list_agents', 'list_keywords', 'update_keyword']);
  assert.equal(tools.find((t) => t.name === 'delete_keyword').annotations.destructiveHint, true);
});

test('next_post target arms the keyword for the next upload', async () => {
  const result = await client.callTool({ name: 'create_keyword', arguments: { target: 'next_post', keyword: 'GUIDE', dmMessages: ['Here it is {{namefirst}}: https://example.com'] } });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /waiting for the next post/);
  const sent = requests.at(-1);
  assert.equal(sent.auth, 'Bearer test-token');
  assert.deepEqual(sent.body, { keyword: 'GUIDE', dmMessages: ['Here it is {{namefirst}}: https://example.com'], scope: 'post_specific', includeNextPost: true });
});

test('all_posts maps to global scope', async () => {
  await client.callTool({ name: 'create_keyword', arguments: { target: 'all_posts', keyword: 'PRICE', dmMessages: ['hi'], commentReplies: ['Check your DMs!'] } });
  assert.deepEqual(requests.at(-1).body, { keyword: 'PRICE', dmMessages: ['hi'], commentReplies: ['Check your DMs!'], scope: 'global' });
});

test('specific_posts requires media IDs and does not call the API without them', async () => {
  const before = requests.length;
  const result = await client.callTool({ name: 'create_keyword', arguments: { target: 'specific_posts', keyword: 'X', dmMessages: ['hi'] } });
  assert.equal(result.isError, true);
  assert.equal(requests.length, before);
});

test('API errors come back as tool errors with the API message', async () => {
  const result = await client.callTool({ name: 'create_keyword', arguments: { target: 'all_posts', keyword: 'TAKEN', dmMessages: ['hi'] } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /409.*already exists/);
});

test('list_keywords passes filters as query params', async () => {
  await client.callTool({ name: 'list_keywords', arguments: { search: 'guide', status: 'active', limit: 10 } });
  assert.equal(requests.at(-1).url, '/api/keywords?search=guide&status=active&limit=10');
});

test('delete only confirms when asked', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  await client.callTool({ name: 'delete_keyword', arguments: { id } });
  assert.equal(requests.at(-1).url, `/api/keywords/${id}`);
  await client.callTool({ name: 'delete_keyword', arguments: { id, confirm: true } });
  assert.equal(requests.at(-1).url, `/api/keywords/${id}?confirm=true`);
});
