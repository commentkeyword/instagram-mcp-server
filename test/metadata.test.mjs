// Keeps the release metadata (package.json, manifest.json for the MCPB bundle, server.json for the
// MCP Registry, the Claude Code plugin) in step with the server, so a version bump can't miss a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { SERVER_VERSION, TOOLS } from '../server/core.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const pkg = read('package.json');
const manifest = read('manifest.json');
const server = read('server.json');
const plugin = read('.claude-plugin/plugin.json');
const bundle = server.packages[0];
const bundleName = `commentkeyword-mcp-${SERVER_VERSION}.mcpb`;

test('every metadata file carries the server version', () => {
  for (const [file, version] of [
    ['package.json', pkg.version],
    ['manifest.json', manifest.version],
    ['server.json', server.version],
    ['server.json packages[0]', bundle.version],
    ['.claude-plugin/plugin.json', plugin.version],
  ]) {
    assert.equal(version, SERVER_VERSION, `${file} version`);
  }
});

test('the MCPB manifest lists exactly the server tools and runs the stdio entry point', () => {
  assert.deepEqual(manifest.tools.map((t) => t.name).sort(), TOOLS.map((t) => t.name).sort());
  assert.equal(manifest.server.entry_point, 'server/commentkeyword-mcp.mjs');
  assert.deepEqual(manifest.server.mcp_config.args, ['${__dirname}/server/commentkeyword-mcp.mjs']);
  assert.equal(manifest.server.mcp_config.env.COMMENTKEYWORD_API_TOKEN, '${user_config.api_token}');
  assert.equal(manifest.user_config.api_token.sensitive, true);
});

test('server.json points at this version\'s GitHub release asset', () => {
  assert.equal(server.name, 'com.commentkeyword/mcp');
  assert.ok(server.description.length <= 100, 'the registry limits description to 100 characters');
  assert.equal(bundle.registryType, 'mcpb');
  assert.equal(
    bundle.identifier,
    `https://github.com/commentkeyword/instagram-mcp-server/releases/download/v${SERVER_VERSION}/${bundleName}`,
  );
  assert.match(bundle.fileSha256, /^[a-f0-9]{64}$/);
  const token = bundle.environmentVariables.find((v) => v.name === 'COMMENTKEYWORD_API_TOKEN');
  assert.equal(token.isRequired, true);
  assert.equal(token.isSecret, true);
});

const localBundle = new URL(`../release/${bundleName}`, import.meta.url);
test('server.json fileSha256 matches the locally built bundle', { skip: !existsSync(localBundle) && 'release/ bundle not built' }, () => {
  const sha = createHash('sha256').update(readFileSync(localBundle)).digest('hex');
  assert.equal(bundle.fileSha256, sha, 'rebuilt bundle: update fileSha256 in server.json (see PUBLISHING.md)');
});
