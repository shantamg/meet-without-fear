"""GitHub notification checker for the EC2 bot harness."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import BotConfig
from .github_state import GitHubState
from .json_store import read_json, write_json
from .logging import append


BOT_USER_LOGINS = {"slam-paws", "slam-paws-app[bot]"}
BOT_MENTION_TOKENS = {"@slam-paws", "@slam_paws"}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_ago(seconds: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def md5_short(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()[:8]


def gh(args: list[str], jq: str | None = None) -> tuple[int, str]:
    cmd = ["gh", *args]
    if jq:
        cmd += ["--jq", jq]
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False, env=os.environ.copy())
    return proc.returncode, proc.stdout.strip()


def gh_json(args: list[str], default: Any = None) -> Any:
    code, out = gh(args)
    if code != 0 or not out:
        return default
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return default


def iter_json_lines(text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return items


def atomic_claim(path: Path) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(str(os.getpid()))
    return True


def cleanup_claims(config: BotConfig) -> None:
    cutoff = time.time() - 86400
    config.claims_dir.mkdir(parents=True, exist_ok=True)
    for path in config.claims_dir.glob("claimed-gh-*.txt"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            pass


def notification_items(config: BotConfig, log_file: Path) -> list[dict[str, Any]] | None:
    last_file = config.bot_state_dir / "github-last-checked.txt"
    last_checked = last_file.read_text(encoding="utf-8", errors="replace").strip() if last_file.exists() else ""
    url = "/notifications?participating=true"
    if last_checked:
        url += f"&since={last_checked}"
    code, out = gh(["api", url], ".[]")
    if code != 0:
        append(log_file, f"[{time.ctime()}] GitHub API error\n")
        return None
    notifications = iter_json_lines(out)

    catchup_file = config.bot_state_dir / "github-last-catchup.txt"
    last_catchup = int(catchup_file.read_text(encoding="utf-8", errors="replace").strip() or "0") if catchup_file.exists() else 0
    now = int(time.time())
    if now - last_catchup >= 900:
        code, catchup = gh(["api", f"/notifications?all=true&participating=true&since={iso_ago(7200)}"], ".[]")
        if code == 0:
            notifications.extend(iter_json_lines(catchup))
        catchup_file.write_text(str(now), encoding="utf-8")
    return notifications


def add_reaction(url: str) -> str:
    if not url:
        return ""
    code, out = gh(["api", f"{url}/reactions", "-f", "content=eyes"])
    if code != 0 or not out:
        return ""
    try:
        return str(json.loads(out).get("id", ""))
    except json.JSONDecodeError:
        return ""


def remove_reaction(url: str, rid: str) -> None:
    if url and rid:
        gh(["api", "-X", "DELETE", f"{url}/reactions/{rid}"])


def mark_read(notification_id: str) -> None:
    gh(["api", "-X", "PATCH", f"/notifications/threads/{notification_id}"])


def run_agent(config: BotConfig, slug: str, prompt: str, extra_env: dict[str, str] | None = None) -> int:
    env = os.environ.copy()
    env.update(extra_env or {})
    env["PRIORITY"] = "high"
    script = config.bot_scripts_dir / "run-claude.sh"
    if os.environ.get("BOT_HARNESS_SYNC") == "1":
        return subprocess.run([str(script), slug, prompt], env=env, check=False).returncode
    subprocess.Popen([str(script), slug, prompt], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return 0


def state_pr(config: BotConfig, number: str) -> dict[str, Any] | None:
    state = GitHubState(config.bot_state_dir / "github-state.json", max_age_seconds=120)
    if not state.is_fresh():
        return None
    prs = state.data.get("prs", {}) if isinstance(state.data, dict) else {}
    pr = prs.get(str(number))
    return pr if isinstance(pr, dict) else None


def pr_open(config: BotConfig, repo: str, number: str) -> bool:
    pr = state_pr(config, number)
    if pr is not None:
        return True
    data = gh_json(["pr", "view", number, "--repo", repo, "--json", "state"], {})
    return data.get("state") == "OPEN"


def already_reviewed_head(config: BotConfig, repo: str, number: str) -> bool:
    pr = state_pr(config, number)
    head = str((pr or {}).get("head_sha", ""))
    last = str((pr or {}).get("last_bot_review_sha", ""))
    if not pr:
        data = gh_json(["pr", "view", number, "--repo", repo, "--json", "headRefOid,reviews"], {})
        head = str(data.get("headRefOid", ""))
        reviews = data.get("reviews", []) if isinstance(data, dict) else []
        for review in reviews:
            author = ((review.get("author") or {}).get("login") or review.get("author_login") or "")
            if author in BOT_USER_LOGINS:
                last = str(((review.get("commit") or {}).get("oid")) or review.get("commit_oid") or "")
    return bool(head and last and head == last)


def session_context(config: BotConfig, repo: str, number: str) -> Path:
    path = Path("/tmp/slam-paws") / f"review-pr-{number}-session-context.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    pr = state_pr(config, number)
    if pr:
        write_json(path, {"source": "github-state-scanner", "generated_at": utc_now(), "pr": pr})
        return path
    data = gh_json(["pr", "view", number, "--repo", repo, "--json", "number,title,state,headRefName,baseRefName,author,labels,reviewDecision,isDraft"], {})
    labels = data.get("labels", []) if isinstance(data, dict) else []
    write_json(
        path,
        {
            "source": "gh-fallback",
            "generated_at": utc_now(),
            "pr": {
                "number": data.get("number"),
                "title": data.get("title", ""),
                "baseRefName": data.get("baseRefName", ""),
                "headRefName": data.get("headRefName", ""),
                "author_login": (data.get("author") or {}).get("login", ""),
                "isDraft": data.get("isDraft"),
                "reviewDecision": data.get("reviewDecision"),
                "labels": [item.get("name", "") for item in labels if isinstance(item, dict)],
            },
        },
    )
    return path


def latest_comment_replied(repo: str, number: str, created_at: str) -> bool:
    if not created_at:
        return False
    comments = gh_json(["api", f"repos/{repo}/issues/{number}/comments?per_page=10&direction=desc"], [])
    if not isinstance(comments, list):
        return False
    return any(((item.get("user") or {}).get("login") in BOT_USER_LOGINS) and str(item.get("created_at", "")) > created_at for item in comments)


def handle_review(config: BotConfig, log_file: Path, notification: dict[str, Any], number: str, repo: str, comment_url: str, reaction_id: str, claim: Path) -> None:
    if not pr_open(config, repo, number):
        append(log_file, f"[{time.ctime()}] Skipping review_requested for non-open PR #{number}\n")
        mark_read(str(notification.get("id", "")))
        claim.unlink(missing_ok=True)
        return
    if already_reviewed_head(config, repo, number):
        append(log_file, f"[{time.ctime()}] Skipping review_requested for PR #{number}: bot already reviewed HEAD\n")
        claim.unlink(missing_ok=True)
        return
    context = session_context(config, repo, number)
    prompt = f"""Use the /review-pr skill: /review-pr {number} {repo}

