#!/usr/bin/env python3
"""Onboard a new MWF gold transcript into draft moment files."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mwf_extract_moments as extractor  # noqa: E402
import mwf_gold_profile as gold_profile  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPTS_ROOT = REPO_ROOT / "docs/product/source-material/golden-transcripts"
MOMENTS_ROOT = REPO_ROOT / "eval/moments"
INDEX_PATH = MOMENTS_ROOT / "README.md"
ALIGNMENT_CONFIG = REPO_ROOT / "eval/alignment-loop-config.yaml"
SCENARIOS_PATH = REPO_ROOT / "eval/gold-scenarios.json"


class GoldExampleError(RuntimeError):
    pass


@dataclass
class StageSection:
    stage: int
    start_line: int
    end_line: int
    trigger: str
    response: str


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "gold-example"


def run_command(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=REPO_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def validate_transcript(path: Path) -> str:
    if path.suffix.lower() != ".md":
        raise GoldExampleError("Gold transcript must be a markdown file")
    text = path.read_text(encoding="utf-8")
    if not re.search(r"^##\s*Stage\s+[0-9]+", text, flags=re.MULTILINE | re.IGNORECASE):
        raise GoldExampleError("Gold transcript must include markdown stage markers such as '## Stage 1'")
    return text


def infer_participants(text: str) -> list[str]:
    participants: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"^(?:\*\*)?([^:*#\n]+):(?:\*\*)?\s+", text, flags=re.MULTILINE):
        speaker = match.group(1).strip()
        if speaker.lower() in {"mwf", "meet without fear"}:
            continue
        if speaker not in seen:
            participants.append(speaker)
            seen.add(speaker)
    return participants[:2]


def load_scenario_registry() -> dict[str, Any]:
    if SCENARIOS_PATH.exists():
        return json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    return {"scenarios": []}


def update_scenario_registry(slug: str, dest: Path, text: str) -> dict[str, Any]:
    payload = load_scenario_registry()
    scenarios = payload.setdefault("scenarios", [])
    existing = next((item for item in scenarios if item.get("id") == slug), None)
    participants = infer_participants(text)
    entry = {
        "id": slug,
        "participants": participants,
        "reference_transcript": display_path(dest),
        "gold_profile": display_path(gold_profile.PROFILES_ROOT / f"{slug}.json"),
        "live_enabled": len(participants) == 2,
    }
    if existing is None:
        scenarios.append(entry)
    else:
        existing.setdefault("participants", participants)
        existing.setdefault("reference_transcript", display_path(dest))
        existing.setdefault("gold_profile", display_path(gold_profile.PROFILES_ROOT / f"{slug}.json"))
        existing.setdefault("live_enabled", len(existing.get("participants", [])) == 2)
        entry = existing
    scenarios.sort(key=lambda item: str(item.get("id", "")))
    SCENARIOS_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return entry


def find_stage_sections(text: str) -> list[StageSection]:
    lines = text.splitlines()
    headings: list[tuple[int, int]] = []
    for index, line in enumerate(lines, start=1):
        match = re.match(r"^##\s*Stage\s+([0-9]+)\b", line, flags=re.IGNORECASE)
        if match:
            headings.append((index, int(match.group(1))))
    sections: list[StageSection] = []
    for pos, (start, stage) in enumerate(headings):
        end = headings[pos + 1][0] - 1 if pos + 1 < len(headings) else len(lines)
        body = lines[start:end]
        trigger = ""
        response = ""
        previous_user = ""
        for line in body:
            speaker = re.match(r"^\*\*([^:*]+):\*\*\s*(.*)", line)
            if not speaker:
                continue
            name = speaker.group(1).strip()
            content = speaker.group(2).strip()
            if name.upper() == "MWF":
                trigger = previous_user
                response = content
                break
            previous_user = content
        if response:
            sections.append(StageSection(stage=stage, start_line=start, end_line=end, trigger=trigger, response=response))
    return sections


def draft_moment(slug: str, dest: Path, section: StageSection) -> dict[str, Any]:
    moment_id = f"{slug}-stage-{section.stage}-moment-01"
    return {
        "id": moment_id,
        "stages": [section.stage],
        "description": f"Draft scaffold from {dest.name} Stage {section.stage}.",
        "seed": {
            "scenario": slug,
            "stage": section.stage,
            "transcript": display_path(dest),
            "line_range": f"{section.start_line}-{section.end_line}",
        },
        "trigger": {"user_turn": section.trigger or "TODO: select the user turn that triggers this moment."},
        "capture": {"ai_response": True},
        "rubric": {
            "reference_transcript_lines": f"{display_path(dest)}:{section.start_line}-{section.end_line}",
            "judge_prompt": "TODO: add eval/scorer/judge-prompts/<moment-id>.md",
            "overall_pass_threshold": 4.0,
            "dimensions": [
                {"id": "gold_posture", "description": "Preserves the posture shown in the gold transcript."},
                {"id": "stage_fidelity", "description": "Stays within the stage contract."},
                {"id": "agency_protection", "description": "Protects user agency and consent."},
            ],
            "hard_invariants": [
                {"id": "no_stage_jump", "description": "Does not introduce later-stage work before the transcript earns it."},
                {"id": "no_advice_or_verdict", "description": "Does not advise, decide, or render a verdict for the user."},
            ],
        },
        "expected_response": section.response,
        "improver": {"candidate_owners": ["mwf_prompts"], "default_owner": "mwf_prompts"},
        "draft": True,
    }


def write_drafts(slug: str, dest: Path, sections: list[StageSection]) -> list[Path]:
    MOMENTS_ROOT.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for section in sections:
        data = draft_moment(slug, dest, section)
        path = MOMENTS_ROOT / f"{data['id']}.yaml.draft"
        path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        written.append(path)
    return written


def regenerate_index() -> None:
    MOMENTS_ROOT.mkdir(parents=True, exist_ok=True)
    lines = [
        "# MWF Moment Library Index",
        "",
        "Generated by `scripts/mwf_add_gold_example.py`.",
        "",
        "## Authored Moments",
        "",
    ]
    authored = sorted(MOMENTS_ROOT.glob("*.yaml"))
    lines.extend(f"- `{path.stem}`" for path in authored)
    lines.extend(["", "## Draft Scaffolds", ""])
    drafts = sorted(MOMENTS_ROOT.glob("*.yaml.draft"))
    lines.extend(f"- `{path.name}`" for path in drafts)
    if not drafts:
        lines.append("- None")
    INDEX_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def update_alignment_config(moment_ids: list[str]) -> None:
    if not moment_ids:
        return
    config = json.loads(ALIGNMENT_CONFIG.read_text(encoding="utf-8"))
    moments = config.setdefault("moments", [])
    existing = {item.get("id") for item in moments if isinstance(item, dict)}
    for moment_id in sorted(moment_ids):
        if moment_id not in existing:
            moments.append({"id": moment_id, "threshold": 4.0})
    ALIGNMENT_CONFIG.write_text(json.dumps(config, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def onboard(
    path: Path,
    *,
    skip_tests: bool = False,
    auto: bool = False,
    max_moments: int = 8,
    llm_rubrics: bool = False,
    overwrite_generated: bool = False,
) -> dict[str, Any]:
    source = path.resolve()
    text = validate_transcript(source)
    slug = slugify(source.stem)
    dest = TRANSCRIPTS_ROOT / f"{slug}.md"
    TRANSCRIPTS_ROOT.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.read_text(encoding="utf-8") != text:
        raise GoldExampleError(f"Refusing to overwrite existing transcript: {dest}")
    if source != dest.resolve():
        shutil.copyfile(source, dest)
    profile_path = gold_profile.write_profile_for_transcript(dest, slug)
    scenario = update_scenario_registry(slug, dest, text)
    if auto:
        extraction = extractor.extract_moments(dest, max_moments=max_moments, use_llm_rubrics=llm_rubrics)
        written = extractor.write_extracted_moments(extraction, overwrite=overwrite_generated)
        update_alignment_config([item["moment"]["id"] for item in extraction["selected_moments"]])
        drafts: list[Path] = []
    else:
        sections = find_stage_sections(text)
        if not sections:
            raise GoldExampleError("No scaffoldable MWF responses found under stage markers")
        drafts = write_drafts(slug, dest, sections)
        written = []
    regenerate_index()
    test_result = None
    if not skip_tests:
        test_result = run_command([sys.executable, "scripts/test_mwf_moment_eval.py"])
        if test_result.returncode != 0:
            raise GoldExampleError(test_result.stderr or test_result.stdout)
    return {
        "transcript": display_path(dest),
        "drafts": [display_path(path) for path in drafts],
        "moments": [display_path(path) for path in written if path.suffix == ".yaml"],
        "judge_prompts": [display_path(path) for path in written if path.suffix == ".md"],
        "gold_profile": display_path(profile_path),
        "scenario": scenario,
        "index": display_path(INDEX_PATH),
        "tests": None if test_result is None else test_result.returncode,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Add a new MWF gold transcript and scaffold draft moments.")
    parser.add_argument("transcript", type=Path)
    parser.add_argument("--auto", action="store_true", help="Auto-extract ready moment yamls and judge prompts instead of .draft scaffolds")
    parser.add_argument("--max-moments", type=int, default=8)
    parser.add_argument(
        "--no-llm-rubrics",
        action="store_true",
        help="Use deterministic rubric generation for --auto instead of Bedrock Haiku",
    )
    parser.add_argument(
        "--overwrite-generated",
        action="store_true",
        help="Allow --auto to replace existing generated moment yamls and judge prompts",
    )
    parser.add_argument("--skip-tests", action="store_true", help="Only for unit tests; normal onboarding runs evaluator tests")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = onboard(
            args.transcript,
            skip_tests=args.skip_tests,
            auto=args.auto,
            max_moments=args.max_moments,
            llm_rubrics=args.auto and not args.no_llm_rubrics,
            overwrite_generated=args.overwrite_generated,
        )
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except GoldExampleError as exc:
        print(f"mwf_add_gold_example: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
