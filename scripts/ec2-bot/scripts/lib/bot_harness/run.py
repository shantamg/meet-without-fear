"""Public runner entrypoint for bot sessions."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib import request
from urllib.parse import urlencode

from . import agent_runtime, providers
from .config import BotConfig
from .logging import append
from .shared_state import create_queue_entry


def sanitize_slug(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip())
    return cleaned.strip("_") or "agent"


def sanitize_key(value: str, pattern: str = r"[^A-Za-z0-9_-]+") -> str:
    return re.sub(pattern, "_", value)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="bot_harness run")
    parser.add_argument("--workspace", default="")
    parser.add_argument("--session", dest="session_key", default="")
    parser.add_argument("--no-worktree", action="store_true")
    parser.add_argument("--model", default="")
    parser.add_argument("--effort", default="")
    parser.add_argument("--provider", default="")
    parser.add_argument("--fallback-provider", default="")
    parser.add_argument("--review-provider", default="")
    parser.add_argument("positionals", nargs="*")
    args = parser.parse_args(argv)
    pos = list(args.positionals)
    if args.workspace:
        args.workspace = sanitize_key(args.workspace)
        args.command_slug = f"ws-{args.workspace}"
        args.prompt = pos[0] if len(pos) > 0 else ""
        args.prompt_file = pos[1] if len(pos) > 1 else ""
        args.msg_ts = pos[2] if len(pos) > 2 else ""
    else:
        if not pos:
            parser.error("command_slug is required unless --workspace is used")
        args.command_slug = sanitize_slug(pos[0])
        args.prompt = pos[1] if len(pos) > 1 else ""
        args.prompt_file = pos[2] if len(pos) > 2 else ""
        args.msg_ts = pos[3] if len(pos) > 3 else ""
    del args.positionals
    return args


def ensure_dirs(config: BotConfig) -> None:
    for path in [config.bot_log_dir, config.bot_state_dir, config.bot_queue_dir, config.active_dir, config.heartbeat_dir, config.claims_dir]:
        path.mkdir(parents=True, exist_ok=True)


def lock_and_log(config: BotConfig, args: argparse.Namespace) -> tuple[Path, Path] | None:
    issue = os.environ.get("ISSUE_NUMBER", "")
    if args.session_key:
        key = sanitize_key(args.session_key)
        lockfile = Path(f"{config.lock_prefix}-{args.command_slug}-{key}.lock")
        logfile = config.bot_log_dir / f"{args.command_slug}-{key}.log"
    elif args.msg_ts:
        ts = sanitize_key(args.msg_ts, r"[^0-9.]+")
        lockfile = Path(f"{config.lock_prefix}-{args.command_slug}-{ts}.lock")
        logfile = config.bot_log_dir / f"{args.command_slug}-{ts}.log"
    else:
        suffix = f"-issue-{issue}" if issue else ""
        lockfile = Path(f"{config.lock_prefix}-{args.command_slug}{suffix}.lock")
        logfile = config.bot_log_dir / f"{args.command_slug}{suffix}.log"
    try:
        lockfile.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(lockfile), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        return None
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(str(os.getpid()))
    return lockfile, logfile


def is_priority_bypass(channel: str) -> bool:
    if not channel:
        return False
    if channel.startswith("D"):
        return True
    return channel in os.environ.get("PRIORITY_BYPASS_CHANNELS", os.environ.get("AGENTIC_DEVS_CHANNEL_ID", "")).split()


def run_resource_check(config: BotConfig) -> tuple[bool, str]:
    script = config.bot_scripts_dir / "check-resources.sh"
    if not script.exists():
        return True, ""
    proc = subprocess.run([str(script)], text=True, capture_output=True, check=False)
    return proc.returncode == 0, (proc.stdout + proc.stderr).strip()


def slack_reaction(config: BotConfig, endpoint: str, channel: str, ts: str, name: str) -> None:
    if not config.slack_bot_token or not channel or not ts:
        return
    data = urlencode({"channel": channel, "timestamp": ts, "name": name}).encode()
    req = request.Request(
        f"https://slack.com/api/{endpoint}",
        data=data,
        headers={"Authorization": f"Bearer {config.slack_bot_token}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        request.urlopen(req, timeout=10).read()
    except Exception:
        pass


def slack_alert(config: BotConfig, text: str) -> None:
    if not config.slack_bot_token or not config.bot_ops_channel_id:
        return
    data = urlencode({"channel": config.bot_ops_channel_id, "text": text}).encode()
    req = request.Request(
        "https://slack.com/api/chat.postMessage",
        data=data,
        headers={"Authorization": f"Bearer {config.slack_bot_token}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        request.urlopen(req, timeout=10).read()
    except Exception:
        pass


def gh_budget(function: str, env: dict[str, str]) -> None:
    lib_dir = Path(env["LIB_DIR"])
    helper = lib_dir / "gh-budget.sh"
    if not helper.exists():
        return
    subprocess.run(["bash", "-lc", f'source "{helper}"; {function}'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def publish(config: BotConfig, event: str, payload: str) -> None:
    script = config.bot_scripts_dir / "publish-bot-event.mjs"
    if script.exists():
        subprocess.Popen(["node", str(script), event, payload], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def provenance_block() -> str:
    requester = os.environ.get("PROVENANCE_REQUESTER", "")
    channel = os.environ.get("PROVENANCE_CHANNEL", "")
    if not requester and not channel:
        return ""
    message = os.environ.get("PROVENANCE_MESSAGE", "(not available)")
    return f"""
