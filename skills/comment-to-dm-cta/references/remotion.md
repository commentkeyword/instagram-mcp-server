# Comment box for a Remotion video

An animated Instagram comment box for the last seconds of a Reel. It types the keyword, posts it, shows the account's public reply with its profile picture, then swipes to the DM chat and shows the DM arriving. Viewers see exactly what to do and what they get back.

Preview and full docs: https://github.com/commentkeyword/instagram-mcp-server/tree/main/integrations/remotion

## 1. Add the files

If the commentkeyword plugin is installed, the files are in the plugin's `integrations/remotion/` folder. Otherwise download them into the Remotion project:

```bash
mkdir -p src/comment-box
for f in CommentBox.tsx commentkeyword.mjs Example.tsx; do
  curl -fsSL "https://raw.githubusercontent.com/commentkeyword/instagram-mcp-server/main/integrations/remotion/$f" -o "src/comment-box/$f"
done
```

`CommentBox.tsx` depends only on `remotion`. `Example.tsx` also uses `@remotion/google-fonts`. Skip it if you place the box in an existing composition.

## 2. Place it at the end of the video

```tsx
import { Sequence } from "remotion";
import { CommentBox } from "./comment-box/CommentBox";
import props from "../props.json";   // from step 3

<Sequence from={Math.round(27 * fps)} durationInFrames={Math.round(5.5 * fps)}>
  <CommentBox {...props} cps={13} fontFamily={fontFamily} labels="en" />
</Sequence>
```

- Start it just after the narration says the keyword, so the typing sound doesn't cover the word.
- Give it about 5.5 s. With `cps` 12-15 the animation takes about 4.5 s, then holds so people can read the DM.
- Use the video's language for `labels` (`en`, `es`, `pt`, `fr`, `de`, `it`) and its font for `fontFamily`.
- The default position keeps the box above Reels' caption area.
- `commentBoxTimes(keyword, { cps })` gives the moments for sound effects: typing, send, reply, swipe and DM.

## 3. Fill it from the automation

Do this after the automation exists (SKILL.md step 5), so the box shows the texts the account really sends. The token goes in the environment, never in the bundle or in project files:

```bash
node src/comment-box/commentkeyword.mjs GUIDE --name Maria > props.json
```

- It reads `COMMENTKEYWORD_API_TOKEN` (`keywords:read` is enough).
- The output holds `keyword`, `reply`, `dm`, `replyHandle` and `replyAvatarSrc` (the profile picture as a `data:` URI).
- `--name` fills `{{namefirst}}` and `{{name}}` with an example viewer's name, because the video can't know who is watching. Use a name that fits the audience.
- Pass every `warning:` it prints on stderr on to the user: a paused automation, no public reply, or Instagram needing a reconnect.
- If it stops with "no automation", create the automation first. Don't type the texts in by hand instead.

## 4. Without CommentKeyword

Pass `keyword`, `reply`, `dm` and `replyHandle` as props yourself. Use only texts that the user's own tool really sends, and leave out `dm` if no DM is sent. The box then ends on the public reply.

## 5. Check it

Render a still at the DM moment and look at it before rendering the full video:

```bash
npx remotion still CompositionId out/cta-check.png --frame=<sequence start + (dmMessageAt + 0.6) × fps>
```

The link in the DM is highlighted. Check that it is the right link, and that the handle and picture are the user's account.
