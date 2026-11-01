// A 1080x1920 composition with the CommentBox over a background, plus optional sound effects on its beats.
// Register it in your Root.tsx:
//
//   import { Composition } from "remotion";
//   import { CommentBoxDemo } from "./Example";
//
//   <Composition id="CommentBoxDemo" component={CommentBoxDemo} width={1080} height={1920} fps={30}
//     durationInFrames={180} defaultProps={{ keyword: "GUIDE", reply: "Sent! Check your DMs 📩",
//     dm: "Here's your guide 👉 example.com/guide", replyHandle: "youraccount" }} />
//
// Then fill the props from your real automation:
//   COMMENTKEYWORD_API_TOKEN=... node commentkeyword.mjs GUIDE > props.json
//   npx remotion render CommentBoxDemo out/cta.mp4 --props=props.json
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { CommentBox, commentBoxTimes, type CommentBoxProps } from "./CommentBox";

const { fontFamily } = loadFont("normal", { weights: ["600", "700", "800"] });

type Props = CommentBoxProps & {
  sfx?: { typing?: string; click?: string; pop?: string; swipe?: string; dm?: string };   // files in public/, e.g. "sfx/click.wav"
};

export const CommentBoxDemo: React.FC<Props> = ({ sfx, ...props }) => {
  const { fps } = useVideoConfig();
  const start = Math.round(0.3 * fps);                     // the box appears at 0.3 s
  const times = commentBoxTimes(props.keyword, { cps: 12, ...props });
  const at = (s: number) => start + Math.round(s * fps);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 80% at 50% 25%, #2a1240 0%, #0b0b12 70%)" }}>
      <Sequence from={start}>
        <CommentBox cps={12} {...props} fontFamily={fontFamily} />
      </Sequence>
      {sfx?.typing ? <Sequence from={at(times.typeAt)}><Audio src={staticFile(sfx.typing)} volume={0.4} /></Sequence> : null}
      {sfx?.click ? <Sequence from={at(times.sendAt)}><Audio src={staticFile(sfx.click)} volume={0.6} /></Sequence> : null}
      {sfx?.pop ? <Sequence from={at(times.replyAt)}><Audio src={staticFile(sfx.pop)} volume={0.5} /></Sequence> : null}
      {sfx?.swipe && props.dm ? <Sequence from={at(times.dmAt)}><Audio src={staticFile(sfx.swipe)} volume={0.4} /></Sequence> : null}
      {sfx?.dm && props.dm ? <Sequence from={at(times.dmMessageAt)}><Audio src={staticFile(sfx.dm)} volume={0.5} /></Sequence> : null}
    </AbsoluteFill>
  );
};