[PROVENANCE]
The following provenance metadata was resolved programmatically at dispatch time. Use these EXACT values (do not paraphrase or re-derive) when writing Provenance sections in PRs or issues:
- Channel: {channel or "unknown"}
- Requester: {requester or "unknown"}
- Original message: {message}
[END PROVENANCE]
"""


def line_count(path: Path) -> int:
    if not path.exists():
        return 0
    return len(path.read_text(encoding="utf-8", errors="replace").splitlines())


def tail_from(path: Path, start_line: int) -> str:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[max(start_line - 1, 0) :])


def detect_errors(config: BotConfig, slug: str, tail: str, logfile: Path) -> int:
    error_lines = [line for line in tail.splitlines() if line.lower().startswith("error:")][:5]
    if error_lines:
        msg = "\n".join(error_lines)
        slack_alert(config, f"slam-paws error running `{slug}`:\n```\n{msg}\n```")
        append(config.bot_log_dir / "auth-failures.log", f"[{time.ctime()}] CLI ERROR on {slug}: {msg}\n")
        return 1
    if re.search(r"login|sign in|authenticate|expired|unauthorized|APIError.*401", tail, re.I):
        slack_alert(config, f"slam-paws: provider auth failed running '{slug}'. SSH in and re-authenticate the selected CLI.")
        append(config.bot_log_dir / "auth-failures.log", f"[{time.ctime()}] AUTH FAILURE on {slug}\n")
        return 1
    if re.search(r"gh auth|token.*expired|Bad credentials", tail, re.I):
        slack_alert(config, f"slam-paws: GitHub token expired running '{slug}'. SSH in and update GH_TOKEN.")
        append(config.bot_log_dir / "auth-failures.log", f"[{time.ctime()}] GH_TOKEN FAILURE on {slug}\n")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args([] if argv is None else list(argv))
    config = BotConfig.from_env()
    ensure_dirs(config)
    lock_log = lock_and_log(config, args)
    if lock_log is None:
        return 0
    lockfile, logfile = lock_log

    pid = os.getpid()
    agent_home = config.active_dir / f"agent-{pid}"
    env_updates = {
        "BOT_HOME": str(config.bot_home),
        "BOT_LOG_DIR": str(config.bot_log_dir),
        "BOT_STATE_DIR": str(config.bot_state_dir),
        "BOT_QUEUE_DIR": str(config.bot_queue_dir),
        "REPO_ROOT": str(config.repo_root),
        "PROJECT_DIR": str(config.project_dir),
        "WORKSPACES_DIR": str(config.workspaces_dir),
        "ACTIVE_DIR": str(config.active_dir),
        "BOT_SCRIPTS_DIR": str(config.bot_scripts_dir),
        "LIB_DIR": str(config.bot_scripts_dir / "lib"),
        "REGISTRY_FILE": str(config.registry_file),
        "LOCK_PREFIX": config.lock_prefix,
        "HEARTBEAT_DIR": str(config.heartbeat_dir),
        "CLAIMS_DIR": str(config.claims_dir),
        "LOCKFILE": str(lockfile),
        "LOGFILE": str(logfile),
        "AGENT_HOME": str(agent_home),
        "COMMAND_SLUG": args.command_slug,
        "PROMPT": args.prompt,
        "PROMPT_FILE": args.prompt_file,
        "MSG_TS": args.msg_ts,
        "SESSION_KEY": args.session_key,
        "WORKSPACE_NAME": args.workspace,
        "SKIP_WORKTREE": "1" if args.no_worktree else os.environ.get("SKIP_WORKTREE", "0"),
        "MODEL": args.model or os.environ.get("MODEL", ""),
        "EFFORT": args.effort or os.environ.get("EFFORT", ""),
        "PROVIDER": args.provider or os.environ.get("PROVIDER", ""),
        "EXPLICIT_PROVIDER": "1" if args.provider else os.environ.get("EXPLICIT_PROVIDER", "0"),
        "FALLBACK_PROVIDER": args.fallback_provider or os.environ.get("FALLBACK_PROVIDER", ""),
        "REVIEW_PROVIDER": args.review_provider or os.environ.get("REVIEW_PROVIDER", ""),
        "SLAM_BOT": "1",
        "SLAM_BOT_PID": str(pid),
    }
    os.environ.update(env_updates)
    try:
        gh_budget("gh_budget_setup", os.environ.copy())
        ok, resource_msg = run_resource_check(config)
        if not ok and not is_priority_bypass(os.environ.get("CHANNEL", "")):
            append(logfile, f"[{time.ctime()}] QUEUED {args.command_slug} - {resource_msg}\n")
            create_queue_entry(config.bot_queue_dir)
            slack_reaction(config, "reactions.remove", os.environ.get("CHANNEL", ""), args.msg_ts, "eyes")
            slack_reaction(config, "reactions.add", os.environ.get("CHANNEL", ""), args.msg_ts, "hourglass_flowing_sand")
            return 0
        if not ok:
            append(logfile, f"[{time.ctime()}] PRIORITY BYPASS {args.command_slug} - channel={os.environ.get('CHANNEL', '')} bypasses resource gate ({resource_msg})\n")

        append(logfile, f"=== [{time.ctime()}] START {args.command_slug}{(' (msg: ' + args.msg_ts + ')') if args.msg_ts else ''} ===\n")
        start_line = line_count(logfile)
        heartbeat = config.heartbeat_dir / f"heartbeat-{pid}.txt"
        heartbeat.parent.mkdir(parents=True, exist_ok=True)
        heartbeat.touch()
        agent_runtime.setup_agent()
        worktree_status = agent_runtime.setup_worktree()
        if worktree_status != 0:
            return worktree_status
        os.environ["PROVENANCE_BLOCK"] = provenance_block()
        publish(config, "session.started", f'{{"pid":{pid},"branch":"{os.environ.get("WORKTREE_BRANCH") or "unknown"}","summary":"{args.command_slug}","channel":"{os.environ.get("CHANNEL", "")}","messageTs":"{args.msg_ts}","startedAt":"{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}"}}')
        invoke_status = providers.main()
        gh_budget("gh_budget_log_final", os.environ.copy())
        append(logfile, f"=== [{time.ctime()}] END {args.command_slug}{(' (msg: ' + args.msg_ts + ')') if args.msg_ts else ''} ===\n")
        publish(config, "session.ended", f'{{"pid":{pid},"branch":"{os.environ.get("WORKTREE_BRANCH") or "unknown"}","summary":"{args.command_slug}","endedAt":"{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}","status":"completed"}}')
        error_status = detect_errors(config, args.command_slug, tail_from(logfile, start_line), logfile)
        if error_status:
            return error_status
        return invoke_status
    finally:
        try:
            agent_runtime.cleanup()
        finally:
            lockfile.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
