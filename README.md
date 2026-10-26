# CommentKeyword agent toolkit

Set up an Instagram **"Comment GUIDE and I'll DM you the link"** automation straight from the AI agent that edits or scripts your Reel.

This repository is the official CommentKeyword toolkit for AI agents. It contains:

| Part | What it does |
|---|---|
| **Agent Skill** [`comment-to-dm-cta`](skills/comment-to-dm-cta/SKILL.md) | Finds or writes the "comment X" CTA in a video's script, transcript, overlays and caption. Helps choose a keyword that won't misfire, and writes the DM. Then sets up the automation. |
| **MCP server** (`commentkeyword-mcp`) | Tools to create, re-target, pause and delete keyword automations through the [CommentKeyword API](https://commentkeyword.com/api-docs). |
| **Claude Code plugin** | Installs both in one step. |

[CommentKeyword](https://commentkeyword.com) sends the DM to everyone who comments the keyword on your post or reel. It uses Meta's official Instagram API.

## How it works

```
You:    Edit this into a Reel. CTA: comment GUIDE to get the free checklist.
Claude: …edits the video, adds a "Comment GUIDE 👇" overlay inside the safe zone, writes the caption…
        Ready to arm the DM:
          Keyword: GUIDE (whole word) · Posts: your next post or reel
          DM: "Here's the checklist, {{namefirst}} 👉 https://…"
          Public reply: "Sent! Check your DMs 📩"
        Create it?
You:    Yes
Claude: Done. GUIDE is waiting for your next post. Publish the Reel, then comment GUIDE from
        another account to test it.
```

The `next_post` target means you don't need the post's ID. The keyword attaches itself to the next post or reel the account publishes.

## Before you start

1. Create a CommentKeyword account at https://commentkeyword.com. API access is included on every plan, including Free.
2. Connect an Instagram professional account (Business or Creator).
3. Create an API token under **Settings → API** (https://commentkeyword.com/settings?tab=api). Give it `keywords:read`, `keywords:write` and `agents:read`. Add `keywords:delete` only if you want the agent to be able to delete automations.

## Install

### Claude Code (skill and MCP server)

```
/plugin marketplace add commentkeyword/agent-toolkit
/plugin install commentkeyword@commentkeyword
```

Claude Code asks for your API token when the plugin is enabled. It stores the token in your system keychain.

### Claude Code (MCP server only)

```bash
claude mcp add --transport stdio --env COMMENTKEYWORD_API_TOKEN=YOUR_TOKEN commentkeyword -- npx -y github:commentkeyword/agent-toolkit
```

### Claude Desktop, Cursor, Windsurf and other MCP clients

Add the server to the client's MCP config. For Claude Desktop that file is `claude_desktop_config.json` (Settings → Developer → Edit Config).

```json
{
  "mcpServers": {
    "commentkeyword": {
      "command": "npx",
      "args": ["-y", "github:commentkeyword/agent-toolkit"],
      "env": { "COMMENTKEYWORD_API_TOKEN": "YOUR_TOKEN" }
    }
  }
}
```

### Skill only (Claude.ai, Claude Desktop, other agents that read `SKILL.md`)

1. Download [`skills/comment-to-dm-cta`](skills/comment-to-dm-cta) as a folder and zip it.
2. In Claude, upload the zip under **Customize → Skills → Upload a skill**.

Without the MCP server, the skill still plans the CTA and the DM. It can also call the REST API directly where the agent has network access (see [`references/api.md`](skills/comment-to-dm-cta/references/api.md)).

### Add-ons for video toolkits

| Toolkit | Add-on |
|---|---|
| [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) | [`integrations/claude-code-video-toolkit`](integrations/claude-code-video-toolkit): a `/comment-dm` command that reads the CTA from the project and arms the DM before you publish |

## MCP tools

| Tool | What it does |
|---|---|
| `create_keyword` | Create an automation. `target` is `next_post`, `all_posts` or `specific_posts`. Also takes the DM variants, optional public replies, link tracking and an optional AI agent. |
| `update_keyword` | Change any field. Re-arm it for the next upload with `target: "next_post"`, or pause it with `isActive: false`. |
| `list_keywords` / `get_keyword` | Check for conflicts and see whether the next post was caught (`nextPostStatus`). |
| `delete_keyword` | Delete an automation. Asks for confirmation when an AI agent is attached. |
| `list_agents` | List AI agents that can continue the conversation after the first DM. |

| Environment variable | |
|---|---|
| `COMMENTKEYWORD_API_TOKEN` | Required. Your personal access token. |
| `COMMENTKEYWORD_API_URL` | Optional. Defaults to `https://commentkeyword.com/api`. |

## Safety

- **Every automation messages real people.** The skill and the tool descriptions tell the agent to confirm the keyword, the DM and the target with you before creating or activating anything.
- **Each token works for one workspace** and can be revoked at any time in Settings → API.
- **Use the narrowest permissions you need.**

## Development

```bash
npm install
npm test           # builds dist/index.mjs and runs the end-to-end tests against a mock API
npm run typecheck
```

`dist/index.mjs` is committed on purpose. It is a single bundled file, so the plugin and `npx github:` work without a build step. Rebuild it with `npm run build` whenever you change `src/`.

## License

MIT. Maintained by [CommentKeyword](https://commentkeyword.com). Issues and PRs welcome.
