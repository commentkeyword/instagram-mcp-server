# n8n template: comment-to-DM automation for your next post

[`instagram-comment-to-dm-next-post.json`](instagram-comment-to-dm-next-post.json) is an n8n workflow
that creates an Instagram comment-to-DM automation in [CommentKeyword](https://commentkeyword.com/instagram-automation-api):
when someone comments your keyword ("comment GUIDE"), they get your DM, and optionally a public reply.

With `target` set to `next_post`, the automation waits for the next post or reel you publish and
attaches to it, so you don't need a post ID. That fits a content pipeline: create the keyword when
the video is ready, then publish. Use `all_posts` to listen on every post.

## Nodes

1. **Run it**: manual trigger. Swap it for a schedule, a form, a webhook or the end of your
   publishing flow.
2. **Your automation**: the keyword, DM text, public reply and target.
3. **Create the automation**: `POST https://commentkeyword.com/api/keywords` with Header Auth.
4. **Result**: the automation's public ID, keyword, whether it's active, and its status.

## Setup

1. Create a CommentKeyword account and connect your Instagram professional account. API access is
   included on every plan, Free too.
2. In **Settings → API**, create a token with `keywords:read` and `keywords:write`.
3. In n8n, import the JSON (**Workflows → Import from file**).
4. Open **Create the automation** and add a **Header Auth** credential: name `Authorization`, value
   `Bearer <your token>`.
5. Edit **Your automation** and run the workflow.

The automation messages real people who comment the keyword, so check the text first. The DM can use
`{{namefirst}}`, `{{name}}` and `{{handle}}`, which are filled in per person.

## Errors

| HTTP | Meaning |
|---|---|
| 401 | Wrong or revoked token |
| 403 | The token lacks `keywords:write` |
| 409 | The word is already active on the same posts, or no active-keyword slot is free on the plan |

Tested on n8n 2.43.4 against the live API.

Full API reference: https://commentkeyword.com/api-docs (OpenAPI: https://commentkeyword.com/openapi.json).
