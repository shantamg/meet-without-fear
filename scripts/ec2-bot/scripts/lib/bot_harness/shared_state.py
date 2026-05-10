"""Shared bot state helpers that replaced jq-heavy shell snippets."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from .json_store import write_json


QUEUE_FIELDS = [
    "command_slug",
    "prompt",
    "prompt_file",
    "msg_ts",
    "channel",
    "provenance_channel",
    "provenance_requester",
    "provenance_message",
    "slack_channel",
    "slack_ts",
    "priority",
    "queued_at",
    "session_key",
    "workspace",
    "model",
    "effort",
    "provider",
    "fallback_provider",
    "review_provider",
    "entry_stage",
    "thread_ts",
    "issue_number",
    "trigger_label",
    "retries",
]


def create_queue_entry(queue_dir: Path, values: dict[str, Any] | None = None) -> Path:
    values = dict(values or {})
    env = os.environ
    command_slug = values.get("command_slug") or env.get("COMMAND_SLUG", "")
    queue_dir.mkdir(parents=True, exist_ok=True)
    queue_file = queue_dir / f"queue-{time.time_ns()}-{command_slug}.json"
    payload = {
        "command_slug": command_slug,
        "prompt": values.get("prompt", env.get("PROMPT", "")),
        "prompt_file": values.get("prompt_file", env.get("PROMPT_FILE", "")),
        "msg_ts": values.get("msg_ts", env.get("MSG_TS", "")),
        "channel": values.get("channel", env.get("CHANNEL", "")),
        "provenance_channel": values.get("provenance_channel", env.get("PROVENANCE_CHANNEL", "")),
        "provenance_requester": values.get("provenance_requester", env.get("PROVENANCE_REQUESTER", "")),
        "provenance_message": values.get("provenance_message", env.get("PROVENANCE_MESSAGE", "")),
        "slack_channel": values.get("slack_channel", env.get("SLACK_CHANNEL", env.get("CHANNEL", ""))),
        "slack_ts": values.get("slack_ts", env.get("SLACK_TS", env.get("MSG_TS", ""))),
        "priority": values.get("priority", env.get("PRIORITY", "normal")),
        "queued_at": values.get("queued_at", env.get("QUEUED_AT") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        "session_key": values.get("session_key", env.get("SESSION_KEY", "")),
        "workspace": values.get("workspace", env.get("WORKSPACE_NAME", "")),
        "model": values.get("model", env.get("MODEL", "")),
        "effort": values.get("effort", env.get("EFFORT", "")),
        "provider": values.get("provider", env.get("PROVIDER", "")),
        "fallback_provider": values.get("fallback_provider", env.get("FALLBACK_PROVIDER", "")),
        "review_provider": values.get("review_provider", env.get("REVIEW_PROVIDER", "")),
        "entry_stage": values.get("entry_stage", env.get("ENTRY_STAGE", "")),
        "thread_ts": values.get("thread_ts", env.get("THREAD_TS", "")),
        "issue_number": values.get("issue_number", env.get("ISSUE_NUMBER", "")),
        "trigger_label": values.get("trigger_label", env.get("TRIGGER_LABEL", "")),
        "retries": int(values.get("retries", env.get("RETRIES", "0")) or 0),
    }
    write_json(queue_file, payload)
    return queue_file
