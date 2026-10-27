# Comment-to-DM for a video's CTA (CommentKeyword)

`tools/commentkeyword.py` creates the Instagram automation behind a "Comment GUIDE and I'll
send you the link" CTA: everyone who comments the keyword on the post or reel gets a DM, and
optionally a public reply under their comment. It talks to the
[CommentKeyword API](https://commentkeyword.com/api-docs). The `/comment-dm` command wraps it:
it reads the CTA from the project, drafts the DM, and confirms with you before creating anything.

The default target is the **next post or reel** the account publishes, so you set it up while
the video is still in the edit and publish afterwards (with `/publish-social` or the Instagram app).

> **Disclosure:** CommentKeyword is a hosted third-party service, and this add-on is published
> by CommentKeyword. Its Free plan covers 300 DMs a month and 3 active keywords, with API access;
> paid plans start at $12/month. The toolkit only talks to it when you run this tool with a token
> you created. Instagram only.

---

## One-time setup

1. **Create an account** at [commentkeyword.com](https://commentkeyword.com).
2. **Connect Instagram.** It must be a professional account (Business or Creator).
3. **Create a token** under **Settings → API**
   ([commentkeyword.com/settings?tab=api](https://commentkeyword.com/settings?tab=api)) with
   `keywords:read` and `keywords:write`. The token works for one workspace and can be revoked there.
4. **Add it to `.env`:**

```bash
echo 'COMMENTKEYWORD_API_TOKEN=your_token' >> .env
```

5. **Check it** without creating anything:

```bash
uv run tools/commentkeyword.py --keyword GUIDE --dm "test" --dry-run --json-out
```

`authOk: true` means you're ready. `existing` lists automations that already use the word.
No extra Python dependencies (`requests` and `python-dotenv` are core toolkit dependencies).

---

## Usage

```bash
# Next post or reel (default), with a public reply and click tracking
uv run tools/commentkeyword.py --keyword GUIDE \
    --dm "Here's the guide, {{namefirst}}: https://example.com/guide" \
    --dm "As promised, {{namefirst}}, the guide: https://example.com/guide" \
    --reply "Sent! Check your DMs" --track-links --json-out

# A post that's already live (Instagram media ID)
uv run tools/commentkeyword.py --keyword GUIDE --dm "..." \
    --target specific_posts --media-id 17912345678901234 --json-out

# Reuse an existing automation for a new video
uv run tools/commentkeyword.py --rearm <publicId> --json-out

# Was the post caught?
uv run tools/commentkeyword.py --status <publicId> --json-out

# Pause / list
uv run tools/commentkeyword.py --pause <publicId> --json-out
uv run tools/commentkeyword.py --list --search guide --json-out
```

### Options

| Option | Description |
|--------|-------------|
| `--keyword` | Create an automation for this word |
| `--dm` | DM text; repeat for variants (one is picked per person). Up to 1,000 characters. Placeholders: `{{handle}}`, `{{name}}`, `{{namefirst}}` |
| `--dm-file` | DM variants from a file, separated by a line with only `---` |
| `--reply` | Public reply under the comment; repeat for variants. Up to 500 characters |
| `--target` | `next_post` (default), `all_posts`, `specific_posts` |
| `--media-id` | Instagram media ID, for `specific_posts`; repeatable |
| `--exact` | Match only when the whole comment is the keyword (default: whole word anywhere in the comment) |
| `--without-accents` | Also match without accents, e.g. "guia" for GUÍA |
| `--track-links` | Count clicks on links in the DM |
| `--paused` | Create or re-arm it paused; it doesn't use an active-keyword slot |
| `--rearm ID` | Make an existing automation wait for the next post again, and resume it if it was paused (add `--paused` to keep it paused) |
| `--status ID` / `--pause ID` / `--list` | Inspect, pause, list |
| `--dry-run` | Check the token and print the request; change nothing |
| `--json-out` | One machine-readable JSON line on stdout |

There is no delete command on purpose. Pause an automation here, or delete it in the dashboard.

---

## What Instagram allows

- The DM is a **private reply** to the comment: one per comment, sent within 7 days of it.
- The conversation can only continue if the person writes back.
- Comments from the account itself never trigger a DM, so test from a second account.
- `nextPostStatus: "reconnect_required"` means Instagram must be reconnected in the dashboard.

---

## Troubleshooting

| `errorType` | Meaning | Fix |
|-------------|---------|-----|
| `config` | `COMMENTKEYWORD_API_TOKEN` not set | Add it to `.env` |
| `auth` | Token wrong or revoked | Create a new token |
| `forbidden` | Token lacks a permission | Create one with `keywords:read` and `keywords:write` |
| `validation` | A field is invalid (the message names it) | Fix and re-run |
| `conflict` | The word is already active on the same posts | `--rearm` the existing one, or choose another word |
| `limit` | No free active-keyword slot on the plan | Pause an old keyword, or create with `--paused` |
| `not_found` | No automation with that ID in this workspace | Check `--list` |
| `network` / `http` | No clear answer from the API | Check `--list --search WORD` before trying again |

Create requests are never retried automatically, so an unclear failure never creates a duplicate.

---

## MCP alternative

The same operations are available as MCP tools (`create_keyword`, `update_keyword`,
`list_keywords`, `get_keyword`, `delete_keyword`, `list_agents`) from
[commentkeyword/agent-toolkit](https://github.com/commentkeyword/agent-toolkit):

```bash
claude mcp add --transport stdio --env COMMENTKEYWORD_API_TOKEN=YOUR_TOKEN commentkeyword -- npx -y github:commentkeyword/agent-toolkit#v0.2.0
```

`/comment-dm` works with either.
