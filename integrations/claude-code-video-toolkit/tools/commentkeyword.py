#!/usr/bin/env python3
"""
Set up the Instagram DM behind a video's "Comment GUIDE and I'll send it" CTA,
through the CommentKeyword API (https://commentkeyword.com/api-docs).

A keyword automation sends a DM (and optionally a public reply) to everyone who
comments the keyword. With --target next_post (the default) it attaches itself
to the next post or reel the account publishes, so you can set it up while the
video is still being edited and publish afterwards.

  1. Create a CommentKeyword account and connect an Instagram professional
     (Business or Creator) account.
  2. Create a token under Settings -> API with keywords:read and keywords:write.
  3. Put it in .env as COMMENTKEYWORD_API_TOKEN.

See docs/commentkeyword.md for the full walkthrough.

Examples:
  # Validate the token, show existing automations with the same word and the
  # request that would be sent. Creates nothing.
  uv run tools/commentkeyword.py --keyword GUIDE \\
      --dm "Here's the guide, {{namefirst}}: https://example.com/guide" \\
      --reply "Sent! Check your DMs" --dry-run --json-out

  # Create it for the next post or reel
  uv run tools/commentkeyword.py --keyword GUIDE \\
      --dm "Here's the guide, {{namefirst}}: https://example.com/guide" \\
      --reply "Sent! Check your DMs" --track-links --json-out

  # Reuse an existing automation for a new video, check on it, pause it
  uv run tools/commentkeyword.py --rearm <publicId> --json-out
  uv run tools/commentkeyword.py --status <publicId> --json-out
  uv run tools/commentkeyword.py --pause <publicId> --json-out

  # List automations (optionally filtered by keyword text)
  uv run tools/commentkeyword.py --list --search guide --json-out

# ---------------------------------------------------------------------------
# SAFETY
#   * Creating or re-arming an automation makes CommentKeyword message real
#     people. The /comment-dm command confirms the keyword, DM and target with
#     the user before running this without --dry-run.
#   * Create requests are never retried. If one fails without a clear answer
#     (network error, 5xx), the tool says so and points at --list --search so
#     you can check before trying again.
#   * The token is read from the environment and never printed.
#   * There is no delete here on purpose; delete in the dashboard, or pause.
# ---------------------------------------------------------------------------
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional

try:
    import requests
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: uv sync  (or pip install requests python-dotenv)")
    sys.exit(1)

load_dotenv()

# On Windows a piped stderr is cp1252, which can't encode emoji in DM text. Replace what the
# console can't show instead of crashing; --json-out output is ASCII-escaped (see emit_json).
try:
    sys.stderr.reconfigure(errors="replace")
except (AttributeError, ValueError):
    pass

DEFAULT_API_URL = "https://commentkeyword.com/api"
TOKEN_PLACEHOLDERS = {"", "your_token_here"}
API_TIMEOUT = (15, 60)

TARGETS = ("next_post", "all_posts", "specific_posts")
KEYWORD_MAX = 100
DM_MAX = 1000
REPLY_MAX = 500
# The API counts each placeholder at its longest rendered size.
PLACEHOLDER_MAX = {"{{handle}}": 31, "{{name}}": 64, "{{namefirst}}": 64}


class ApiError(Exception):
    """A CommentKeyword API call failed."""

    def __init__(self, message: str, error_type: str = "http", status: Optional[int] = None,
                 code: Optional[str] = None):
        super().__init__(message)
        self.error_type = error_type
        self.status = status
        self.code = code


def log(msg: str, level: str = "info"):
    """Print a formatted log message to stderr (stdout is reserved for --json-out)."""
    colors = {"info": "\033[94m", "success": "\033[92m", "error": "\033[91m",
              "warn": "\033[93m", "dim": "\033[90m"}
    prefix = {"info": "->", "success": "OK", "error": "!!", "warn": "??", "dim": "  "}
    print(f"{colors.get(level, '')}{prefix.get(level, '->')} {msg}\033[0m", file=sys.stderr)


def get_token() -> Optional[str]:
    token = (os.getenv("COMMENTKEYWORD_API_TOKEN") or "").strip()
    return None if token in TOKEN_PLACEHOLDERS else token


def api_url() -> str:
    return (os.getenv("COMMENTKEYWORD_API_URL") or DEFAULT_API_URL).rstrip("/")


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def classify(status: int, code: Optional[str]) -> str:
    """Map an HTTP status to errorType (auth | forbidden | validation | not_found | limit | conflict | http)."""
    if status == 401:
        return "auth"
    if status == 403:
        return "forbidden"
    if status in (400, 422):
        return "validation"
    if status == 404:
        return "not_found"
    if status == 409:
        return "limit" if code == "keyword_limit_exceeded" else "conflict"
    return "http"


def request(method: str, path: str, token: str, *, params: Optional[dict] = None,
            body: Optional[dict] = None) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    try:
        resp = requests.request(method, f"{api_url()}{path}", headers=headers, params=params,
                                json=body, timeout=API_TIMEOUT)
    except requests.RequestException as e:
        raise ApiError(f"Network error: {e.__class__.__name__}", "network")
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if resp.ok:
        if not isinstance(payload, dict):
            raise ApiError(f"Unexpected non-JSON response (HTTP {resp.status_code})", "http", resp.status_code)
        return payload
    code = payload.get("code") if isinstance(payload, dict) else None
    message = (payload.get("message") or payload.get("error")) if isinstance(payload, dict) else None
    raise ApiError(f"HTTP {resp.status_code}: {message or resp.reason}",
                   classify(resp.status_code, code), resp.status_code, code)


# ---------------------------------------------------------------------------
# Request building and validation
# ---------------------------------------------------------------------------
def rendered_max_len(text: str) -> int:
    n = len(text)
    for ph, size in PLACEHOLDER_MAX.items():
        n += text.count(ph) * (size - len(ph))
    return n


def target_fields(target: str, media_ids: list[str]) -> dict:
    if target == "all_posts":
        return {"scope": "global"}
    if target == "specific_posts":
        return {"scope": "post_specific", "mediaIds": media_ids}
    fields = {"scope": "post_specific", "includeNextPost": True}
    if media_ids:
        fields["mediaIds"] = media_ids
    return fields


def read_lines(path: str) -> list[str]:
    with open(path, encoding="utf-8") as f:  # text mode already turns CRLF into LF
        text = f.read()
    # Variants are separated by a line with only "---"; a file without one is one variant.
    return [v.strip() for v in ("\n" + text + "\n").split("\n---\n")]


def build_create_body(args) -> tuple[Optional[dict], Optional[str]]:
    keyword = " ".join((args.keyword or "").split())
    if not keyword:
        return None, "--keyword is required"
    if len(keyword) > KEYWORD_MAX:
        return None, f"--keyword is longer than {KEYWORD_MAX} characters"
    dms = list(args.dm or [])
    if args.dm_file:
        try:
            dms += read_lines(args.dm_file)
        except OSError as e:
            return None, f"--dm-file: {e}"
    dms = [d.strip() for d in dms if d and d.strip()]
    if not dms:
        return None, "at least one --dm (or --dm-file) is required"
    for d in dms:
        if rendered_max_len(d) > DM_MAX:
            return None, f"a DM variant can render to more than {DM_MAX} characters: {d[:40]}..."
    replies = [r.strip() for r in (args.reply or []) if r and r.strip()]
    for r in replies:
        if rendered_max_len(r) > REPLY_MAX:
            return None, f"a public reply can render to more than {REPLY_MAX} characters: {r[:40]}..."
    if args.target == "specific_posts" and not args.media_id:
        return None, "--target specific_posts needs at least one --media-id"

    body: dict = {"keyword": keyword, "dmMessages": dms, **target_fields(args.target, args.media_id or [])}
    if replies:
        body["commentReplies"] = replies
    if args.exact:
        body["matchMode"] = "exact"
    if args.without_accents:
        body["matchWithoutAccents"] = True
    if args.track_links:
        body["trackLinks"] = True
    if args.paused:
        body["isActive"] = False
    return body, None


def summarize(k: dict) -> dict:
    scope = k.get("scope")
    if scope == "global":
        target = "all_posts"
    elif k.get("includeNextPost"):
        target = "next_post"
    else:
        target = "specific_posts"
    return {
        "publicId": k.get("publicId"),
        "keyword": k.get("keyword"),
        "isActive": k.get("isActive"),
        "target": target,
        "matchMode": k.get("matchMode"),
        "nextPostStatus": k.get("nextPostStatus"),
        "nextPostMediaId": k.get("nextPostMediaId"),
        "nextPostLastError": k.get("nextPostLastError"),
        "mediaIds": k.get("mediaIds") or [],
        "dmMessages": k.get("dmMessages") or [],
        "commentReplies": k.get("commentReplies") or [],
        "publicReplyEnabled": k.get("publicReplyEnabled"),
        "trackLinks": k.get("trackLinks"),
    }


def same_word(token: str, keyword: str) -> list[dict]:
    """Existing automations whose keyword text equals this one (case-insensitive)."""
    found = request("GET", "/keywords", token, params={"search": keyword, "limit": 100})
    want = keyword.casefold()
    return [summarize(k) for k in found.get("data", []) if (k.get("keyword") or "").casefold() == want]


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def emit_json(payload: dict):
    print(json.dumps(payload, ensure_ascii=True))


def fail(msg: str, error_type: str, json_out: bool, **extra):
    log(msg, "error")
    if json_out:
        emit_json({"success": False, "error": msg, "errorType": error_type, **extra})
    sys.exit(1)


def fail_api(e: ApiError, json_out: bool, hint: Optional[str] = None):
    hints = {
        "auth": "The token is wrong or revoked. Create a new one at https://commentkeyword.com/settings?tab=api",
        "forbidden": "The token lacks a permission. It needs keywords:read and keywords:write.",
        "limit": "No active-keyword slot is free on the plan. Pause an old keyword, or re-run with --paused.",
        "conflict": "This keyword is already active on the same posts. Re-arm the existing one (--rearm) or pick another word.",
        "not_found": "No automation with that publicId in this workspace.",
    }
    fail(f"{e}. {hint or hints.get(e.error_type, '')}".strip(), e.error_type, json_out,
         status=e.status, code=e.code)


def print_keyword(k: dict):
    log(f"{k['keyword']}  ({k['publicId']})", "success")
    log(f"active: {k['isActive']}  target: {k['target']}  match: {k['matchMode']}", "dim")
    if k["target"] == "next_post" or k["nextPostStatus"]:
        log(f"next post: {k['nextPostStatus']}"
            + (f" (media {k['nextPostMediaId']})" if k["nextPostMediaId"] else "")
            + (f" - last error: {k['nextPostLastError']}" if k["nextPostLastError"] else ""), "dim")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_create(args, token: str):
    body, err = build_create_body(args)
    if err:
        fail(err, "validation", args.json_out)
    try:
        existing = same_word(token, body["keyword"])
    except ApiError as e:
        fail_api(e, args.json_out)

    if args.dry_run:
        log("Token OK. Nothing was created (dry run).", "success")
        for k in existing:
            log(f"existing: {k['keyword']} ({k['publicId']}) active={k['isActive']} target={k['target']}", "warn")
        log(json.dumps(body, ensure_ascii=False, indent=2), "dim")
        if args.json_out:
            emit_json({"success": True, "dryRun": True, "authOk": True, "existing": existing, "requestBody": body})
        return

    try:
        created = request("POST", "/keywords", token, body=body)
    except ApiError as e:
        if e.error_type in ("network", "http"):
            fail_api(e, args.json_out,
                     hint=f"It is unclear whether the automation was created. Check with "
                          f"`--list --search {body['keyword']}` before running this again.")
        fail_api(e, args.json_out)
    k = summarize(created.get("data", {}))
    print_keyword(k)
    if args.json_out:
        emit_json({"success": True, **k})


def cmd_rearm(args, token: str):
    # Re-arming a paused automation also resumes it, unless --paused is given.
    body = {"scope": "post_specific", "includeNextPost": True, "isActive": not args.paused}
    if args.dry_run:
        try:
            k = summarize(request("GET", f"/keywords/{args.rearm}", token).get("data", {}))
        except ApiError as e:
            fail_api(e, args.json_out)
        log("Token OK. Nothing was changed (dry run).", "success")
        print_keyword(k)
        if args.json_out:
            emit_json({"success": True, "dryRun": True, "authOk": True, "current": k, "requestBody": body})
        return
    try:
        k = summarize(request("PATCH", f"/keywords/{args.rearm}", token, body=body).get("data", {}))
    except ApiError as e:
        fail_api(e, args.json_out)
    print_keyword(k)
    if not k["isActive"] and not args.paused:
        log("The automation is still paused, so it won't send DMs. Resume it in the dashboard.", "warn")
    if args.json_out:
        emit_json({"success": True, **k})


def cmd_pause(args, token: str):
    try:
        k = summarize(request("PATCH", f"/keywords/{args.pause}", token, body={"isActive": False}).get("data", {}))
    except ApiError as e:
        fail_api(e, args.json_out)
    print_keyword(k)
    if args.json_out:
        emit_json({"success": True, **k})


def cmd_status(args, token: str):
    try:
        k = summarize(request("GET", f"/keywords/{args.status}", token).get("data", {}))
    except ApiError as e:
        fail_api(e, args.json_out)
    print_keyword(k)
    if args.json_out:
        emit_json({"success": True, **k})


def cmd_list(args, token: str):
    params = {"limit": 100}
    if args.search:
        params["search"] = args.search
    try:
        found = request("GET", "/keywords", token, params=params)
    except ApiError as e:
        fail_api(e, args.json_out)
    items = [summarize(k) for k in found.get("data", [])]
    for k in items:
        log(f"{k['keyword']}  ({k['publicId']})  active={k['isActive']}  target={k['target']}"
            + (f"  next post: {k['nextPostStatus']}" if k["nextPostStatus"] else ""), "dim")
    if not items:
        log("No automations found.", "dim")
    if args.json_out:
        emit_json({"success": True, "keywords": items,
                   "total": (found.get("pagination") or {}).get("total", len(items))})


def main():
    parser = argparse.ArgumentParser(
        description="Set up the Instagram comment-to-DM automation behind a video's CTA (CommentKeyword API).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""examples:
  %(prog)s --keyword GUIDE --dm "Here's the guide: https://..." --dry-run --json-out
  %(prog)s --keyword GUIDE --dm "Here's the guide: https://..." --reply "Sent!" --json-out
  %(prog)s --rearm PUBLIC_ID --json-out
  %(prog)s --status PUBLIC_ID --json-out
  %(prog)s --list --search guide --json-out
""",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--keyword", help="Create an automation for this keyword (one word works best)")
    mode.add_argument("--rearm", metavar="PUBLIC_ID", help="Make an existing automation wait for the next post again (resumes it if paused)")
    mode.add_argument("--status", metavar="PUBLIC_ID", help="Show an automation, including whether the next post was caught")
    mode.add_argument("--pause", metavar="PUBLIC_ID", help="Pause an automation")
    mode.add_argument("--list", action="store_true", help="List automations")

    parser.add_argument("--dm", action="append", help="DM text; repeat for variants (one is picked per person). "
                        "Placeholders: {{handle}} {{name}} {{namefirst}}")
    parser.add_argument("--dm-file", help="DM variants from a file, separated by a line containing only ---")
    parser.add_argument("--reply", action="append", help="Public reply under the comment; repeat for variants")
    parser.add_argument("--target", choices=TARGETS, default="next_post",
                        help="next_post (default): the next post or reel published; all_posts; specific_posts")
    parser.add_argument("--media-id", action="append", help="Instagram media ID (for specific_posts); repeatable")
    parser.add_argument("--exact", action="store_true", help="Match only when the whole comment is the keyword")
    parser.add_argument("--without-accents", action="store_true", help="Also match the keyword without accents (e.g. guia for GUÍA)")
    parser.add_argument("--track-links", action="store_true", help="Count clicks on links in the DM")
    parser.add_argument("--paused", action="store_true", help="Create or re-arm it paused (does not use an active-keyword slot)")
    parser.add_argument("--search", help="With --list: filter by keyword text")
    parser.add_argument("--dry-run", action="store_true", help="Check the token and show the request; change nothing")
    parser.add_argument("--json-out", action="store_true", help="Emit a single machine-readable JSON line to stdout")
    args = parser.parse_args()

    if not (args.keyword or args.rearm or args.status or args.pause or args.list):
        parser.print_help(sys.stderr)
        sys.exit(2)

    token = get_token()
    if not token:
        fail("COMMENTKEYWORD_API_TOKEN is not set. See docs/commentkeyword.md.", "config", args.json_out)

    if args.keyword:
        cmd_create(args, token)
    elif args.rearm:
        cmd_rearm(args, token)
    elif args.pause:
        if args.dry_run:
            fail("--pause has no dry run; use --status to check first", "validation", args.json_out)
        cmd_pause(args, token)
    elif args.status:
        cmd_status(args, token)
    else:
        cmd_list(args, token)


if __name__ == "__main__":
    main()
