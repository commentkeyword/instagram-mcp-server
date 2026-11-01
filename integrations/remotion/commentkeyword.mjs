#!/usr/bin/env node
// Reads a keyword's automation (public reply, DM) and the connected Instagram account (handle, picture) from the
// CommentKeyword API, so the CommentBox shows exactly what the viewer will get when they comment.
// Read only: it never creates or changes an automation. Node 18+, no dependencies.
//
// Run it at build time, not inside the Remotion component, and pass the result in as props:
//
//   COMMENTKEYWORD_API_TOKEN=... node commentkeyword.mjs GUIDE --name Maria > props.json
//   npx remotion render CommentBoxDemo out/cta.mp4 --props=props.json
//
// or from code:
//
//   import { commentBoxProps } from "./commentkeyword.mjs";
//   const { props, warnings } = await commentBoxProps("GUIDE", { token: process.env.COMMENTKEYWORD_API_TOKEN });

import { pathToFileURL } from "node:url";

const DEFAULT_API_URL = "https://commentkeyword.com/api";

/** Case- and accent-insensitive key: "Guía" == "GUIA". */
export const fold = (s) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");

/**
 * A message as the video shows it. CommentKeyword fills {{namefirst}}, {{name}} and {{handle}} per commenter;
 * the video can't know the viewer, so they become `name` (and `@handle`) when given, or are dropped.
 */
export function cleanText(message, { name, handle } = {}) {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  return String(message ?? "")
    .replace(/\{\{\s*(namefirst|name|handle)\s*\}\}/gi, (_, key) => {
      const k = key.toLowerCase();
      if (k === "handle") return handle ? `@${String(handle).replace(/^@+/, "")}` : (name ? first : "");
      return k === "namefirst" ? (first || "") : (String(name ?? "").trim());
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([!?,.;:])/g, "$1")
    .replace(/,+(?=[!?.;:])/g, "")            // "Sent, {{namefirst}}!" without a name -> "Sent!"
    .replace(/([¡¿])\s+/g, "$1")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

async function api(path, { token, apiUrl }) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const error = new Error(`CommentKeyword API ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/** Every keyword automation in the token's workspace (follows the API's pagination). */
export async function listKeywords({ token, apiUrl = process.env.COMMENTKEYWORD_API_URL || DEFAULT_API_URL }) {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api(`/keywords?limit=100&offset=${offset}`, { token, apiUrl });
    rows.push(...(page.data ?? []));
    if (!page.pagination?.hasMore) return rows;
  }
}

/** The connected Instagram account ({ connected, username, profilePictureUrl }), or null if the API is older. */
export async function getAccount({ token, apiUrl = process.env.COMMENTKEYWORD_API_URL || DEFAULT_API_URL }) {
  try {
    return (await api("/account", { token, apiUrl })).data?.instagram ?? null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** Downloads an image into a data: URI. Instagram picture URLs expire, so the props carry the image itself. */
export async function imageDataUri(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the profile picture (${res.status})`);
  const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!type.startsWith("image/")) throw new Error(`The profile picture URL returned ${type}, not an image`);
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

/** The automation the video should promise: an active one first, then the newest. */
export function pickAutomation(automations, keyword) {
  const matches = automations.filter((a) => fold(a.keyword) === fold(keyword));
  return matches.find((a) => a.isActive) ?? matches[0] ?? null;
}

/**
 * Props for <CommentBox>: keyword, reply, dm, replyHandle and replyAvatarSrc, read from CommentKeyword.
 * `warnings` lists anything that would make the video promise something the account won't do.
 */
export async function commentBoxProps(keyword, { token, apiUrl, name, handle, dm = true, avatar = true } = {}) {
  if (!token) throw new Error("Set COMMENTKEYWORD_API_TOKEN (Settings → API, with keywords:read).");
  const opts = { token, ...(apiUrl ? { apiUrl } : {}) };
  const [automations, account] = await Promise.all([listKeywords(opts), getAccount(opts)]);
  const warnings = [];

  const automation = pickAutomation(automations, keyword);
  if (!automation) {
    throw new Error(`No automation for "${keyword}". Create it first (for example with the MCP server's create_keyword), `
      + "so the video never promises a DM the account doesn't send.");
  }
  if (!automation.isActive) warnings.push(`"${automation.keyword}" is paused: switch it on before the video goes out.`);
  if (automation.nextPostStatus === "reconnect_required") warnings.push("Instagram needs reconnecting in CommentKeyword.");

  const reply = automation.publicReplyEnabled === false ? undefined
    : (automation.commentReplies ?? []).map((r) => cleanText(r, { name, handle })).find(Boolean);
  if (!reply) warnings.push(`"${automation.keyword}" has no public reply, so the box shows none.`);
  const dmText = dm ? (automation.dmMessages ?? []).map((m) => cleanText(m, { name, handle })).find(Boolean) : undefined;

  const props = { keyword: String(keyword).trim().toUpperCase() };
  if (reply) props.reply = reply;
  if (dmText) props.dm = dmText;

  if (account?.connected && account.username) {
    props.replyHandle = account.username;
    if (avatar && account.profilePictureUrl) {
      try {
        props.replyAvatarSrc = await imageDataUri(account.profilePictureUrl);
      } catch (error) {
        warnings.push(`${error.message}; the box shows the initial instead.`);
      }
    }
  } else {
    props.replyHandle = "youraccount";
    warnings.push(account === null
      ? "This CommentKeyword API has no /account endpoint yet: set replyHandle (and replyAvatarSrc) by hand."
      : "No Instagram account is connected to this workspace.");
  }
  return { props, warnings, automation: { id: automation.id, keyword: automation.keyword, isActive: automation.isActive } };
}

// CLI: node commentkeyword.mjs KEYWORD [--name Maria] [--handle maria.fit] [--no-dm] [--no-avatar]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const name = flag("--name");
  const handle = flag("--handle");
  const dm = !args.includes("--no-dm");
  const avatar = !args.includes("--no-avatar");
  const keyword = args.find((a) => !a.startsWith("--"));
  if (!keyword) {
    console.error("Usage: node commentkeyword.mjs KEYWORD [--name Maria] [--handle maria.fit] [--no-dm] [--no-avatar] > props.json");
    process.exit(2);
  }
  try {
    const { props, warnings } = await commentBoxProps(keyword, {
      token: process.env.COMMENTKEYWORD_API_TOKEN, name, handle, dm, avatar,
    });
    for (const w of warnings) console.error(`warning: ${w}`);
    process.stdout.write(`${JSON.stringify(props, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
