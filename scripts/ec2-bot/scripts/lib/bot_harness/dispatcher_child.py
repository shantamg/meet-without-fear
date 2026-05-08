"""Background child runner for label-triggered workspace dispatches."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from .github_state import GitHubState
from .json_store import read_json, write_json
from .logging import log


BOT_USER_LOGINS = {"MwfBot", "slam-paws", "mwf-bot-app[bot]", "slam-bot-app[bot]", "slam-paws-app[bot]"}


def gh(repo: str, args: list[str], *, mutate: bool = False) -> object | None:
    if mutate and os.environ.get("BOT_HARNESS_NO_GH_MUTATION") == "1":
        return None
    proc = subprocess.run(["gh", *args], text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout) if proc.stdout.strip() else None
    except json.JSONDecodeError:
        return None


def prs_fixing_count(repo: str, state_file: str, issue_number: int) -> int:
    state = GitHubState(Path(state_file))
    if state.path.exists() and state.is_fresh():
        return state.prs_fixing_issue_count(issue_number)
    result = gh(repo, ["pr", "list", "--repo", repo, "--search", f"Fixes #{issue_number}", "--state", "all", "--json", "number"])
    return len(result) if isinstance(result, list) else 0


def bot_commented(repo: str, issue_number: int) -> bool:
    comments = gh(repo, ["api", f"repos/{repo}/issues/{issue_number}/comments?per_page=5&direction=desc"])
    if not isinstance(comments, list):
        return False
    return any(
        ((comment.get("user") or {}).get("login") in BOT_USER_LOGINS)
        for comment in comments
        if isinstance(comment, dict)
    )


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("usage: dispatcher_child.py <dispatch.json>", file=sys.stderr)
        return 2
    path = Path(args[0])
    payload = read_json(path, {}) or {}
    logfile = Path(payload["logfile"])
    repo = payload["github_repo"]
    issue = int(payload["issue_number"])
    label = payload["label"]
    workspace = payload["workspace"]
    claim_file = Path(payload["claim_file"])
    keep_label = bool(payload.get("keep_label"))
    state_file = payload.get("github_state_file", "")
    claims_dir = Path(payload["claims_dir"])
    env = os.environ.copy()
    env.update(payload.get("env") or {})
    command = payload["command"]
    exit_code = subprocess.run(command, env=env, check=False).returncode

    claim_file.unlink(missing_ok=True)
    gh(repo, ["issue", "edit", str(issue), "--repo", repo, "--remove-label", "bot:in-progress"], mutate=True)

    if keep_label:
        log(logfile, f"Preserving label {label} on #{issue} (keep_label=true, multi-pass workspace)")
        updated = gh(repo, ["issue", "view", str(issue), "--repo", repo, "--json", "updatedAt"])
        updated_at = updated.get("updatedAt", "") if isinstance(updated, dict) else ""
        cooldown = claims_dir / f"cooldown-{issue}.txt"
        cooldown.parent.mkdir(parents=True, exist_ok=True)
        cooldown.write_text(f"{int(time.time())}\n{updated_at}\n", encoding="utf-8")
    else:
        gh(repo, ["issue", "edit", str(issue), "--repo", repo, "--remove-label", label], mutate=True)

    if exit_code == 0:
        log(logfile, f"Completed #{issue} (workspace={workspace})")
        path.unlink(missing_ok=True)
        return 0

    has_pr = prs_fixing_count(repo, state_file, issue) if state_file else 0
    if has_pr > 0:
        log(logfile, f"Agent exited {exit_code} but PR exists for #{issue} - treating as success")
    elif bot_commented(repo, issue):
        log(logfile, f"Agent exited {exit_code} but posted comments on #{issue} - treating as success")
    else:
        log(logfile, f"Failed #{issue} (workspace={workspace}, exit={exit_code}) - no PR or comments found")
        gh(repo, ["issue", "edit", str(issue), "--repo", repo, "--add-label", "bot:failed"], mutate=True)
    path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
