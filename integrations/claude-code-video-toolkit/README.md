# CommentKeyword add-on for claude-code-video-toolkit

When a video rendered with [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit)
ends on "Comment GUIDE and I'll send you the link", this add-on sets up the Instagram automation
that sends that DM to every commenter, through the [CommentKeyword](https://commentkeyword.com) API.

It adds a `/comment-dm` Claude Code command and a standalone `tools/commentkeyword.py` script.
The command reads the CTA from the project (`scenes.json`, `project.json`, `VOICEOVER-SCRIPT.md`),
checks that the keyword is the same in the narration, on screen and in the caption, drafts the DM,
asks you to confirm, and creates the automation for the **next post or reel** you publish.
Run it before `/publish-social` or before posting from the Instagram app.

## Install

From the root of your toolkit checkout:

```bash
git clone --depth 1 https://github.com/commentkeyword/agent-toolkit.git /tmp/ck-addon
cp /tmp/ck-addon/integrations/claude-code-video-toolkit/tools/commentkeyword.py tools/
cp /tmp/ck-addon/integrations/claude-code-video-toolkit/docs/commentkeyword.md docs/
cp /tmp/ck-addon/integrations/claude-code-video-toolkit/.claude/commands/comment-dm.md .claude/commands/
cat /tmp/ck-addon/integrations/claude-code-video-toolkit/.env.example >> .env   # then fill in the token
```

Optional: the `comment-to-dm-cta` skill, so Claude also applies the CTA guidance while scripting
and editing, not only when you run the command:

```bash
cp -r /tmp/ck-addon/skills/comment-to-dm-cta .claude/skills/
```

The files are new, so nothing in the toolkit is overwritten. `requests` and `python-dotenv` are
already toolkit dependencies.

## Setup

1. Create an account at [commentkeyword.com](https://commentkeyword.com) and connect an Instagram
   professional (Business or Creator) account.
2. Create a token under [Settings → API](https://commentkeyword.com/settings?tab=api) with
   `keywords:read` and `keywords:write`.
3. Put `COMMENTKEYWORD_API_TOKEN` in `.env`.
4. Check it without creating anything:

```bash
uv run tools/commentkeyword.py --keyword GUIDE --dm "test" --dry-run --json-out
```

`authOk: true` means you're ready.

## Use

In Claude Code:

```
/comment-dm my-short
```

Or call the script directly:

```bash
uv run tools/commentkeyword.py --keyword GUIDE \
    --dm "Here's the guide, {{namefirst}}: https://example.com/guide" \
    --reply "Sent! Check your DMs" --json-out
```

Full options and troubleshooting: [docs/commentkeyword.md](docs/commentkeyword.md).

## Safe by default

- **Asks first.** `/comment-dm` shows the keyword, the DM, the public reply and the target, and
  waits for your OK. An automation messages real people.
- **Dry run.** `--dry-run` checks the token, lists automations that already use the word, and
  prints the request without creating anything.
- **No duplicates.** Create requests are never retried; after an unclear failure the tool tells
  you to check `--list` first.
- **No delete.** Pause from here; delete in the dashboard.

## Links

- CommentKeyword: https://commentkeyword.com
- API docs: https://commentkeyword.com/api-docs
- claude-code-video-toolkit: https://github.com/digitalsamba/claude-code-video-toolkit

CommentKeyword is a hosted third-party service; this add-on only talks to it when you run it with
a token you created. Its Free plan covers 300 DMs a month and 3 active keywords, API included.
Instagram only. MIT licensed.
