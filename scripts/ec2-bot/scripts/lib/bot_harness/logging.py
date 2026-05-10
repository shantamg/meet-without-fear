"""File logging helpers for cron-style bot scripts."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path


def append(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(text)


def log(path: Path, message: str) -> None:
    append(path, f"[{datetime.now().ctime()}] {message}\n")
