# Publishing

How the MCP server is released and listed. There is no npm package: the server ships as an
[MCPB bundle](https://github.com/modelcontextprotocol/mcpb) attached to a GitHub release, and
directories point at that file.

| File | What it is |
|---|---|
| `manifest.json` | MCPB manifest (spec 0.3). Claude Desktop and other MCPB clients read it to install the server and ask for the API token. |
| `.mcpbignore` | Keeps the bundle to `manifest.json`, `server/`, `README.md` and `LICENSE`. |
| `server.json` | Entry for the [official MCP Registry](https://registry.modelcontextprotocol.io), name `com.commentkeyword/mcp`. |
| `release/` | Built bundles (git-ignored). Upload them; don't commit them. |

`npm test` checks that the versions, the tool list and the release URL agree across these files,
and that `fileSha256` matches `release/commentkeyword-mcp-<version>.mcpb` when it exists.

## 1. Build the bundle

Bump the version in `package.json`, `manifest.json`, `server.json` (both `version` fields and the
`identifier` URL), `.claude-plugin/plugin.json` and `SERVER_VERSION` in `server/core.mjs`. Then:

```bash
npx -y @anthropic-ai/mcpb@2.1.2 validate manifest.json
npx -y @anthropic-ai/mcpb@2.1.2 pack . release/commentkeyword-mcp-0.2.0.mcpb
openssl dgst -sha256 release/commentkeyword-mcp-0.2.0.mcpb
```

Put the hash in `server.json` → `packages[0].fileSha256` and run `npm test`.

**Every `pack` produces a different file** (zip timestamps), so a rebuilt bundle needs a new hash.
Upload exactly the file whose hash is in `server.json`. MCP clients refuse a download whose hash
doesn't match.

## 2. GitHub release

The repository must be public: the registry checks that the asset URL answers before it accepts
the entry.

The local `v0.2.0` tag was made before `manifest.json` and `server.json` existed. The server code
is the same, but if you want the tagged source to include them, move the tag before its first
push: `git tag -f v0.2.0 main`.

```bash
git push origin main
git push origin v0.2.0
gh release create v0.2.0 release/commentkeyword-mcp-0.2.0.mcpb --verify-tag \
  --title "v0.2.0" --notes "MCP server bundle (MCPB) for Claude Desktop and other MCP clients."
```

Check the uploaded file:

```bash
curl -sL https://github.com/commentkeyword/instagram-mcp-server/releases/download/v0.2.0/commentkeyword-mcp-0.2.0.mcpb | openssl dgst -sha256
```

## 3. Prove commentkeyword.com to the MCP Registry (once)

The registry grants the `com.commentkeyword/*` namespace to whoever holds the private key whose
public key is served at `https://commentkeyword.com/.well-known/mcp-registry-auth` (200, plain
text, no redirects). The website serves that file from the `MCP_REGISTRY_AUTH` variable and
returns 404 while it is unset.

Generate the key **outside every repository** (OpenSSL 3+; Git Bash on Windows works):

```bash
cd "$(mktemp -d)"
openssl genpkey -algorithm Ed25519 -out key.pem
echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
```

- **Private key** (`key.pem`): store it in the password manager, then delete the temp copy. Never
  commit it, never put it in Railway or any `.env`. Whoever has it can publish as
  `com.commentkeyword/*`.
- **Public record** (the `v=MCPv1; ...` line): set it as `MCP_REGISTRY_AUTH` on the Railway
  **web** service (production), with the website commit that adds the route deployed.

Check it the way the registry fetches it:

```bash
curl -sS -o - -w '\n%{http_code}\n' -H 'Accept: text/plain' -A 'mcp-registry/1.0' \
  https://commentkeyword.com/.well-known/mcp-registry-auth
```

Expect the record and `200`. A `3xx`, a challenge page, or a WAF block fails the login.

## 4. Publish to the MCP Registry

Install [`mcp-publisher`](https://github.com/modelcontextprotocol/registry/releases) (tested with
1.8.4), then from this folder, with `key.pem` restored from the password manager:

```bash
mcp-publisher validate
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --domain commentkeyword.com --private-key "$PRIVATE_KEY"
mcp-publisher publish
```

Then delete `key.pem` again. Confirm the listing:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=com.commentkeyword"
```

Keep `MCP_REGISTRY_AUTH` set: the next version's login needs it. To rotate the key, generate a new
pair, replace the variable, and log in with the new private key.

## 5. Smithery (not used)

Smithery shuts down its accounts, API, CLI and hosted proxy on 2026-10-31. smithery.ai continues as a
curated directory that lists vendors' remote MCP URLs, so there is nothing to publish there for a
local stdio server. Revisit if CommentKeyword ships a hosted remote MCP server.

## Docs

- MCP Registry: [quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx), [authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx), [package types (MCPB)](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx)
- [MCPB manifest spec](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md) and [CLI](https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md)
