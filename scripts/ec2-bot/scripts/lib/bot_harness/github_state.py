"""Read helpers for github-state-scanner JSON files."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .json_store import read_json


def parse_ts(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class GitHubState:
    def __init__(self, path: Path, max_age_seconds: int = 180):
        self.path = path
        self.max_age_seconds = max_age_seconds
        self.data: dict[str, Any] = read_json(path, {}) or {}

    def is_fresh(self) -> bool:
        ts = parse_ts(str(self.data.get("fetched_at") or self.data.get("generated_at") or self.data.get("updated_at") or ""))
        if not ts:
            return False
        return (datetime.now(timezone.utc) - ts).total_seconds() <= self.max_age_seconds

    def items_with_any_label(self, labels: list[str]) -> list[dict[str, Any]]:
        wanted = set(labels)
        out: list[dict[str, Any]] = []
        for bucket in ("prs", "issues"):
            values = self.data.get(bucket, {})
            if isinstance(values, dict):
                iterable = values.values()
            elif isinstance(values, list):
                iterable = values
            else:
                iterable = []
            for item in iterable:
                if not isinstance(item, dict):
                    continue
                item_labels = item.get("labels") or []
                if any(label in wanted for label in item_labels):
                    out.append(
                        {
                            "number": item.get("number"),
                            "title": item.get("title", ""),
                            "labels": item_labels,
                            "updatedAt": item.get("updatedAt") or item.get("updated_at") or "",
                            "assignees": item.get("assignees", []),
                        }
                    )
        return out

    def issues_with_label(self, label: str) -> list[int]:
        return [
            int(item["number"])
            for item in self.items_with_any_label([label])
            if item.get("number") is not None and label in (item.get("labels") or [])
        ]

    def prs_fixing_issue_count(self, issue_number: int | str) -> int:
        target = int(issue_number)
        values = self.data.get("prs", {})
        iterable = values.values() if isinstance(values, dict) else values if isinstance(values, list) else []
        count = 0
        for pr in iterable:
            if not isinstance(pr, dict):
                continue
            closing = pr.get("closing_issues") or pr.get("closingIssues") or []
            for issue in closing:
                number = issue.get("number") if isinstance(issue, dict) else issue
                try:
                    if int(number) == target:
                        count += 1
                        break
                except (TypeError, ValueError):
                    continue
        return count
