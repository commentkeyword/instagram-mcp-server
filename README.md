# Instagram MCP Server (Comment-to-DM)

An open-source **Instagram MCP server** that lets Claude, Cursor, Codex and other AI agents set up **Instagram comment-to-DM automations** ("Comment GUIDE and I'll DM you the link") through Meta's official Instagram API. If you were looking for a **ManyChat MCP** to build comment automations from Claude, this is the alternative that does it: ManyChat's API can't create keyword or comment triggers, so no ManyChat MCP server can either.

Made by [CommentKeyword](https://commentkeyword.com). MIT-licensed. Registry name `com.commentkeyword/mcp`.

| | |
|---|---|
| **What it does** | Creates, re-targets, pauses and deletes Instagram comment-to-DM keyword automations: keyword, public reply, DM, link tracking, optional AI follow-up |
| **How it reaches Instagram** | Meta's official Instagram API (professional accounts). No password, no session cookies, no scraping |
| **Clients** | Claude Code, Claude Desktop, Cursor, Windsurf, Codex and any MCP client that runs a local stdio server |
| **Runs** | Locally with `npx` (Node 18+), no dependencies, no build step. A remote server for claude.ai and ChatGPT is planned |
| **Also in this repo** | An [Agent Skill](skills/comment-to-dm-cta/SKILL.md) that plans the "comment X" CTA of a Reel, a Claude Code plugin, an [n8n template](integrations/n8n) and a [video-toolkit add-on](integrations/claude-code-video-toolkit) |
| **Price** | The MCP server and the REST API are included on every CommentKeyword plan, Free too (300 automated DMs a month, 3 active keywords) |

## What it looks like

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

The `next_post` target means you don't need the post's ID: the automation attaches itself to the next post or Reel the account publishes, so you can set it up while the video is still in the edit.

More prompts that work:

- "Anyone who comments PLAN on my next Reel should get https://example.com/plan by DM. Add a public reply."
- "Re-arm GUIDE for my next upload."
- "Which of my keywords are waiting for a post? Pause the ones from last month."
- "Attach my sales agent to the WEBINAR keyword so it answers follow-up questions."

## Instagram MCP server vs ManyChat MCP

People often search for a ManyChat MCP when what they want is to tell Claude "set up comment-to-DM for my next Reel". As of October 2026:

| Job | Third-party ManyChat MCP servers | This server |
|---|---|---|
| Find a contact, tag them, set a field | Yes | No (not a CRM) |
| Send a message or start a flow you already built | Yes | No |
| Create a keyword / comment-trigger automation | **No**: ManyChat's API has no endpoint for it | Yes |
| Point an automation at your next post or Reel | No | Yes (`next_post`) |
| Edit the DM text | No (it lives in ManyChat's flow editor) | Yes, up to 10 variants |
| Official Instagram API | Through ManyChat | Yes |
| Free plan with API access | No (ManyChat's API is on paid plans) | Yes |

ManyChat is still the better tool if you need WhatsApp, Messenger, TikTok or email in one place, or large multi-branch visual flows. Details: [ManyChat MCP: what exists](https://commentkeyword.com/manychat-mcp) and [ManyChat alternative for comment-to-DM](https://commentkeyword.com/manychat-alternative).

## Instagram MCP servers: how this one differs

Meta has no official MCP server for organic Instagram (its official MCP covers ads), so every Instagram MCP server is third-party. Many log in with your password or a session cookie, or scrape public pages. This one only talks to the CommentKeyword API, which uses Meta's official Instagram login and permissions, and it does one job well: comment-to-DM. It doesn't publish posts, read analytics or read your inbox; pair it with a scheduler or an analytics connector for those. Comparison: [Instagram MCP servers compared](https://commentkeyword.com/instagram-mcp-servers-compared).

## Before you start

1. Create a CommentKeyword account at https://commentkeyword.com. API access is included on every plan, including Free.
2. Connect an Instagram professional account (Business or Creator).
3. Create an API token under **Settings → API** (https://commentkeyword.com/settings?tab=api). Give it `keywords:read`, `keywords:write` and `agents:read`. Add `keywords:delete` only if you want the agent to be able to delete automations.

## Install

### Claude Code (skill and MCP server)

```
/plugin marketplace add commentkeyword/instagram-mcp-server
/plugin install commentkeyword@commentkeyword
```

Claude Code asks for your API token when the plugin is enabled. It stores the token in your system keychain.

### Claude Code (MCP server only)

```bash
claude mcp add --transport stdio --env COMMENTKEYWORD_API_TOKEN=YOUR_TOKEN commentkeyword -- npx -y github:commentkeyword/instagram-mcp-server#v0.2.0
```

### Claude Desktop, Cursor, Windsurf and other MCP clients

Add the server to the client's MCP config. For Claude Desktop that file is `claude_desktop_config.json` (Settings → Developer → Edit Config).

```json
{
  "mcpServers": {
    "commentkeyword": {
      "command": "npx",
      "args": ["-y", "github:commentkeyword/instagram-mcp-server#v0.2.0"],
      "env": { "COMMENTKEYWORD_API_TOKEN": "YOUR_TOKEN" }
    }
  }
}
```

### Skill only (Claude.ai, Claude Desktop, other agents that read `SKILL.md`)

With the [skills CLI](https://skills.sh) (Claude Code, Cursor, Codex and other agents):

```bash
npx skills add commentkeyword/instagram-mcp-server
```

Or by hand:

1. Download [`skills/comment-to-dm-cta`](skills/comment-to-dm-cta) as a folder and zip it.
2. In Claude, upload the zip under **Customize → Skills → Upload a skill**.

Without the MCP server, the skill still plans the CTA and the DM. It can also call the REST API directly where the agent has network access (see [`references/api.md`](skills/comment-to-dm-cta/references/api.md)).

### Add-ons for video toolkits

| Toolkit | Add-on |
|---|---|
| [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) | [`integrations/claude-code-video-toolkit`](integrations/claude-code-video-toolkit): a `/comment-dm` command that reads the CTA from the project and arms the DM before you publish |

### n8n

[`integrations/n8n`](integrations/n8n) has an importable n8n workflow that creates the comment-to-DM automation for your next post through the REST API, with Header Auth and no code.

## MCP tools

| Tool | What it does |
|---|---|
| `create_keyword` | Create an automation. `target` is `next_post`, `all_posts` or `specific_posts`. Also takes up to 10 DM variants, up to 10 public reply variants, link tracking, and an existing AI agent to attach (`aiAgentId`, paid plans). |
| `update_keyword` | Change any field. Re-arm it for the next upload with `target: "next_post"`, or pause it with `isActive: false`. |
| `list_keywords` / `get_keyword` | Check for conflicts and see whether the next post was caught (`nextPostStatus`). |
| `delete_keyword` | Delete an automation. Asks for confirmation when an AI agent is attached. |
| `list_agents` | List the AI agents already set up in your dashboard, so one can be attached to a keyword to continue the conversation after the first DM. Agents are created and edited in the dashboard, not through the API. |

| Environment variable | |
|---|---|
| `COMMENTKEYWORD_API_TOKEN` | Required. Your personal access token. |
| `COMMENTKEYWORD_API_URL` | Optional. Defaults to `https://commentkeyword.com/api`. |

## Network and data

- **One destination.** The MCP server and the skill's curl examples only call the CommentKeyword API, at `https://commentkeyword.com/api` (or `COMMENTKEYWORD_API_URL` if you set it). No telemetry, no other hosts.
- **What gets sent:** your API token (as a Bearer header) and the automation you confirm: keyword, DM and reply text, target posts and options.
- **What comes back:** your keyword automations and the names of your AI agents.
- **Nothing on disk.** The server stores nothing locally.
- **Privacy policy:** https://commentkeyword.com/privacy

## Safety

- **Every automation messages real people.** The skill and the tool descriptions tell the agent to confirm the keyword, the DM and the target with you before creating or activating anything.
- **Each token works for one workspace** and can be revoked at any time in Settings → API.
- **Use the narrowest permissions you need.**

## Development

```bash
npm test   # end-to-end tests: spawns the server over stdio against a mock API
```

The MCP server has no dependencies and no build step. It is two readable files in [`server/`](server): `core.mjs` holds the tools, the validation and the JSON-RPC handling; `commentkeyword-mcp.mjs` is the stdio entry point. It needs Node 18 or newer.

## FAQ

**Is there an official Instagram MCP server?** No. Meta's official MCP server is for ads. Every MCP server for posts, comments and DMs is third-party, so check whether it uses the official API. This one does.

**Does ManyChat have an MCP server?** Not an official one, as of October 2026. Third-party wrappers can tag contacts and trigger existing flows, but can't create comment automations, because ManyChat's API doesn't allow it.

**Can Claude send Instagram DMs with this?** It sets up automations; CommentKeyword then sends the DMs within Instagram's rules: one private reply per comment within 7 days, and more messages within 24 hours after the person writes back.

**Is it allowed by Meta?** It uses Meta's official Instagram API with permissions you approve, and messages only people who commented your keyword. See [Is Instagram DM automation allowed?](https://commentkeyword.com/is-instagram-dm-automation-allowed).

**Does it work with ChatGPT or claude.ai in the browser?** Not yet: those need a remote MCP server, which is planned. Codex, Claude Code, Claude Desktop, Cursor and Windsurf work today.

**What does it cost?** The server is free and open source. The CommentKeyword service has a Free plan that includes the API; paid plans add DMs, keywords and AI agents. [Pricing](https://commentkeyword.com/pricing).

## Links

- [Instagram MCP server: setup for every client](https://commentkeyword.com/instagram-mcp-server)
- [Connect Instagram to Claude](https://commentkeyword.com/connect-instagram-to-claude)
- [Comment-to-DM REST API](https://commentkeyword.com/instagram-automation-api) and [API docs](https://commentkeyword.com/api-docs)

## License

MIT. Maintained by [CommentKeyword](https://commentkeyword.com). Issues and PRs welcome.
