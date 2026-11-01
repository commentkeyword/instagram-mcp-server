// Tests for integrations/remotion/commentkeyword.mjs against a local mock of the CommentKeyword API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cleanText, commentBoxProps, fold, pickAutomation } from '../integrations/remotion/commentkeyword.mjs';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
let mock;
let apiUrl;
let accountMode = 'connected';

const keywords = [
  { id: 'a', keyword: 'Guía', isActive: false, commentReplies: ['Old reply'], dmMessages: ['Old DM'], publicReplyEnabled: true },
  {
    id: 'b', keyword: 'GUIA', isActive: true, publicReplyEnabled: true, nextPostStatus: 'waiting',
    commentReplies: ['¡Te lo he mandado por DM, {{namefirst}}! 📩'],
    dmMessages: ['Hey {{namefirst}} , here it is 👉 example.com/guia'],
  },
  { id: 'c', keyword: 'QUIET', isActive: true, publicReplyEnabled: false, commentReplies: ['Hidden'], dmMessages: ['Here {{handle}}'] },
];

before(async () => {
  mock = http.createServer((req, res) => {
    if (req.url === '/avatar.png') {
      res.setHeader('Content-Type', 'image/png');
      return res.end(PNG);
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-token') {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }));
    }
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/keywords') {
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      assert.ok(limit <= 100);
      // two pages, to prove pagination is followed
      const data = offset === 0 ? keywords.slice(0, 2) : keywords.slice(2);
      return res.end(JSON.stringify({ data, pagination: { hasMore: offset === 0 } }));
    }
    if (url.pathname === '/api/account') {
      if (accountMode === 'missing') {
        res.statusCode = 404;
        return res.end('{}');
      }
      const instagram = accountMode === 'disconnected'
        ? { connected: false, username: null, profilePictureUrl: null }
        : { connected: true, username: 'maria.fit', profilePictureUrl: `${apiUrl.replace('/api', '')}/avatar.png` };
      return res.end(JSON.stringify({ data: { instagram }, meta: {} }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${mock.address().port}/api`;
});

after(() => mock.close());

test('fold ignores case and accents', () => {
  assert.equal(fold(' Guía '), 'guia');
});

test('cleanText fills or drops the per-commenter placeholders', () => {
  assert.equal(cleanText('¡Te lo he mandado, {{namefirst}}! 📩'), '¡Te lo he mandado! 📩');
  assert.equal(cleanText('Hey {{namefirst}} , here it is', { name: 'Maria Lopez' }), 'Hey Maria, here it is');
  assert.equal(cleanText('Thanks {{name}}', { name: 'Maria Lopez' }), 'Thanks Maria Lopez');
  assert.equal(cleanText('Sent, {{handle}}!', { handle: '@maria.fit' }), 'Sent, @maria.fit!');
  assert.equal(cleanText('{{namefirst}}, here it is'), 'here it is');
});

test('pickAutomation prefers the active automation for the keyword', () => {
  assert.equal(pickAutomation(keywords, 'guia').id, 'b');
  assert.equal(pickAutomation(keywords, 'nope'), null);
});

test('commentBoxProps reads the reply, DM, handle and picture of the automation', async () => {
  accountMode = 'connected';
  const { props, warnings } = await commentBoxProps('guía', { token: 'test-token', apiUrl, name: 'Maria' });
  assert.deepEqual(props, {
    keyword: 'GUÍA',
    reply: '¡Te lo he mandado por DM, Maria! 📩',
    dm: 'Hey Maria, here it is 👉 example.com/guia',
    replyHandle: 'maria.fit',
    replyAvatarSrc: `data:image/png;base64,${PNG.toString('base64')}`,
  });
  assert.deepEqual(warnings, []);
});

test('commentBoxProps warns instead of inventing a reply the account does not post', async () => {
  const { props, warnings } = await commentBoxProps('QUIET', { token: 'test-token', apiUrl, dm: false, avatar: false });
  assert.equal(props.reply, undefined);
  assert.equal(props.dm, undefined);
  assert.equal(props.replyAvatarSrc, undefined);
  assert.match(warnings.join('\n'), /no public reply/);
});

test('commentBoxProps falls back when the account is unknown or disconnected', async () => {
  accountMode = 'missing';
  let result = await commentBoxProps('GUIA', { token: 'test-token', apiUrl });
  assert.equal(result.props.replyHandle, 'youraccount');
  assert.match(result.warnings.join('\n'), /no \/account endpoint/);

  accountMode = 'disconnected';
  result = await commentBoxProps('GUIA', { token: 'test-token', apiUrl });
  assert.match(result.warnings.join('\n'), /No Instagram account is connected/);
  accountMode = 'connected';
});

test('commentBoxProps refuses a keyword with no automation, and a missing token', async () => {
  await assert.rejects(commentBoxProps('NOPE', { token: 'test-token', apiUrl }), /No automation for "NOPE"/);
  await assert.rejects(commentBoxProps('GUIA', { apiUrl }), /COMMENTKEYWORD_API_TOKEN/);
  await assert.rejects(commentBoxProps('GUIA', { token: 'bad', apiUrl }), /401/);
});
