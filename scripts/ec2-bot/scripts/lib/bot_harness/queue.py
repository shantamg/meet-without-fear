"""Queue processor for deferred EC2 bot work."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import parse, request

from .config import BotConfig
from .json_store import read_json
from .logging import log
from .paths import queue_files
from .processes import count_running_agents, count_running_workspace_agents, thread_busy
from .registry import LabelRegistry
from .shared_state import create_queue_entry


PRIORITIES = ["high", "normal", "low"]


def parse_time(value: str) -> datetime | None:
    if not value or value == "null":
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def select_next(queue_dir: Path) -> Path | None:
    entries = [(path, read_json(path, {}) or {}) for path in queue_files(queue_dir)]
    for priority in PRIORITIES:
        for path, data in entries:
            if data.get("priority", "normal") == priority:
                return path
    return entries[0][0] if entries else None


def backfill_metadata(item: dict) -> None:
    prompt = str(item.get("prompt") or "")
    if not item.get("issue_number"):
        match = re.search(r"(?:GitHub issue|Issue:)\s*#([0-9]+)", prompt)
        if match:
            item["issue_number"] = match.group(1)
    if not item.get("trigger_label"):
        match = re.search(r"^Label:\s+(bot:[^\s]+)", prompt, flags=re.MULTILINE)
        if match:
            item["trigger_label"] = match.group(1)


def run_json(cmd: list[str]) -> dict | None:
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def trigger_label_stale(config: BotConfig, item: dict) -> bool | None:
    workspace = item.get("workspace") or ""
    issue = item.get("issue_number") or ""
    label = item.get("trigger_label") or ""
    if not workspace or not issue or not label:
        return False
    state = run_json(["gh", "issue", "view", str(issue), "--repo", config.github_repo, "--json", "state,labels"])
    if state is None:
        return None
    labels = state.get("labels") or []
    names = [entry.get("name") if isinstance(entry, dict) else entry for entry in labels]
    return state.get("state") != "OPEN" or label not in names


def resources_available(config: BotConfig) -> bool:
    return subprocess.run([str(config.bot_scripts_dir / "check-resources.sh")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0


def slack_post(config: BotConfig, endpoint: str, payload: dict) -> None:
    if not config.slack_bot_token:
        return
    req = request.Request(
        f"https://slack.com/api/{endpoint}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.slack_bot_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        request.urlopen(req, timeout=10).read()
    except Exception:
        return


def remove_reaction(config: BotConfig, channel: str, ts: str, name: str) -> None:
    if channel and ts:
        slack_post(config, "reactions.remove", {"channel": channel, "timestamp": ts, "name": name})


def add_reaction(config: BotConfig, channel: str, ts: str, name: str) -> None:
    if channel and ts:
        slack_post(config, "reactions.add", {"channel": channel, "timestamp": ts, "name": name})


def mark_cancelled(config: BotConfig, item: dict) -> None:
    channel = str(item.get("slack_channel") or "")
    ts = str(item.get("slack_ts") or "")
    remove_reaction(config, channel, ts, "hourglass_flowing_sand")


def mark_dequeued(config: BotConfig, item: dict) -> None:
    channel = str(item.get("slack_channel") or "")
    ts = str(item.get("slack_ts") or "")
    remove_reaction(config, channel, ts, "hourglass_flowing_sand")
    remove_reaction(config, channel, ts, "zzz")
    add_reaction(config, channel, ts, "eyes")


def slack_cancelled(config: BotConfig, item: dict, logfile: Path) -> bool:
    token = config.slack_bot_token
    channel = item.get("slack_channel") or ""
    ts = item.get("slack_ts") or ""
    if not token or not channel or not ts:
        return False
    thread_ts = str(item.get("thread_ts") or "")
    if thread_ts:
        endpoint = "conversations.replies"
        params = {"channel": channel, "ts": thread_ts, "oldest": ts, "latest": ts, "inclusive": "true", "limit": "1"}
    else:
        endpoint = "conversations.history"
        params = {"channel": channel, "oldest": ts, "latest": ts, "inclusive": "true", "limit": "1"}
    qs = parse.urlencode(params)
    req = request.Request(
        f"https://slack.com/api/{endpoint}?{qs}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        payload = json.loads(request.urlopen(req, timeout=10).read().decode("utf-8"))
    except Exception:
        return False
    messages = payload.get("messages") or []
    message = next((m for m in messages if str(m.get("ts", "")) == str(ts)), None)
    if not message:
        log(logfile, f"CANCELLED {item.get('command_slug', '')} - original message deleted (channel={channel} ts={ts})")
        mark_cancelled(config, item)
        return True
    for reaction in message.get("reactions") or []:
        if reaction.get("name") == "x":
            log(logfile, f"CANCELLED {item.get('command_slug', '')} - x reaction found (channel={channel} ts={ts})")
            mark_cancelled(config, item)
            return True
    return False


def dispatch(config: BotConfig, item: dict, logfile: Path) -> int:
    env = os.environ.copy()
    lib_path = str(config.bot_scripts_dir / "lib")
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{lib_path}:{existing_pythonpath}" if existing_pythonpath else lib_path
    env.update(
        {
            "CHANNEL": str(item.get("channel") or ""),
            "PROVENANCE_CHANNEL": str(item.get("provenance_channel") or ""),
            "PROVENANCE_REQUESTER": str(item.get("provenance_requester") or ""),
            "PROVENANCE_MESSAGE": str(item.get("provenance_message") or ""),
            "ISSUE_NUMBER": str(item.get("issue_number") or ""),
            "TRIGGER_LABEL": str(item.get("trigger_label") or ""),
            "ENTRY_STAGE": str(item.get("entry_stage") or ""),
            "MODEL": str(item.get("model") or ""),
            "EFFORT": str(item.get("effort") or ""),
            "PROVIDER": str(item.get("provider") or ""),
            "FALLBACK_PROVIDER": str(item.get("fallback_provider") or ""),
            "REVIEW_PROVIDER": str(item.get("review_provider") or ""),
        }
    )
    args = [str(config.bot_scripts_dir / "run-claude.sh")]
    workspace = str(item.get("workspace") or "")
    session_key = str(item.get("session_key") or "")
    if workspace:
        args += ["--workspace", workspace]
    if session_key:
        args += ["--session", session_key]
    if workspace:
        args += [str(item.get("prompt") or ""), str(item.get("prompt_file") or ""), str(item.get("msg_ts") or "")]
    else:
        args += [str(item.get("command_slug") or ""), str(item.get("prompt") or ""), str(item.get("prompt_file") or ""), str(item.get("msg_ts") or "")]
    if os.environ.get("BOT_HARNESS_SYNC") == "1":
        with logfile.open("a", encoding="utf-8") as fh:
            return subprocess.run(args, env=env, stdout=fh, stderr=fh, check=False).returncode
    with logfile.open("a", encoding="utf-8") as fh:
        proc = subprocess.Popen(args, env=env, stdout=fh, stderr=fh)
    log(logfile, f"Dispatched queued {item.get('command_slug', '')} (PID {proc.pid})")
    return 0


def process_one(config: BotConfig) -> int:
    logfile = config.bot_log_dir / "process-queue.log"
    queue_dir = config.bot_queue_dir
    if not queue_dir.is_dir():
        return 0
    path = select_next(queue_dir)
    if path is None:
        return 0
    item = read_json(path, {}) or {}
    backfill_metadata(item)
    command_slug = item.get("command_slug") or ""
    if not command_slug:
        log(logfile, f"Invalid queue entry (no command_slug), removing: {path}")
        path.unlink(missing_ok=True)
        return 0

    stale = trigger_label_stale(config, item)
    if stale is None:
        log(logfile, f"Could not validate trigger label {item.get('trigger_label')} for #{item.get('issue_number')} - keeping queued item")
        return 0
    if stale:
        log(logfile, f"DISCARDED {command_slug} for #{item.get('issue_number')} - stale trigger label {item.get('trigger_label')}")
        path.unlink(missing_ok=True)
        return 0

    workspace = str(item.get("workspace") or "")
    trigger_label = str(item.get("trigger_label") or "")
    if workspace and trigger_label and config.registry_file.exists():
        max_ws = LabelRegistry(config.registry_file).int_for_label(trigger_label, "max_concurrent")
        if max_ws is not None and count_running_workspace_agents(config.active_dir, workspace, config.lock_prefix) >= max_ws:
            log(logfile, f"Deferring {command_slug} - workspace={workspace} at max {max_ws}")
            return 0

    if not resources_available(config):
        log(logfile, f"Resources still insufficient, keeping {len(queue_files(queue_dir))} items queued")
        return 0

    if slack_cancelled(config, item, logfile):
        path.unlink(missing_ok=True)
        return 0

    path.unlink(missing_ok=True)
    retries = int(item.get("retries") or 0)
    if retries >= config.max_queue_retries:
        log(logfile, f"DISCARDED {command_slug} - exceeded max retries ({retries}/{config.max_queue_retries})")
        return 0
    queued_at = parse_time(str(item.get("queued_at") or ""))
    if queued_at:
        age_min = int((datetime.now(timezone.utc) - queued_at).total_seconds() // 60)
        if age_min >= config.queue_ttl_minutes:
            log(logfile, f"DISCARDED {command_slug} - exceeded TTL ({age_min}m > {config.queue_ttl_minutes}m)")
            return 0
    if item.get("thread_ts") and item.get("channel") and thread_busy(config.active_dir, str(item["channel"]), str(item["thread_ts"])):
        item["retries"] = retries + 1
        create_queue_entry(queue_dir, item)
        log(logfile, f"Deferring {command_slug} - thread {item.get('thread_ts')} in {item.get('channel')} has active agent (retry {retries + 1})")
        return 0
    if item.get("priority", "normal") == "low":
        scheduled_max = config.max_concurrent - config.reserved_interactive_slots
        running = count_running_agents(config.active_dir, config.lock_prefix)
        if running >= scheduled_max:
            item["retries"] = retries + 1
            create_queue_entry(queue_dir, item)
            log(logfile, f"Deferring low-priority {command_slug} - {running} agents running (scheduled max {scheduled_max}) (retry {retries + 1})")
            return 0
    log(logfile, f"Processing queued request: {command_slug} (priority={item.get('priority', 'normal')}, queued at {item.get('queued_at', '')})")
    mark_dequeued(config, item)
    dispatch(config, item, logfile)
    remaining = len(queue_files(queue_dir))
    if remaining:
        log(logfile, f"{remaining} items still in queue")
    return 0


def main(argv: list[str] | None = None) -> int:
    _ = argv
    return process_one(BotConfig.from_env())


if __name__ == "__main__":
    raise SystemExit(main())
