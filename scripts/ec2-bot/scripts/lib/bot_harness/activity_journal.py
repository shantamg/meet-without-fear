"""Activity journal read/write/render logic."""

from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .json_store import append_jsonl, iter_jsonl, read_json


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def write_entry_from_env() -> None:
    bot_state_dir = Path(os.environ["BOT_STATE_DIR"])
    agent_home = Path(os.environ["AGENT_HOME"])
    journal = bot_state_dir / "activity-journal.jsonl"
    now = utc_now()
    meta = read_json(agent_home / "meta.json", {}) or {}
    started_at = str(meta.get("startedAt") or "")
    duration = 0
    start = parse_ts(started_at) if started_at else None
    if start:
        duration = max(0, int((datetime.now(timezone.utc) - start).total_seconds() // 60))

    branch = os.environ.get("WORKTREE_BRANCH", "")
    if not branch:
        result = subprocess.run(["git", "branch", "--show-current"], text=True, capture_output=True, check=False)
        branch = result.stdout.strip() or "unknown"

    commits = ""
    commit_count = 0
    if started_at:
        result = subprocess.run(
            ["git", "log", f"--since={started_at}", "--oneline", "--no-merges"],
            text=True,
            capture_output=True,
            check=False,
        )
        lines = [line for line in result.stdout.splitlines() if line][:5]
        commit_count = len(lines)
        commits = " | ".join(lines)

    request = os.environ.get("PROVENANCE_MESSAGE") or "(scheduled)"
    if len(request) > 120:
        request = request[:117] + "..."
    workspace = os.environ.get("WORKSPACE_NAME") or os.environ.get("COMMAND_SLUG", "")
    append_jsonl(
        journal,
        {
            "ts": now,
            "workspace": workspace,
            "channel": os.environ.get("PROVENANCE_CHANNEL", ""),
            "requester": os.environ.get("PROVENANCE_REQUESTER", ""),
            "request": request,
            "branch": branch,
            "commits": commits,
            "commit_count": commit_count,
            "duration": duration,
        },
    )


def render_recent(journal: Path, limit: int = 20) -> str:
    entries = list(iter_jsonl(journal))[-limit:]
    if not entries:
        return ""
    lines = [
        "[RECENT BOT ACTIVITY — last 48h]",
        "Use this to maintain continuity across sessions. You are an autonomous bot.",
        "",
    ]
    for entry in entries:
        line = f"- {entry.get('ts', '')} — {entry.get('workspace', '')}"
        channel = entry.get("channel") or ""
        requester = entry.get("requester") or ""
        if channel:
            line += f" ({channel}{', ' + requester if requester else ''})"
        if entry.get("duration", 0) > 0:
            line += f" — {entry.get('duration')}min"
        lines.append(line)
        request = entry.get("request") or ""
        if request and request != "(scheduled)":
            lines.append(f'  Request: "{request}"')
        if entry.get("commit_count", 0) > 0 and entry.get("commits"):
            lines.append(f"  Commits ({entry.get('commit_count')}): {entry.get('commits')}")
        branch = entry.get("branch") or ""
        if branch and branch not in {"main", "unknown"}:
            lines.append(f"  Branch: {branch}")
    lines += ["", "[END RECENT BOT ACTIVITY]"]
    return "\n".join(lines)


def render_from_env() -> None:
    text = render_recent(Path(os.environ["BOT_STATE_DIR"]) / "activity-journal.jsonl")
    if text:
        print(text)