[SESSION_CONTEXT]
PR metadata has been pre-loaded into {context} from the github-state scanner or gh fallback.
Read that file for PR title, author, base/head branch, labels, checks, and review status.
Do NOT call `gh pr view --json` - all metadata you need is in the session context file.
The only `gh` read call allowed is `gh pr diff` (for the actual diff text).
[END SESSION_CONTEXT]"""
    try:
        run_agent(config, f"review-pr-{number}", prompt, {"SESSION_CONTEXT": str(context)})
    finally:
        remove_reaction(comment_url, reaction_id)
        if os.environ.get("BOT_HARNESS_SYNC") != "1":
            context.unlink(missing_ok=True)


def handle_comment(config: BotConfig, log_file: Path, notification: dict[str, Any], number: str, repo: str, label: str, comment_url: str, reaction_id: str, claim: Path) -> None:
    reason = str(notification.get("reason", ""))
    subject = notification.get("subject", {}) or {}
    comment = gh_json(["api", comment_url], {}) if comment_url else {}
    comment_id = str(comment.get("id", ""))
    body = str(comment.get("body", ""))
    author = str((comment.get("user") or {}).get("login", ""))
    created = str(comment.get("created_at", ""))
    if reason in {"comment", "author"} and not any(token in body.lower() for token in BOT_MENTION_TOKENS):
        append(log_file, f"[{time.ctime()}] Skipping {label} #{number} - reason={reason} but bot not @mentioned in comment\n")
        claim.unlink(missing_ok=True)
        remove_reaction(comment_url, reaction_id)
        return
    if comment_id and latest_comment_replied(repo, number, created):
        append(log_file, f"[{time.ctime()}] Skipping {label} #{number} - bot already responded after the triggering comment\n")
        claim.unlink(missing_ok=True)
        remove_reaction(comment_url, reaction_id)
        return
    if comment_id:
        (config.claims_dir / f"claimed-gh-notif-{md5_short(comment_id)}-mention-{number}.txt").touch()
        prompt = f"""Use the /respond-github skill with these details:

{label}: #{number}
Repo: {repo}
Comment ID: {comment_id}
Comment Author: {author}
Comment Body:
{body}

Respond to this specific comment on {label} #{number}. Use /respond-github {number} {repo} {comment_id} {author}"""
    else:
        prompt = f"""Use the /respond-github skill: /respond-github {number} {repo}

You were mentioned or someone commented on {label} #{number} in {repo}.
Title: {subject.get("title", "")}
Could not fetch specific comment details. Check recent comments on the {label}."""
    try:
        run_agent(config, f"respond-github-{number}", prompt)
    finally:
        remove_reaction(comment_url, reaction_id)


