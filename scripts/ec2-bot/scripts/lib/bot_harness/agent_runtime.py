"""Agent setup, worktree setup, and cleanup helpers."""

from __future__ import annotations

import os
import random
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .activity_journal import write_entry_from_env
from .json_store import read_json, write_json
from .logging import log


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def session_uuid(session_key: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, session_key))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def emit_export(name: str, value: str) -> None:
    if os.environ.get("BOT_HARNESS_EMIT_EXPORTS") != "1":
        return
    print(f"export {name}={shell_quote(value)}")


def setup_agent() -> None:
    pid = int(os.environ.get("SLAM_BOT_PID") or os.getpid())
    agent_home = Path(os.environ["AGENT_HOME"])
    logfile = Path(os.environ["LOGFILE"])
    agent_home.joinpath("inbox/unread").mkdir(parents=True, exist_ok=True)
    agent_home.joinpath("inbox/read").mkdir(parents=True, exist_ok=True)
    session_key = os.environ.get("SESSION_KEY", "")
    sess_uuid = session_uuid(session_key) if session_key else ""
    if session_key:
        log(logfile, f"Session: key={session_key} uuid={sess_uuid}")
    write_json(
        agent_home / "meta.json",
        {
            "pid": pid,
            "commandSlug": os.environ.get("COMMAND_SLUG", ""),
            "workspace": os.environ.get("WORKSPACE_NAME", ""),
            "channel": os.environ.get("CHANNEL", ""),
            "messageTs": os.environ.get("MSG_TS", ""),
            "issueNumber": os.environ.get("ISSUE_NUMBER", ""),
            "startedAt": utc_now(),
            "logFile": logfile.name,
            "sessionKey": session_key,
            "sessionUuid": sess_uuid,
        },
    )
    workspace = os.environ.get("WORKSPACE_NAME", "")
    write_json(agent_home / "route.json", {"workspace": workspace} if workspace else {})
    log(logfile, f"Created _active/agent-{pid} directory")
    emit_export("SLAM_BOT_AGENT_HOME", str(agent_home))


def setup_worktree() -> int:
    pid = int(os.environ.get("SLAM_BOT_PID") or os.getpid())
    project_dir = Path(os.environ["PROJECT_DIR"])
    logfile = Path(os.environ["LOGFILE"])
    os.chdir(project_dir)
    result = subprocess.run(["git", "branch", "--show-current"], text=True, capture_output=True, check=False)
    current_branch = result.stdout.strip()
    skip_worktree = os.environ.get("SKIP_WORKTREE", "0") == "1" or bool(os.environ.get("SESSION_KEY", ""))
    worktree_dir = ""
    worktree_branch = ""
    if not skip_worktree and current_branch == "main":
        command_slug = os.environ.get("COMMAND_SLUG", "agent")
        issue = os.environ.get("ISSUE_NUMBER") or str(pid)
        worktree_branch = f"feat/{command_slug}-{issue}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        worktree_dir = f"/tmp/slam-worktree-{command_slug}-{pid}"
        log(logfile, f"On main - creating worktree at {worktree_dir} on branch {worktree_branch}")
        ok = False
        for attempt in range(5):
            proc = subprocess.run(["git", "worktree", "add", worktree_dir, "-b", worktree_branch], text=True, capture_output=True, check=False)
            if proc.returncode == 0:
                ok = True
                break
            with logfile.open("a", encoding="utf-8") as fh:
                fh.write(proc.stderr)
            if attempt < 4:
                jitter = 0.5 + random.random() * 2
                log(logfile, f"git worktree add failed (attempt {attempt + 1}/5), retrying in {jitter:.1f}s")
                time.sleep(jitter)
        if not ok:
            log(logfile, "ERROR: git worktree add failed after 5 retries")
            return 1
        os.chdir(worktree_dir)

    workspace_dir = ""
    workspace = os.environ.get("WORKSPACE_NAME", "")
    if workspace:
        workspace_dir = str(Path.cwd() / "bot-workspaces" / workspace)
        if not Path(workspace_dir).is_dir():
            log(logfile, f"ERROR: Workspace directory not found: {workspace_dir}")
            return 1
        os.chdir(workspace_dir)
        log(logfile, f"Workspace mode: cd into {workspace_dir}")
    os.environ["WORKTREE_DIR"] = worktree_dir
    os.environ["WORKTREE_BRANCH"] = worktree_branch
    os.environ["WORKSPACE_DIR"] = workspace_dir
    os.environ["PWD"] = str(Path.cwd())
    emit_export("WORKTREE_DIR", worktree_dir)
    emit_export("WORKTREE_BRANCH", worktree_branch)
    emit_export("WORKSPACE_DIR", workspace_dir)
    emit_export("PWD", str(Path.cwd()))
    if os.environ.get("BOT_HARNESS_EMIT_EXPORTS") == "1":
        print(f"cd {shell_quote(str(Path.cwd()))}")
    return 0


