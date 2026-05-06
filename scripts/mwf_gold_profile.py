#!/usr/bin/env python3
"""Extract scenario-level gold profiles from MWF golden transcripts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mwf_extract_moments as extractor  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPTS_ROOT = REPO_ROOT / "docs/product/source-material/golden-transcripts"
PROFILES_ROOT = REPO_ROOT / "eval/gold-profiles"

EMOTION_TERMS = {
    "afraid",
    "anger",
    "angry",
    "embarrassed",
    "exhausted",
    "fear",
    "furious",
    "grief",
    "hurt",
    "lonely",
    "love",
    "sad",
    "scared",
    "shame",
    "tired",
}
RESISTANCE_TERMS = {
    "but",
    "can't",
    "done",
    "don't",
    "doesn't",
    "exhausted",
    "fine",
    "no",
    "not",
    "nothing",
    "pissed",
    "sure",
    "won't",
}
COOPERATION_TERMS = {
    "close",
    "ready",
    "share",
    "try",
    "understand",
    "willing",
    "yes",
}
BOUNDARY_TERMS = {
    "abusive",
    "accountability",
    "can't live",
    "done",
    "not negotiating",
    "safety",
    "sure",
    "take care of me",
}


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "gold-scenario"


def short_quote(text: str, limit: int = 220) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3].rstrip() + "..."


def participant_names(turns: list[extractor.TranscriptTurn]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for turn in turns:
        if turn.role != "user":
            continue
        if turn.speaker not in seen:
            names.append(turn.speaker)
            seen.add(turn.speaker)
    return names


def infer_role_shape(turns: list[extractor.TranscriptTurn], participants: list[str]) -> dict[str, Any]:
    fallback = {
        "initiator": participants[0] if participants else None,
        "invited": participants[1] if len(participants) > 1 else None,
        "confidence": "unknown",
        "source": "participant_order",
        "evidence": [],
    }
    if len(participants) != 2:
        return fallback

    stage0_ai = [turn for turn in turns if turn.role == "ai" and turn.stage == 0]
    invited_matches: list[tuple[str, str]] = []
    initiator_matches: list[tuple[str, str]] = []
    for participant in participants:
        name = re.escape(participant)
        invited_patterns = [
            rf"\bmessage\s+for\s+{name}\b",
            rf"\bmessage\s+{name}\s+will\s+receive\b",
            rf"\bso\s+{name}\s+knows\b",
        ]
        initiator_patterns = [rf"\bthank\s+you,\s*{name}\b"]
        for turn in stage0_ai:
            text = f"MWF lines {turn.start_line}-{turn.end_line}: {short_quote(turn.content)}"
            if any(re.search(pattern, turn.content, re.I) for pattern in invited_patterns):
                invited_matches.append((participant, text))
            if any(re.search(pattern, turn.content, re.I) for pattern in initiator_patterns):
                initiator_matches.append((participant, text))

    invited_candidates = {name for name, _ in invited_matches}
    initiator_candidates = {name for name, _ in initiator_matches}
    invited = next(iter(invited_candidates)) if len(invited_candidates) == 1 else None
    initiator = next(iter(initiator_candidates)) if len(initiator_candidates) == 1 else None
    if invited and not initiator:
        initiator = next(participant for participant in participants if participant != invited)
    if initiator and not invited:
        invited = next(participant for participant in participants if participant != initiator)
    if not initiator or not invited or initiator == invited:
        return fallback

    evidence = [text for name, text in initiator_matches + invited_matches if name in {initiator, invited}]
    return {
        "initiator": initiator,
        "invited": invited,
        "confidence": "high" if initiator_candidates and invited_candidates else "medium",
        "source": "stage_0_transcript_mwf_effect",
        "evidence": evidence[:4],
    }


def count_terms(text: str, terms: set[str]) -> int:
    lower = text.lower()
    return sum(lower.count(term) for term in terms)


def evidence_for_terms(turns: list[extractor.TranscriptTurn], terms: set[str], limit: int = 4) -> list[str]:
    evidence: list[str] = []
    for turn in turns:
        lower = turn.content.lower()
        if any(term in lower for term in terms):
            evidence.append(f"{turn.speaker} lines {turn.start_line}-{turn.end_line}: {short_quote(turn.content)}")
        if len(evidence) >= limit:
            break
    return evidence


def level(score: float, *, low: float, high: float) -> str:
    if score >= high:
        return "high"
    if score >= low:
        return "medium"
    return "low"


def infer_scenario_shape(text: str, turns: list[extractor.TranscriptTurn]) -> dict[str, Any]:
    lower = text.lower()
    evidence: list[str] = []
    if any(marker in lower for marker in ["no overlap", "no shared agreement", "selected none"]):
        primary = "no_shared_agreement_or_unresolved_closure"
        terms = {"no overlap", "no shared agreement", "selected none", "done"}
        rationale = "The transcript resolves by preserving non-agreement, individual commitments, or unresolved closure rather than forcing a shared repair."
    elif any(marker in lower for marker in ["shared agreement", "overlap", "willing to try", "agreement document"]):
        primary = "mutual_resolution_or_shared_experiment_path"
        terms = {"shared agreement", "overlap", "willing", "agreement"}
        rationale = "The transcript moves toward shared willingness, overlap, or a mutual experiment path."
    else:
        primary = "open_process_benchmark"
        terms = {"ready", "share", "understand", "needs"}
        rationale = "The transcript does not clearly encode resolution or non-agreement; treat it as an open process benchmark."
    for turn in turns:
        lower_turn = turn.content.lower()
        if any(term in lower_turn for term in terms):
            evidence.append(f"{turn.speaker} lines {turn.start_line}-{turn.end_line}: {short_quote(turn.content)}")
        if len(evidence) >= 5:
            break
    return {"primary": primary, "rationale": rationale, "evidence": evidence}


def profile_participant(name: str, turns: list[extractor.TranscriptTurn]) -> dict[str, Any]:
    own = [turn for turn in turns if turn.speaker == name]
    text = "\n".join(turn.content for turn in own)
    words = max(1, len(re.findall(r"\w+", text)))
    resistance = count_terms(text, RESISTANCE_TERMS)
    emotion = count_terms(text, EMOTION_TERMS)
    cooperation = count_terms(text, COOPERATION_TERMS)
    boundary = count_terms(text, BOUNDARY_TERMS)
    return {
        "display_name": name,
        "voice_and_posture": {
            "average_turn_words": round(words / max(1, len(own)), 1),
            "dominant_posture": level(resistance / words, low=0.025, high=0.045),
            "emotional_explicitness": level(emotion / words, low=0.012, high=0.025),
            "evidence": evidence_for_terms(own, EMOTION_TERMS | RESISTANCE_TERMS, limit=5),
        },
        "resistance_level": {
            "level": level(resistance / words, low=0.025, high=0.045),
            "marker_count": resistance,
            "evidence": evidence_for_terms(own, RESISTANCE_TERMS, limit=5),
        },
        "cooperation_pattern": {
            "level": level(cooperation / words, low=0.012, high=0.028),
            "marker_count": cooperation,
            "evidence": evidence_for_terms(own, COOPERATION_TERMS, limit=4),
        },
        "boundary_and_non_concession_signals": {
            "level": level(boundary / words, low=0.006, high=0.014),
            "marker_count": boundary,
            "evidence": evidence_for_terms(own, BOUNDARY_TERMS, limit=5),
        },
        "actor_risks": [
            "Do not make this participant more agreeable, articulate, emotionally integrated, or repair-oriented than their transcript evidence supports.",
            "Treat consent to continue or share as process consent, not proof of emotional agreement.",
        ],
    }


def stage_profiles(turns: list[extractor.TranscriptTurn]) -> dict[str, Any]:
    stages: dict[str, Any] = {}
    for stage in sorted({turn.stage for turn in turns if turn.stage is not None}):
        stage_turns = [turn for turn in turns if turn.stage == stage]
        user_turns = [turn for turn in stage_turns if turn.role == "user"]
        ai_turns = [turn for turn in stage_turns if turn.role == "ai"]
        user_text = "\n".join(turn.content for turn in user_turns)
        ai_text = "\n".join(turn.content for turn in ai_turns)
        stages[f"stage_{stage}"] = {
            "user_pressure": {
                "resistance_level": level(count_terms(user_text, RESISTANCE_TERMS) / max(1, len(re.findall(r"\w+", user_text))), low=0.025, high=0.045),
                "boundary_level": level(count_terms(user_text, BOUNDARY_TERMS) / max(1, len(re.findall(r"\w+", user_text))), low=0.006, high=0.014),
                "evidence": evidence_for_terms(user_turns, RESISTANCE_TERMS | BOUNDARY_TERMS, limit=4),
            },
            "mwf_effect_to_preserve": evidence_for_terms(ai_turns, {"heard", "share", "ready", "understand", "agreement", "listening", "matter"}, limit=4),
        }
    return stages


def build_profile(transcript: Path, scenario_id: str | None = None) -> dict[str, Any]:
    text = transcript.read_text(encoding="utf-8")
    turns = extractor.parse_transcript(transcript)
    scenario = scenario_id or slugify(transcript.stem)
    participants = participant_names(turns)
    participant_profiles = {slugify(name): profile_participant(name, turns) for name in participants}
    shape = infer_scenario_shape(text, turns)
    return {
        "schema_version": 1,
        "scenario_id": scenario,
        "source_transcript": display_path(transcript),
        "generated_by": "scripts/mwf_gold_profile.py",
        "participants": participants,
        "role_shape": infer_role_shape(turns, participants),
        "scenario_shape": shape,
        "participant_profiles": participant_profiles,
        "stage_profiles": stage_profiles(turns),
        "scorer_priorities": [
            "Judge the live run against the behavioral range and process shape extracted here, not exact transcript wording.",
            "Penalize actor drift when a participant becomes easier, smoother, more emotionally aware, or more repair-oriented than this profile supports.",
            "Penalize MWF handling when it rushes past resistance, treats process consent as agreement, or forces an outcome inconsistent with the scenario shape.",
        ],
    }


def write_profile_for_transcript(transcript: Path, scenario_id: str | None = None) -> Path:
    scenario = scenario_id or slugify(transcript.stem)
    profile = build_profile(transcript, scenario)
    PROFILES_ROOT.mkdir(parents=True, exist_ok=True)
    dest = PROFILES_ROOT / f"{scenario}.json"
    dest.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return dest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract a gold scenario profile from a transcript.")
    parser.add_argument("transcript", type=Path)
    parser.add_argument("--scenario-id")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    path = args.transcript
    if not path.is_absolute():
        candidate = TRANSCRIPTS_ROOT / path
        path = candidate if candidate.exists() else REPO_ROOT / path
    dest = write_profile_for_transcript(path.resolve(), args.scenario_id)
    print(json.dumps({"profile": display_path(dest)}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
