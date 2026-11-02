// CommentBox: an animated "comment the keyword, get the DM" call to action for Remotion videos.
//
// What it shows, in order (times in seconds from the moment the box appears):
//   1. an Instagram-style comment bar pops in ("Add a comment…")
//   2. the keyword types into the bar, letter by letter, with a blinking cursor   (typeAt, cps)
//   3. the send button lights up once the keyword is complete, then is pressed     (sendAt)
//   4. the comment posts above the bar ("you · now  KEYWORD  ♥")
//   5. the account's public reply lands under it, with the account's avatar        (replyAt)
//   6. with a `dm`, the comments swipe away sideways and a DM chat slides in        (dmAt)
//   7. the account is typing…, then the DM arrives                                  (dmMessageAt)
//
// Put it inside a <Sequence from={...}> so frame 0 of the sequence is the moment the box appears.
// Sizes are designed for a 1080-wide frame and scale with the composition width.
// Depends only on `remotion`. No fonts are loaded here: pass fontFamily (see README).
// Get keyword, reply, DM, handle and avatar from your CommentKeyword automation with commentkeyword.mjs.
// AI agents adding this box for a user: read "For AI agents" in README.md first (who sends the DM, where the props come from).

import React from "react";
import { Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type CommentBoxColors = {
  panel: string;     // bar, thread and chat background
  line: string;      // borders, send button when idle
  text: string;      // keyword, reply, DM
  soft: string;      // placeholders, names, timestamps
  accent: string;    // cursor, active send button, links in the DM
  heart: string;     // the ♥ on the posted comment
  ring: string;      // ring around the account avatar, viewer avatar (any CSS background)
  bubble: string;    // background of the incoming DM bubble
  shadow: string;    // box-shadow of the panels
};

export const DARK: CommentBoxColors = {
  panel: "#16161a", line: "rgba(255,255,255,0.16)", text: "#f5f5f5", soft: "#a8a8b3", accent: "#0095f6",
  heart: "#ff3040", ring: "linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)",
  bubble: "#2a2a31", shadow: "0 20px 60px rgba(0,0,0,0.5)",
};
export const LIGHT: CommentBoxColors = {
  ...DARK, panel: "#ffffff", line: "rgba(0,0,0,0.12)", text: "#0f0f12", soft: "#6b6b76", bubble: "#efeff4",
  shadow: "0 24px 60px rgba(15,15,18,0.22)",
};

export type CommentBoxLabels = {
  user: string;         // the viewer who comments
  now: string;          // timestamp of the posted comment and the DM
  placeholder: string;  // empty comment bar
  message: string;      // empty DM composer
  newMessage: string;   // subtitle of the DM chat header
};

export const LABELS: Record<"en" | "es" | "pt" | "fr" | "de" | "it", CommentBoxLabels> = {
  en: { user: "you", now: "now", placeholder: "Add a comment…", message: "Message…", newMessage: "New message" },
  es: { user: "tú", now: "ahora", placeholder: "Añade un comentario…", message: "Mensaje…", newMessage: "Nuevo mensaje" },
  pt: { user: "você", now: "agora", placeholder: "Adicione um comentário…", message: "Mensagem…", newMessage: "Nova mensagem" },
  fr: { user: "vous", now: "maintenant", placeholder: "Ajouter un commentaire…", message: "Message…", newMessage: "Nouveau message" },
  de: { user: "du", now: "jetzt", placeholder: "Kommentieren …", message: "Nachricht …", newMessage: "Neue Nachricht" },
  it: { user: "tu", now: "ora", placeholder: "Aggiungi un commento…", message: "Messaggio…", newMessage: "Nuovo messaggio" },
};

export type CommentBoxProps = {
  keyword: string;             // typed into the bar and shown as the posted comment
  replyHandle: string;         // account that replies and sends the DM, without @ (e.g. "youraccount")
  reply?: string;              // the automation's public reply; omit for no reply bubble
  dm?: string;                 // the DM text; with it, the box swipes to a DM chat after the reply
  replyAvatarSrc?: string;     // account picture: URL, data: URI or staticFile(); falls back to the initial
  replyInitial?: string;       // letter used when there is no picture (default: first letter of replyHandle)
  userAvatarSrc?: string;      // viewer picture (default: a gradient circle)
  labels?: keyof typeof LABELS | Partial<CommentBoxLabels>;
  kicker?: string;             // optional small line under the box, e.g. "Comment GUIDE for the free guide"
  typeAt?: number;             // s, typing starts (default 0.35)
  cps?: number;                // typing speed, characters per second (default 9; 12-15 feels snappier)
  sendAt?: number;             // s, send pressed + comment posts (default: end of typing + 0.35)
  replyAt?: number;            // s, reply lands (default: sendAt + 0.7)
  dmAt?: number;               // s, the swipe to the DM chat starts (default: replyAt + 1.1)
  dmMessageAt?: number;        // s, the DM appears after "typing…" (default: dmAt + 1.0)
  bottom?: number;             // px from the bottom of the frame (default 30 % of the height, above Reels' caption area)
  side?: number;               // px of margin left and right (default 60 at 1080 wide)
  colors?: Partial<CommentBoxColors> | "dark" | "light";
  fontFamily?: string;         // body font (default Inter, system-ui)
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_BACK = Easing.bezier(0.34, 1.56, 0.64, 1);
const EASE_SWIPE = Easing.bezier(0.65, 0, 0.35, 1);
const SWIPE_S = 0.5;

/** The times the box uses, so you can place sound effects on them (typing, click, pop, swipe, DM chime). */
export function commentBoxTimes(
  keyword: string,
  p: { typeAt?: number; cps?: number; sendAt?: number; replyAt?: number; dmAt?: number; dmMessageAt?: number } = {},
) {
  const cps = p.cps ?? 9, typeAt = p.typeAt ?? 0.35;
  const typingEnds = typeAt + keyword.length / cps;
  const sendAt = p.sendAt ?? typingEnds + 0.35;
  const replyAt = p.replyAt ?? sendAt + 0.7;
  const dmAt = p.dmAt ?? replyAt + 1.1;
  const dmMessageAt = p.dmMessageAt ?? dmAt + 1.0;
  return { typeAt, cps, typingEnds, sendAt, replyAt, dmAt, dmMessageAt };
}

// Links in the DM (https://…, www.…, example.com/…) get the accent colour, as in a chat app.
const LINK = /(https?:\/\/\S+|www\.\S+|\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\/\S*)/gi;

export const CommentBox: React.FC<CommentBoxProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const k = width / 1080;                                   // every size below is for a 1080-wide frame
  const px = (n: number) => Math.round(n * k);

  const c: CommentBoxColors = {
    ...(p.colors === "light" ? LIGHT : DARK),
    ...(typeof p.colors === "object" ? p.colors : {}),
  };
  const l: CommentBoxLabels = typeof p.labels === "string" ? LABELS[p.labels] : { ...LABELS.en, ...p.labels };
  const font = p.fontFamily ?? "Inter, system-ui, sans-serif";
  const kw = String(p.keyword ?? "");
  const handle = p.replyHandle.replace(/^@+/, "");
  const { typeAt, cps, sendAt, replyAt, dmAt, dmMessageAt } = commentBoxTimes(kw, p);

  const typed = kw.slice(0, Math.max(0, Math.min(kw.length, Math.floor((t - typeAt) * cps + 1e-6))));
  const sent = t >= sendAt;
  const cursorOn = !sent && Math.floor(t * 2.2) % 2 === 0;
  const ready = !sent && kw.length > 0 && typed.length === kw.length;   // send lights up once the keyword is typed
  const pop = interpolate(t, [0, 0.22], [0.6, 1], { ...clamp, easing: EASE_BACK });
  const press = interpolate(t, [sendAt - 0.08, sendAt, sendAt + 0.16], [1, 0.82, 1], clamp);
  const postIn = interpolate(t, [sendAt, sendAt + 0.25], [0, 1], { ...clamp, easing: EASE_OUT });
  const replyIn = interpolate(t, [replyAt, replyAt + 0.25], [0, 1], { ...clamp, easing: EASE_OUT });
  // 0 = comments on screen, 1 = DM chat on screen; the two pages move together, like swiping between apps
  const swipe = p.dm ? interpolate(t, [dmAt, dmAt + SWIPE_S], [0, 1], { ...clamp, easing: EASE_SWIPE }) : 0;
  const messageIn = interpolate(t, [dmMessageAt, dmMessageAt + 0.3], [0, 1], { ...clamp, easing: EASE_BACK });
  const typing = t >= dmAt + SWIPE_S * 0.6 && t < dmMessageAt;

  const text = (size: number, weight: number, color: string, extra: React.CSSProperties = {}) =>
    ({ fontFamily: font, fontSize: px(size), fontWeight: weight, color, lineHeight: 1.2, ...extra });

  // The account avatar: its picture inside an Instagram-style gradient ring, or its initial.
  const accountAvatar = (size: number) => (
    <div style={{ width: px(size), height: px(size), borderRadius: "50%", background: c.ring, padding: px(size * 0.06),
      flex: "0 0 auto" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: c.panel, padding: px(size * 0.04) }}>
        {p.replyAvatarSrc ? (
          <Img src={p.replyAvatarSrc} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: c.ring, display: "flex",
            alignItems: "center", justifyContent: "center", ...text(size * 0.42, 800, "#ffffff") }}>
            {p.replyInitial ?? handle.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
  const viewerAvatar = (size: number) => p.userAvatarSrc
    ? <Img src={p.userAvatarSrc} style={{ width: px(size), height: px(size), borderRadius: "50%", objectFit: "cover",
        flex: "0 0 auto" }} />
    : <div style={{ width: px(size), height: px(size), borderRadius: "50%", background: c.ring, flex: "0 0 auto" }} />;
  const panel: React.CSSProperties = { background: c.panel, border: `${px(3)}px solid ${c.line}`, boxShadow: c.shadow };
  const sendButton = (active: boolean, scale = 1) => (
    <div style={{ width: px(92), height: px(92), borderRadius: "50%", flex: "0 0 auto", display: "flex",
      alignItems: "center", justifyContent: "center", transform: `scale(${scale})`, background: active ? c.accent : c.line }}>
      <svg width={px(46)} height={px(46)} viewBox="0 0 24 24">
        <path d="M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5Z" fill={active ? "#ffffff" : c.soft} />
      </svg>
    </div>
  );
  const dmText = String(p.dm ?? "").split(LINK).map((part, i) =>
    i % 2 === 1 ? <span key={i} style={{ color: c.accent, textDecoration: "underline" }}>{part}</span> : part);

  return (
    <div style={{ position: "absolute", left: p.side ?? px(60), right: p.side ?? px(60),
      bottom: p.bottom ?? Math.round(height * 0.3), transform: `scale(${pop})`, transformOrigin: "50% 100%" }}>

      <div style={{ position: "relative" }}>
      {/* page 1: the comments. The bar stays put and the thread grows upward above it, as on Instagram. */}
      <div style={{ display: "flex", flexDirection: "column", gap: px(22), transform: `translateX(${-swipe * width}px)`,
        visibility: swipe >= 1 ? "hidden" : "visible" }}>
        {sent ? (
          <div style={{ ...panel, display: "flex", flexDirection: "column", gap: px(18), borderRadius: px(40),
            padding: `${px(22)}px ${px(8)}px`, opacity: postIn, transform: `translateY(${(1 - postIn) * px(24)}px)` }}>
            <div style={{ display: "flex", gap: px(20), alignItems: "center", padding: `0 ${px(18)}px` }}>
              {viewerAvatar(76)}
              <div style={{ flex: 1 }}>
                <div style={text(34, 800, c.soft)}>{l.user} · {l.now}</div>
                <div style={text(64, 800, c.text, { letterSpacing: px(1) })}>{kw}</div>
              </div>
              <div style={{ fontSize: px(46), color: c.heart }}>♥</div>
            </div>
            {p.reply && t >= replyAt ? (
              <div style={{ opacity: replyIn, transform: `translateY(${(1 - replyIn) * px(20)}px)`, display: "flex",
                gap: px(16), alignItems: "center", padding: `0 ${px(18)}px 0 ${px(110)}px` }}>
                {accountAvatar(64)}
                <div style={{ minWidth: 0 }}>
                  <div style={text(30, 800, c.soft)}>{handle}</div>
                  <div style={text(42, 700, c.text)}>{p.reply}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ ...panel, display: "flex", alignItems: "center", gap: px(22), borderRadius: 999,
          padding: `${px(16)}px ${px(18)}px` }}>
          {viewerAvatar(84)}
          <div style={{ flex: 1, ...text(60, 800, c.text), whiteSpace: "nowrap", overflow: "hidden" }}>
            {!sent && typed ? <span>{typed}</span>
              : <span style={text(46, 700, c.soft)}>{l.placeholder}</span>}
            {cursorOn ? <span style={{ display: "inline-block", width: px(5), height: px(62), marginLeft: px(4),
              background: c.accent, verticalAlign: "middle" }} /> : null}
          </div>
          {sendButton(ready, press)}
        </div>
      </div>

      {/* page 2: the DM chat, sliding in from the right as the comments slide out to the left */}
      {p.dm && swipe > 0 ? (
        <div style={{ ...panel, position: "absolute", left: 0, right: 0, bottom: 0, borderRadius: px(40),
          display: "flex", flexDirection: "column", transform: `translateX(${(1 - swipe) * width}px)` }}>
          <div style={{ display: "flex", gap: px(20), alignItems: "center", padding: `${px(24)}px ${px(28)}px` }}>
            {accountAvatar(92)}
            <div style={{ minWidth: 0 }}>
              <div style={text(40, 800, c.text)}>{handle}</div>
              <div style={text(30, 700, c.soft)}>{l.newMessage} · {l.now}</div>
            </div>
          </div>
          <div style={{ height: px(3), background: c.line }} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: px(14), padding: `${px(30)}px ${px(28)}px`,
            minHeight: px(170) }}>
            {accountAvatar(56)}
            {typing ? (
              <div style={{ background: c.bubble, borderRadius: `${px(36)}px ${px(36)}px ${px(36)}px ${px(10)}px`,
                padding: `${px(26)}px ${px(30)}px`, display: "flex", gap: px(10) }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: px(16), height: px(16), borderRadius: "50%", background: c.soft,
                    opacity: 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.9)) }} />
                ))}
              </div>
            ) : t >= dmMessageAt ? (
              <div style={{ background: c.bubble, borderRadius: `${px(36)}px ${px(36)}px ${px(36)}px ${px(10)}px`,
                padding: `${px(22)}px ${px(28)}px`, maxWidth: "82%", opacity: Math.min(1, messageIn),
                transform: `scale(${0.9 + 0.1 * messageIn})`, transformOrigin: "0% 100%", ...text(42, 600, c.text) }}>
                {dmText}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: px(18), margin: `0 ${px(18)}px ${px(18)}px`,
            border: `${px(3)}px solid ${c.line}`, borderRadius: 999, padding: `${px(10)}px ${px(10)}px ${px(10)}px ${px(30)}px` }}>
            <div style={{ flex: 1, ...text(40, 700, c.soft) }}>{l.message}</div>
            {sendButton(false, 0.8)}
          </div>
        </div>
      ) : null}
      </div>

      {p.kicker ? <div style={text(40, 700, c.text, { textAlign: "center", marginTop: px(22),
        textShadow: "0 2px 12px rgba(0,0,0,0.45)" })}>{p.kicker}</div> : null}
    </div>
  );
};
