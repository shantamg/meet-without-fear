#!/usr/bin/env python3
"""Regenerate the MWF gold-alignment status dashboard from local artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPO_ROOT / "docs/product/mwf-alignment-status.md"
STAGE_PROMPTS = REPO_ROOT / "backend/src/services/stage-prompts.ts"
PROMPT_VERSIONS_ROOT = REPO_ROOT / "eval/prompt-versions"
MOMENT_RUNS_ROOT = REPO_ROOT / "eval/runs"
ALIGNMENT_RUNS_ROOT = REPO_ROOT / "eval/alignment-runs"
TRANSCRIPTS_ROOT = REPO_ROOT / "docs/product/source-material/golden-transcripts"
MOMENTS_ROOT = REPO_ROOT / "eval/moments"
MOMENT_TYPES_PATH = REPO_ROOT / "eval/moment-types.yaml"


def run_command(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=REPO_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def sha(path: Path) -> str:
    if not path.exists():
        return "missing"
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def load_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def load_moment_types() -> list[dict[str, Any]]:
    data = load_json(MOMENT_TYPES_PATH) or {"moment_types": []}
    return list(data.get("moment_types", []))


def moment_transcript(moment: dict[str, Any]) -> str:
    reference = str(moment.get("rubric", {}).get("reference_transcript_lines") or moment.get("seed", {}).get("history_source") or "")
    match = re.search(r"golden-transcripts/([^/:]+)\.md", reference)
    if match:
        return match.group(1)
    return "unknown"


def moment_type_id(moment: dict[str, Any]) -> str | None:
    if moment.get("moment_type"):
        return str(moment["moment_type"])
    stages = moment.get("stages") or []
    if len(stages) == 1:
        moment_id = str(moment.get("id", ""))
        for sub_state in [
            "fact-reflection",
            "emotional-handling",
            "consent-gate",
            "validation",
            "mutual-reveal",
            "willingness-selection",
        ]:
            if sub_state in moment_id:
                return f"stage-{stages[0]}-{sub_state}"
    return None


def coverage_report() -> dict[str, Any]:
    required = [item["id"] for item in load_moment_types()]
    by_transcript: dict[str, set[str]] = {path.stem: set() for path in gold_examples()}
    for path in MOMENTS_ROOT.glob("*.yaml"):
        moment = load_json(path)
        if not moment:
            continue
        transcript = moment_transcript(moment)
        type_id = moment_type_id(moment)
        if transcript not in by_transcript:
            by_transcript[transcript] = set()
        if type_id:
            by_transcript[transcript].add(type_id)
    return {
        transcript: {
            "covered": sorted(types),
            "missing": sorted(type_id for type_id in required if type_id not in types),
        }
        for transcript, types in sorted(by_transcript.items())
    }


def latest_prompt_versions() -> list[Path]:
    if not PROMPT_VERSIONS_ROOT.exists():
        return []
    return sorted(PROMPT_VERSIONS_ROOT.glob("mwf/stage-*/v*.md"))


def score_trends(limit: int) -> dict[str, list[tuple[str, float | None, str | None]]]:
    trends: dict[str, list[tuple[str, float | None, str | None]]] = {}
    for run_json in sorted(MOMENT_RUNS_ROOT.glob("moment-*/run.json")):
        run = load_json(run_json)
        score = load_json(run_json.parent / "score.json")
        if not run or not score:
            continue
        moment = str(run.get("moment") or run_json.parent.name)
        trends.setdefault(moment, []).append(
            (
                run_json.parent.name,
                score.get("overall_score"),
                score.get("verdict"),
            )
        )
    return {moment: values[-limit:] for moment, values in sorted(trends.items())}


def alignment_summaries() -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for path in sorted(ALIGNMENT_RUNS_ROOT.glob("*/summary.json")):
        summary = load_json(path)
        if summary:
            summary["_path"] = path
            summaries.append(summary)
    return summaries


def spent_since(summaries: list[dict[str, Any]], days: int) -> float:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    total = 0.0
    for summary in summaries:
        started = str(summary.get("started_at", ""))
        try:
            started_at = datetime.fromisoformat(started.replace("Z", "+00:00"))
        except ValueError:
            continue
        if started_at >= cutoff:
            total += float(summary.get("cost_spent_cents", 0))
    return round(total, 4)


def open_loop_prs() -> list[dict[str, Any]]:
    result = run_command(
        [
            "gh",
            "pr",
            "list",
            "--label",
            "loop:auto-improvement",
            "--json",
            "number,title,url,state,isDraft,headRefName",
        ]
    )
    if result.returncode != 0:
        return [{"error": result.stderr.strip() or "gh pr list failed"}]
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return [{"error": "Unable to parse gh pr list output"}]


def latest_outer_loop(summaries: list[dict[str, Any]]) -> dict[str, Any] | None:
    latest: dict[str, Any] | None = None
    for summary in summaries:
        for moment in summary.get("moments", []):
            outer = moment.get("outer_loop")
            if outer:
                latest = {"summary": display_path(summary.get("_path")), "moment": moment.get("id"), **outer}
    return latest


def gold_examples() -> list[Path]:
    return sorted(path for path in TRANSCRIPTS_ROOT.glob("*.md") if path.name != "README.md")


def render_coverage_check() -> str:
    report = coverage_report()
    lines = ["# MWF Alignment Coverage Check", ""]
    for transcript, data in report.items():
        lines.extend(
            [
                f"## {transcript}",
                "",
                "Covered:",
                *(f"- `{item}`" for item in data["covered"]),
                "",
                "Missing:",
                *(f"- `{item}`" for item in data["missing"]),
                "",
            ]
        )
    return "\n".join(lines) + "\n"


def render(limit: int, *, include_coverage: bool = False) -> str:
    summaries = alignment_summaries()
    trends = score_trends(limit)
    prompt_versions = latest_prompt_versions()
    latest_outer = latest_outer_loop(summaries)
    lines = [
        "# MWF Alignment Status",
        "",
        "<!-- Generated by scripts/mwf_alignment_status.py. Do not edit manually. -->",
        "",
        "## Production Prompt",
        "",
        f"- `backend/src/services/stage-prompts.ts` SHA: `{sha(STAGE_PROMPTS)}`",
        "",
        "## Latest Candidate Revisions",
        "",
    ]
    if prompt_versions:
        for path in prompt_versions:
            lines.append(f"- `{display_path(path)}` SHA `{sha(path)}`")
    else:
        lines.append("- None")
    lines.extend(["", "## Open Loop PRs", ""])
    prs = open_loop_prs()
    if prs:
        for pr in prs:
            if "error" in pr:
                lines.append(f"- unavailable: {pr['error']}")
            else:
                draft = "draft" if pr.get("isDraft") else "ready"
                lines.append(f"- #{pr.get('number')} `{draft}` {pr.get('title')} - {pr.get('url')}")
    else:
        lines.append("- None")
    lines.extend(["", "## Score Trends", ""])
    if trends:
        for moment, values in trends.items():
            formatted = ", ".join(f"{score} {verdict} ({run})" for run, score, verdict in values)
            lines.append(f"- `{moment}`: {formatted}")
    else:
        lines.append("- No moment runs found")
    lines.extend(
        [
            "",
            "## Cost",
            "",
            f"- This week: `{spent_since(summaries, 7)}` cents",
            f"- This month: `{spent_since(summaries, 31)}` cents",
            "",
            "## Last E2E Outer Loop",
            "",
        ]
    )
    if latest_outer:
        lines.append(f"- Moment `{latest_outer.get('moment')}`: `{latest_outer.get('status')}` in `{latest_outer.get('run_dir')}`")
    else:
        lines.append("- None recorded")
    lines.extend(["", "## Gold Examples", ""])
    for path in gold_examples():
        lines.append(f"- `{display_path(path)}`")
    if include_coverage:
        lines.extend(["", "## Coverage Check", ""])
        report = coverage_report()
        for transcript, data in report.items():
            lines.append(f"- `{transcript}`: {len(data['covered'])} covered, {len(data['missing'])} missing")
    return "\n".join(lines) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Regenerate docs/product/mwf-alignment-status.md")
    parser.add_argument("--limit", type=int, default=5, help="Moment score history entries per moment")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--coverage-check", action="store_true", help="Print per-transcript moment-type coverage and do not write the dashboard")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.coverage_check:
        print(render_coverage_check(), end="")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render(args.limit, include_coverage=True), encoding="utf-8")
    print(args.output.relative_to(REPO_ROOT) if args.output.is_relative_to(REPO_ROOT) else args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