def cleanup() -> None:
    pid = int(os.environ.get("SLAM_BOT_PID") or os.getpid())
    logfile = Path(os.environ["LOGFILE"])
    for path in [os.environ.get("LOCKFILE", ""), str(Path(os.environ.get("HEARTBEAT_DIR", "")) / f"heartbeat-{pid}.txt")]:
        if path:
            Path(path).unlink(missing_ok=True)
    agent_home = Path(os.environ["AGENT_HOME"])
    if agent_home.is_dir():
        try:
            write_entry_from_env()
        except Exception:
            pass
        unread = sorted((agent_home / "inbox/unread").glob("*.md"))
        if unread:
            log(logfile, f"WARNING: {len(unread)} unread message(s) in agent-{pid} inbox at exit")
            for path in unread:
                log(logfile, f"Unread message ({path.name}):")
                try:
                    with logfile.open("a", encoding="utf-8") as fh:
                        fh.write(path.read_text(encoding="utf-8", errors="replace"))
                        fh.write("\n")
                except OSError:
                    pass
        route = read_json(agent_home / "route.json", {}) or {}
        route_ws = str(route.get("workspace", ""))
        route_stage = str(route.get("stage", ""))
        if route_ws and route_stage:
            symlink = Path(os.environ["WORKSPACES_DIR"]) / route_ws / "stages" / route_stage / "output" / f"agent-{pid}"
            symlink.unlink(missing_ok=True)
        archive_dir = Path(os.environ["ACTIVE_DIR"]) / "_archived"
        archive_dir.mkdir(parents=True, exist_ok=True)
        archive = archive_dir / f"agent-{pid}-{datetime.now().strftime('%Y%m%dT%H%M%S')}"
        try:
            shutil.move(str(agent_home), str(archive))
        except OSError:
            shutil.rmtree(agent_home, ignore_errors=True)
    prompt_file = os.environ.get("PROMPT_FILE", "")
    lock_prefix = os.environ.get("LOCK_PREFIX", "")
    if prompt_file and lock_prefix and prompt_file.startswith(f"{lock_prefix}-prompt-"):
        Path(prompt_file).unlink(missing_ok=True)
    worktree_dir = os.environ.get("WORKTREE_DIR", "")
    if worktree_dir and Path(worktree_dir).is_dir():
        subprocess.run(["git", "-C", os.environ["REPO_ROOT"], "worktree", "remove", worktree_dir, "--force"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main(argv: list[str] | None = None) -> int:
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print("usage: agent_runtime.py setup-agent|setup-worktree|cleanup", file=sys.stderr)
        return 2
    if args[0] == "setup-agent":
        setup_agent()
        return 0
    if args[0] == "setup-worktree":
        return setup_worktree()
    if args[0] == "cleanup":
        cleanup()
        return 0
    print(f"unknown command: {args[0]}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
