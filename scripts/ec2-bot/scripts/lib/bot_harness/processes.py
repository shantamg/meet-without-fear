"""Process and active-agent helpers."""

from __future__ import annotations

import os
from pathlib import Path

from .json_store import read_json


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def active_agent_dirs(active_dir: Path) -> list[Path]:
    if not active_dir.exists():
        return []
    return [p for p in active_dir.glob("agent-*") if p.is_dir()]


def agent_pid(agent_dir: Path) -> int | None:
    suffix = agent_dir.name.removeprefix("agent-")
    return int(suffix) if suffix.isdigit() else None


def count_running_agents(active_dir: Path, lock_prefix: str = "") -> int:
    seen: set[int] = set()
    for agent_dir in active_agent_dirs(active_dir):
        pid = agent_pid(agent_dir)
        if pid is not None and pid_alive(pid):
            seen.add(pid)
    if lock_prefix:
        for lock in Path(lock_prefix).parent.glob(f"{Path(lock_prefix).name}-ws-*.lock"):
            try:
                pid_text = lock.read_text(encoding="utf-8").strip()
                pid = int(pid_text)
            except (OSError, ValueError):
                continue
            if pid not in seen and pid_alive(pid):
                seen.add(pid)
    return len(seen)


def count_running_workspace_agents(active_dir: Path, workspace: str, lock_prefix: str = "") -> int:
    workspace = workspace.rstrip("/")
    if not workspace:
        return 0
    seen: set[int] = set()
    for agent_dir in active_agent_dirs(active_dir):
        pid = agent_pid(agent_dir)
        if pid is None or not pid_alive(pid):
            continue
        meta = read_json(agent_dir / "meta.json", {}) or {}
        if str(meta.get("workspace", "")).rstrip("/") == workspace:
            seen.add(pid)
    if lock_prefix:
        prefix = Path(lock_prefix)
        for lock in prefix.parent.glob(f"{prefix.name}-ws-{workspace}*.lock"):
            try:
                pid = int(lock.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                continue
            if pid not in seen and pid_alive(pid):
                seen.add(pid)
    return len(seen)


def thread_busy(active_dir: Path, channel: str, thread_ts: str) -> bool:
    for agent_dir in active_agent_dirs(active_dir):
        pid = agent_pid(agent_dir)
        if pid is None or not pid_alive(pid):
            continue
        meta = read_json(agent_dir / "meta.json", {}) or {}
        if meta.get("channel") == channel and meta.get("messageTs") == thread_ts:
            return True
    return False
