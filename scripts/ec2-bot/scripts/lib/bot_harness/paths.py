"""Path helpers for bot harness compatibility scripts."""

from __future__ import annotations

import re
from pathlib import Path


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", value)


def queue_files(queue_dir: Path) -> list[Path]:
    return sorted(queue_dir.glob("queue-*.json")) if queue_dir.exists() else []
