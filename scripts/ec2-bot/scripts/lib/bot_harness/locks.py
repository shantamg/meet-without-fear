"""Atomic claim and lock helpers."""

from __future__ import annotations

import os
from pathlib import Path

from .processes import pid_alive


def read_pid(path: Path) -> int | None:
    try:
        text = path.read_text(encoding="utf-8").strip()
        return int(text) if text else None
    except (OSError, ValueError):
        return None


def claim(path: Path, pid: int | None = None) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        existing = read_pid(path)
        if existing and pid_alive(existing):
            return False
        path.unlink(missing_ok=True)
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    try:
        fd = os.open(path, flags)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(str(pid or os.getpid()))
        fh.write("\n")
    return True
