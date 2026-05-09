"""Label registry parsing and resolution."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .json_store import read_json


class LabelRegistry:
    def __init__(self, path: Path):
        self.path = path
        data = read_json(path, {}) or {}
        self.labels: dict[str, dict[str, Any]] = {
            str(k): v for k, v in (data.get("labels") or {}).items() if isinstance(v, dict)
        }

    def trigger_labels(self) -> list[str]:
        return [label for label, entry in self.labels.items() if entry.get("trigger") == "label"]

    def for_label(self, label: str, field: str, default: str = "") -> str:
        value = self.labels.get(label, {}).get(field, default)
        return "" if value is None else str(value)

    def bool_for_label(self, label: str, field: str, default: bool = False) -> bool:
        value = self.labels.get(label, {}).get(field, default)
        return bool(value)

    def int_for_label(self, label: str, field: str) -> int | None:
        value = self.labels.get(label, {}).get(field)
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def by_workspace(self, workspace: str, field: str, default: str = "") -> str:
        workspace = workspace.rstrip("/")
        for entry in self.labels.values():
            if str(entry.get("workspace", "")).rstrip("/") == workspace:
                value = entry.get(field, default)
                return "" if value is None else str(value)
        return default

    def labels_for_workspace(self, workspace: str) -> list[str]:
        workspace = workspace.rstrip("/")
        return [
            label
            for label, entry in self.labels.items()
            if str(entry.get("workspace", "")).rstrip("/") == workspace
        ]
