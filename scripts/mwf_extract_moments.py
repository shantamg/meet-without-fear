#!/usr/bin/env python3
"""Extract ready-to-run moment definitions from MWF gold transcripts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mwf_moment_eval as mme  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[1]
MOMENTS_ROOT = REPO_ROOT / "eval/moments"
JUDGE_PROMPTS_ROOT = REPO_ROOT / "eval/scorer/judge-prompts"
TRANSCRIPTS_ROOT = REPO_ROOT / "docs/product/source-material/golden-transcripts"


class ExtractMomentsError(RuntimeError):
    pass


@dataclass
class TranscriptTurn:
    role: str
    speaker: str
    content: str
    start_line: int
    end_line: int
    stage: int | None
    sub_state: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "speaker": self.speaker,
            "content": self.content,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "stage": self.stage,
            "sub_state": self.sub_state,
        }


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "gold-transcript"


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def infer_sub_state(content: str, stage: int | None) -> str:
    lower = content.lower()
    if any(term in lower for term in ["is that close", "is that landing", "does that feel right"]):
        return "fact-reflection" if stage == 1 else "validation"
    if any(term in lower for term in ["feel fully heard", "ready to continue", "move to the next"]):
        return "consent-gate"
    if any(term in lower for term in ["what do you imagine", "underneath", "try to understand"]):
        return "emotional-handling" if stage == 2 else "fact-reflection"
    if "what do you notice" in lower:
        return "mutual-reveal"
    if any(term in lower for term in ["needs", "what matters", "valid"]):
        return "validation" if stage == 3 else "emotional-handling"
    if any(term in lower for term in ["willing", "agreement", "proposal", "overlap"]):
        return "willingness-selection" if stage == 4 else "consent-gate"
    if any(term in lower for term in ["sad", "angry", "fear", "hurt", "grief", "exhaust"]):
        return "emotional-handling"
    return "fact-reflection"


def parse_transcript(path: Path) -> list[TranscriptTurn]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    turns: list[TranscriptTurn] = []
    current_stage: int | None = None
    current: dict[str, Any] | None = None

    def flush(end_line: int) -> None:
        nonlocal current
        if not current:
            return
        content = "\n".join(current["content"]).strip()
        if content:
            speaker = current["speaker"]
            role = "ai" if speaker.lower() in {"mwf", "meet without fear"} else "user"
            turns.append(
                TranscriptTurn(
                    role=role,
                    speaker=speaker,
                    content=content,
                    start_line=current["start_line"],
                    end_line=end_line,
                    stage=current["stage"],
                    sub_state=infer_sub_state(content, current["stage"]),
                )
            )
        current = None

    for line_no, line in enumerate(lines, start=1):
        heading = re.match(r"^##\s*Stage\s+([0-9]+)\b", line, flags=re.IGNORECASE)
        if heading:
            flush(line_no - 1)
            current_stage = int(heading.group(1))
            continue

        speaker = re.match(r"^\*\*([^:*]+):\*\*\s*(.*)$", line)
        if not speaker:
            speaker = re.match(r"^(MWF|Adam|Eve|James|Catherine):\s*(.*)$", line)
        if speaker:
            flush(line_no - 1)
            current = {
                "speaker": speaker.group(1).strip(),
                "content": [speaker.group(2).strip()],
                "start_line": line_no,
                "stage": current_stage,
            }
        elif current_stage is not None and line.strip().startswith('"') and not current:
            quoted = line.strip().strip('"')
            if quoted:
                current = {
                    "speaker": "MWF",
                    "content": [quoted],
                    "start_line": line_no,
                    "stage": current_stage,
                }
        elif current and line.strip():
            current["content"].append(line.strip())
    flush(len(lines))
    return turns


def turn_score(turns: list[TranscriptTurn], index: int) -> int:
    turn = turns[index]
    if turn.role != "ai" or turn.stage not in {1, 2, 3, 4}:
        return -100
    previous = turns[index - 1] if index > 0 else None
    score = 0
    if previous and previous.role == "user":
        score += 3
    content = turn.content.lower()
    keywords = [
        "is that",
        "what do you imagine",
        "underneath",
        "feel fully heard",
        "ready to continue",
        "what do you notice",
        "willing",
        "agreement",
        "needs",
        "valid",
        "share",
    ]
    score += sum(1 for keyword in keywords if keyword in content)
    if len(turn.content) > 120:
        score += 1
    return score


def choose_moments(turns: list[TranscriptTurn], max_moments: int = 8) -> list[int]:
    candidates = [(turn_score(turns, index), index) for index in range(len(turns))]
    candidates = [(score, index) for score, index in candidates if score > 0]
    selected_indexes: set[int] = set()
    by_stage: dict[int | None, list[tuple[int, int]]] = {}
    for score, index in candidates:
        by_stage.setdefault(turns[index].stage, []).append((score, index))
    for stage, values in sorted(by_stage.items(), key=lambda item: (item[0] is None, item[0] or 0)):
        if stage not in {1, 2, 3, 4}:
            continue
        for _score, index in sorted(values, key=lambda item: (-item[0], item[1]))[:2]:
            selected_indexes.add(index)
    by_sub_state: dict[tuple[int | None, str], tuple[int, int]] = {}
    for score, index in candidates:
        turn = turns[index]
        key = (turn.stage, turn.sub_state)
        if key not in by_sub_state or score > by_sub_state[key][0]:
            by_sub_state[key] = (score, index)
    for _score, index in sorted(by_sub_state.values(), key=lambda item: (-item[0], item[1])):
        if len(selected_indexes) >= max_moments:
            break
        selected_indexes.add(index)
    return sorted(selected_indexes)


def protocol_posture(stage: int | None) -> str:
    return {
        1: "Witness the user accurately without advice, needs language, empathy drafting, or repair strategy.",
        2: "Help the user stretch toward the partner perspective without forcing a verdict or grading the attempt.",
        3: "Clarify needs, consent, and mutual reveal without analyzing overlap or rushing strategy.",
        4: "Support willingness and closure without inventing agreement or pressuring either person.",
    }.get(stage, "Stay within the current MWF stage contract and protect consent.")


def hard_invariants_for(stage: int | None, sub_state: str) -> list[dict[str, str]]:
    invariants = [
        {"id": "no_advice_or_solutioning", "description": "Does not advise, solve, prescribe, or propose action steps."},
    ]
    if stage == 1:
        invariants.extend(
            [
                {"id": "no_stage_jump_content", "description": "Does not introduce Stage 2, Stage 3, or Stage 4 work."},
                {"id": "no_grading_of_user", "description": "Does not praise or grade the user's disclosure."},
            ]
        )
    elif stage == 2:
        invariants.extend(
            [
                {"id": "no_forced_verdict", "description": "Does not force a yes/no validation verdict."},
                {"id": "no_premature_needs_language", "description": "Does not start Stage 3 needs extraction early."},
            ]
        )
    elif stage == 3:
        invariants.extend(
            [
                {"id": "no_rushing_to_stage4", "description": "Does not rush into Stage 4 proposals or strategies."},
                {"id": "no_overlap_labeling", "description": "Does not label overlap before the users notice it."},
            ]
        )
    else:
        invariants.extend(
            [
                {"id": "no_invented_shared_agreement", "description": "Does not invent shared agreement without mutual willingness."},
                {"id": "no_blame_or_pressure", "description": "Does not blame or pressure either user into agreement."},
            ]
        )
    return invariants


def deterministic_rubric(stage: int | None, sub_state: str, ai_turn: TranscriptTurn) -> list[dict[str, Any]]:
    return [
        {
            "id": "gold_posture",
            "description": f"Preserves the {sub_state} posture shown in the gold transcript: {ai_turn.content[:180]}",
            "pass_threshold": 4,
            "mock_pass_keywords": [],
        },
        {
            "id": "stage_fidelity",
            "description": protocol_posture(stage),
            "pass_threshold": 4,
            "mock_pass_keywords": [],
        },
        {
            "id": "trigger_responsiveness",
            "description": "Responds to the immediately prior user trigger without adding unsupported content.",
            "pass_threshold": 4,
            "mock_pass_keywords": [],
        },
    ]


def seed_for_turn(transcript_path: Path, turns: list[TranscriptTurn], index: int) -> dict[str, Any]:
    ai_turn = turns[index]
    prior = turns[:index]
    speakers = []
    for turn in turns:
        if turn.role == "user" and turn.speaker not in speakers:
            speakers.append(turn.speaker)
    if len(speakers) < 2:
        speakers = (speakers + ["Partner"])[:2]
    actor = turns[index - 1].speaker if index > 0 and turns[index - 1].role == "user" else speakers[0]
    partner = next((speaker for speaker in speakers if speaker != actor), speakers[-1])
    stage = ai_turn.stage or 1
    return {
        "session": {
            "status": "ACTIVE",
            "stage": stage,
            "tag": f"[mwf-moment-eval] auto-{slugify(transcript_path.stem)}-{ai_turn.start_line}",
        },
        "participants": [
            {
                "role": "invitor",
                "name": actor,
                "compactSigned": True,
                "stageGates": {str(n): {"autoGenerated": True} for n in range(0, stage + 1)},
            },
            {
                "role": "invitee",
                "name": partner,
                "compactSigned": True,
                "stageGates": {str(n): {"autoGenerated": True} for n in range(0, stage + 1)},
            },
        ],
        "history_source": f"{display_path(transcript_path)}:{max(1, ai_turn.start_line - 20)}-{ai_turn.end_line}",
        "prior_history_summary": [
            f"{turn.speaker}: {turn.content[:180]}" for turn in prior[-8:]
        ],
    }


def moment_id_for(transcript_path: Path, turn: TranscriptTurn) -> str:
    couple = slugify(transcript_path.stem)
    stage = turn.stage or 0
    return f"{couple}-stage-{stage}-{turn.sub_state}-{turn.start_line}"


def judge_prompt(moment: dict[str, Any], trigger: TranscriptTurn | None, ai_turn: TranscriptTurn, transcript_excerpt: str) -> str:
    return "\n".join(
        [
            f"# Judge Prompt: {moment['id']}",
            "",
            "Score the AI response against the gold MWF posture for this extracted moment.",
            "",
            f"Protocol posture: {protocol_posture(ai_turn.stage)}",
            "",
            "## Trigger",
            "",
            trigger.content if trigger else "No immediately preceding user trigger was found.",
            "",
            "## Gold AI Turn",
            "",
            ai_turn.content,
            "",
            "## Transcript Evidence",
            "",
            transcript_excerpt,
            "",
            "Return JSON with a `dimensions` object. Each dimension must include `score` from 1 to 5 and `rationale`.",
            "",
        ]
    )


def extract_transcript_excerpt(path: Path, start: int, end: int) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    return "\n".join(lines[max(0, start - 1):end])


def build_moment(transcript_path: Path, turns: list[TranscriptTurn], index: int) -> tuple[dict[str, Any], str]:
    ai_turn = turns[index]
    trigger = turns[index - 1] if index > 0 and turns[index - 1].role == "user" else None
    moment_id = moment_id_for(transcript_path, ai_turn)
    reference_start = trigger.start_line if trigger else ai_turn.start_line
    reference_end = ai_turn.end_line
    prompt_path = JUDGE_PROMPTS_ROOT / f"{moment_id}.md"
    moment = {
        "id": moment_id,
        "stages": [ai_turn.stage or 1],
        "description": f"Auto-extracted {ai_turn.sub_state} moment from {transcript_path.name} lines {reference_start}-{reference_end}.",
        "auto_generated": True,
        "moment_type": f"stage-{ai_turn.stage}-{ai_turn.sub_state}",
        "seed": seed_for_turn(transcript_path, turns, index),
        "trigger": {
            "type": "api_call",
            "endpoint": "POST /sessions/:id/messages/stream",
            "actor": trigger.speaker if trigger else "User",
            "body": {"content": trigger.content if trigger else "Continue."},
        },
        "capture": ["ai_message_text", "new_messages_in_db", "stage_progress_diff", "sse_events"],
        "rubric": {
            "reference_transcript_lines": f"{display_path(transcript_path)}:{reference_start}-{reference_end}",
            "judge_prompt": display_path(prompt_path),
            "dimensions": deterministic_rubric(ai_turn.stage, ai_turn.sub_state, ai_turn),
            "overall_pass_threshold": 4.0,
            "hard_invariants": hard_invariants_for(ai_turn.stage, ai_turn.sub_state),
        },
        "expected_response": ai_turn.content,
        "improver": {"candidate_owners": ["mwf_prompts"], "default_owner": "mwf_prompts"},
    }
    excerpt = extract_transcript_excerpt(transcript_path, reference_start, reference_end)
    return moment, judge_prompt(moment, trigger, ai_turn, excerpt)


def extract_moments(transcript_path: Path, *, max_moments: int = 8) -> dict[str, Any]:
    turns = parse_transcript(transcript_path)
    selected = choose_moments(turns, max_moments=max_moments)
    moments = []
    for index in selected:
        moment, prompt = build_moment(transcript_path, turns, index)
        moments.append({"moment": moment, "judge_prompt": prompt})
    return {
        "transcript": display_path(transcript_path),
        "turns": [turn.to_dict() for turn in turns],
        "selected_moments": moments,
    }


def write_extracted_moments(extraction: dict[str, Any], *, overwrite: bool = False) -> list[Path]:
    MOMENTS_ROOT.mkdir(parents=True, exist_ok=True)
    JUDGE_PROMPTS_ROOT.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for item in extraction["selected_moments"]:
        moment = item["moment"]
        moment_path = MOMENTS_ROOT / f"{moment['id']}.yaml"
        prompt_path = REPO_ROOT / moment["rubric"]["judge_prompt"]
        existing_same = (
            moment_path.exists()
            and prompt_path.exists()
            and moment_path.read_text(encoding="utf-8") == json.dumps(moment, indent=2, sort_keys=True) + "\n"
            and prompt_path.read_text(encoding="utf-8") == item["judge_prompt"]
        )
        if existing_same:
            continue
        if (moment_path.exists() or prompt_path.exists()) and not overwrite:
            raise ExtractMomentsError(f"Refusing to overwrite existing extracted moment: {moment['id']}")
        moment_path.write_text(json.dumps(moment, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        prompt_path.write_text(item["judge_prompt"], encoding="utf-8")
        written.extend([moment_path, prompt_path])
    return written


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract MWF moment yamls from a gold transcript")
    parser.add_argument("transcript", type=Path)
    parser.add_argument("--max-moments", type=int, default=8)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        extraction = extract_moments(args.transcript, max_moments=args.max_moments)
        if args.write:
            written = write_extracted_moments(extraction, overwrite=args.overwrite)
            print(json.dumps({"written": [display_path(path) for path in written]}, indent=2, sort_keys=True))
        else:
            print(json.dumps(extraction, indent=2, sort_keys=True))
        return 0
    except ExtractMomentsError as exc:
        print(f"mwf_extract_moments: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