def process_notification(config: BotConfig, log_file: Path, notification: dict[str, Any]) -> None:
    subject = notification.get("subject", {}) or {}
    subject_type = str(subject.get("type", ""))
    if subject_type not in {"PullRequest", "Issue"}:
        return
    notif_id = str(notification.get("id", ""))
    updated = str(notification.get("updated_at", ""))
    claim = config.claims_dir / f"claimed-gh-{notif_id}-{md5_short(updated)}.txt"
    if not atomic_claim(claim):
        return
    url = str(subject.get("url", ""))
    number = url.rstrip("/").split("/")[-1]
    repo = str((notification.get("repository") or {}).get("full_name", config.github_repo))
    label = "PR" if subject_type == "PullRequest" else "Issue"
    reason = str(notification.get("reason", ""))
    comment_url = str(subject.get("latest_comment_url") or "")
    append(log_file, f"[{time.ctime()}] New GitHub notification: reason={reason} type={subject_type} {label}=#{number} title='{subject.get('title', '')}'\n")
    reaction_id = add_reaction(comment_url)
    if reason == "review_requested" and subject_type == "PullRequest":
        handle_review(config, log_file, notification, number, repo, comment_url, reaction_id, claim)
    elif reason in {"mention", "comment", "team_mention", "author"}:
        handle_comment(config, log_file, notification, number, repo, label, comment_url, reaction_id, claim)
    else:
        append(log_file, f"[{time.ctime()}] Skipping notification {notif_id} with reason={reason}\n")
        claim.unlink(missing_ok=True)
        return
    mark_read(notif_id)


def poll_mentions(config: BotConfig, log_file: Path) -> None:
    poll_file = config.bot_state_dir / "github-last-mention-poll.txt"
    last = int(poll_file.read_text(encoding="utf-8", errors="replace").strip() or "0") if poll_file.exists() else 0
    now = int(time.time())
    if now - last < 900:
        return
    code, out = gh(["api", f"search/issues?q=repo:{config.github_repo}+mentions:slam-paws+updated:>={iso_ago(3600)}&per_page=20"], '.items[] | {number: .number, title: .title, type: (if .pull_request then "PullRequest" else "Issue" end)}')
    if code == 0:
        for item in iter_json_lines(out):
            number = str(item.get("number", ""))
            if list(config.claims_dir.glob(f"claimed-gh-*-mention-{number}.txt")):
                continue
            comments = gh_json(["api", f"repos/{config.github_repo}/issues/{number}/comments?per_page=10&direction=desc"], [])
            if not isinstance(comments, list):
                continue
            recent = next((c for c in comments if any(token in str(c.get("body", "")).lower() for token in BOT_MENTION_TOKENS)), None)
            if not recent:
                continue
            cid = str(recent.get("id", ""))
            created = str(recent.get("created_at", ""))
            if latest_comment_replied(config.github_repo, number, created):
                append(log_file, f"[{time.ctime()}] Mention-poll: skipping #{number} - bot already responded after the mention\n")
                continue
            claim = config.claims_dir / f"claimed-gh-mention-poll-{md5_short(cid)}-mention-{number}.txt"
            if not atomic_claim(claim):
                continue
            label = "PR" if item.get("type") == "PullRequest" else "Issue"
            append(log_file, f"[{time.ctime()}] Mention-poll fallback: found @slam-paws mention in {label} #{number}\n")
            comment_url = f"repos/{config.github_repo}/issues/comments/{cid}"
            reaction_id = add_reaction(comment_url)
            prompt = f"""Use the /respond-github skill with these details:

{label}: #{number}
Repo: {config.github_repo}
Comment ID: {cid}
Comment Author: {(recent.get("user") or {}).get("login", "")}
Comment Body:
{recent.get("body", "")}

Respond to this specific comment on {label} #{number}. Use /respond-github {number} {config.github_repo} {cid} {(recent.get("user") or {}).get("login", "")}"""
            try:
                run_agent(config, f"respond-github-{number}", prompt)
            finally:
                remove_reaction(comment_url, reaction_id)
    poll_file.write_text(str(now), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    _ = argv
    config = BotConfig.from_env()
    for path in [config.bot_log_dir, config.bot_state_dir, config.claims_dir]:
        path.mkdir(parents=True, exist_ok=True)
    lock = Path(f"{config.lock_prefix}-check-github.lock")
    if not atomic_claim(lock):
        return 0
    log_file = config.bot_log_dir / "check-github.log"
    try:
        (config.bot_state_dir / "check-github-heartbeat.txt").touch()
        cleanup_claims(config)
        notifications = notification_items(config, log_file)
        if notifications is None:
            return 1
        poll_mentions(config, log_file)
        if not notifications:
            return 0
        (config.bot_state_dir / "github-last-checked.txt").write_text(utc_now(), encoding="utf-8")
        for notification in notifications:
            process_notification(config, log_file, notification)
        return 0
    finally:
        lock.unlink(missing_ok=True)
