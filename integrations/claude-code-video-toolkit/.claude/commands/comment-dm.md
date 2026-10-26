---
description: Set up the Instagram DM behind a video's "Comment KEYWORD" CTA (CommentKeyword), before you publish
---

# Comment-to-DM for a video's CTA (CommentKeyword)

If a video says "Comment GUIDE and I'll send you the link", every commenter has to get that DM.
This command finds the CTA in the project, makes sure the keyword is the same in the narration,
the on-screen text and the caption, drafts the DM, and creates the automation in
[CommentKeyword](https://commentkeyword.com) with `tools/commentkeyword.py`.

```
project CTA → keyword + DM draft → user OK → dry-run → create (next post) → write back → publish
```

Run it **before** publishing. With the default target, the automation waits for the next post
or reel the Instagram account publishes, so no post ID is needed.

> **One-time setup required.** If `COMMENTKEYWORD_API_TOKEN` isn't in `.env`, point the user at
> `docs/commentkeyword.md` (create an account, connect an Instagram Business or Creator account,
> create a token) and stop until it's set. If the CommentKeyword MCP tools (`create_keyword`,
> `list_keywords`, ...) are connected, you can use them instead of the script; the steps are the same.

## Step 1: Locate the project and its CTA

If the user named a project, use it; otherwise list `projects/*/project.json` and ask. Read
these defensively; not every project has all of them:

| Where | What to read |
|-------|--------------|
| `projects/NAME/scenes.json` (concept-explainer-short) | The scene with `slug: "cta"`, or the last scene: its `text` is the narration *and* the burned captions. Its `asset` (e.g. `images/04_cta.png`) is the end card. |
| `projects/NAME/project.json` | `scenes[]` with `type: "cta"` → `narration`; `publish.title` (the caption on Instagram via `/publish-social`) |
| `projects/NAME/VOICEOVER-SCRIPT.md` | The CTA section of the script |
| `projects/NAME/src/config/*.ts` (Remotion templates, e.g. product-demo) | The `cta` scene's `headline` / `tagline` |
| `projects/NAME/.publish-description.txt` | Caption or description draft, if any |

Look for "comment X", "type X below", "drop X in the comments", "comenta X", "kommentiere X",
"commente X". If the video promises something (guide, template, link, discount) but has no
comment CTA, offer to add one. If it has a CTA but nothing to send, ask what the DM should deliver.

## Step 2: Check the keyword and make it consistent

- **One distinctive word**, related to the promise and easy to type: GUIDE, RECIPE, PRESET. Avoid
  words people comment anyway (YES, LOVE, WOW, an emoji).
- Matching is case-insensitive and whole-word by default: "guide" matches "send me the GUIDE"
  but not "guidelines". For an accented word such as GUÍA, add `--without-accents`.
- **Same word in all three places:** narration, on-screen text and the caption's first line,
  e.g. `Comment GUIDE and I'll DM you the link`. In concept-explainer-short the captions burn the
  narration text, so the word in `scenes.json` is what viewers read; keep the end card's text
  (Ideogram caption) identical, and in the upper or middle of the 9:16 frame, clear of the
  bottom caption area and Instagram's right-side buttons.
- If you change a scene's `text`, re-run `gen_vo.py --force` and `gen_captions.py` for that
  scene, as the template's CLAUDE.md says.

## Step 3: Draft the DM

| Field | How to derive |
|-------|---------------|
| `keyword` | From Step 2 |
| `dm` | First line delivers the promise, with the link: `Here's the guide, {{namefirst}}: https://...`. Up to 1,000 characters. 2-3 variants (`--dm` repeated) read less robotic. Placeholders: `{{handle}}`, `{{name}}`, `{{namefirst}}`. |
| `reply` | Optional public reply under the comment, e.g. `Sent! Check your DMs`. Up to 500 characters. Shows other viewers that it works. |
| `target` | `next_post` (default) for a video that isn't published yet. `specific_posts` + `--media-id` for one already live. `all_posts` only if the keyword is unique to an evergreen offer. |
| `trackLinks` | `--track-links` if the user wants click counts |

Never invent the link. If the project doesn't contain it, ask.

**Show the keyword, the DM variants, the public reply and the target, and let the user edit
them.** An automation sends real messages to real people. Never skip this confirmation.

## Step 4: Dry-run first (creates nothing)

```bash
uv run tools/commentkeyword.py \
  --keyword GUIDE \
  --dm "Here's the guide, {{namefirst}}: https://example.com/guide" \
  --reply "Sent! Check your DMs" \
  --track-links \
  --dry-run --json-out
```

Confirm `authOk` is `true`. If `existing` lists an automation with the same word:
- it's for this same offer → reuse it with `--rearm <publicId>` instead of creating a new one;
- it's active on all posts (`target: "all_posts"`) → pick another word, or the user pauses the old one.

## Step 5: Create

Re-run **without** `--dry-run`, keeping `--json-out`. Expect `nextPostStatus: "waiting"`.

| `errorType` | What to do |
|-------------|------------|
| `config` / `auth` | Token missing or revoked → `docs/commentkeyword.md` |
| `forbidden` | The token needs `keywords:read` and `keywords:write` |
| `conflict` | Same word already active on the same posts → `--rearm` it or choose another word |
| `limit` | No free active-keyword slot (Free plan: 3). Ask the user to pause one, or create it with `--paused` and tell them it won't send until activated |
| `network` / `http` | Unclear whether it was created. Run `--list --search WORD` before trying again; never just re-run |

## Step 6: Write back and report

Merge into the project's `publish` block in `project.json` (keep existing fields):

```json
"publish": {
  "commentKeyword": {
    "publicId": "<publicId>",
    "keyword": "GUIDE",
    "target": "next_post",
    "nextPostStatus": "waiting",
    "createdAt": "<today ISO date>"
  }
}
```

Append a `sessions[]` entry, then report:

```
Comment-to-DM ready

Keyword:  GUIDE (whole word)
Posts:    the next post or reel this Instagram account publishes
DM:       "Here's the guide, {{namefirst}}: https://..."
Reply:    "Sent! Check your DMs"
Status:   waiting
```

Then tell the user:
- **Publish next.** Use `/publish-social` (Upload-Post add-on) or post from the Instagram app.
  The automation catches whatever the account publishes next, so publish this video first.
- **Test it** by commenting the keyword from a *different* Instagram account. Comments from the
  account itself never trigger a DM.
- **Check it later** with `uv run tools/commentkeyword.py --status <publicId>`:
  `attached` means the post was caught; `reconnect_required` means Instagram must be reconnected
  in the CommentKeyword dashboard.

---

## Quick Mode

```
/comment-dm sky-blue-short
/comment-dm sky-blue-short GUIDE
```

Parse the project name and an optional keyword; still show the draft and run a dry-run before
creating anything.

## What Instagram allows

- The DM is a private reply to the comment: one per comment, sent within 7 days of it.
- The conversation continues only if the person writes back.
- Instagram only: comments on TikTok or YouTube Shorts don't trigger anything. If the same video
  goes to those platforms, keep a "link in bio" or pinned-comment fallback there.
