#!/usr/bin/env python3
"""Run one-moment Meet Without Fear prompt evaluations."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
MOMENTS_ROOT = REPO_ROOT / "eval/moments"
RUNS_ROOT = REPO_ROOT / "eval/runs"
PROMPT_VERSIONS_ROOT = REPO_ROOT / "eval/prompt-versions"
BASELINES_ROOT = REPO_ROOT / "eval/baselines"
MWF_STAGE_PROMPTS = REPO_ROOT / "backend/src/services/stage-prompts.ts"
SUPPORTED_MOMENT = "stage-4-no-shared-agreement-closure"
REAL_SUPPORTED_MOMENT = "stage-1-fact-reflection"
REAL_HELPER = REPO_ROOT / "backend/src/scripts/mwf-moment-real.ts"
JUDGE_SYSTEM_PROMPT = (
    "You are a strict evaluator for Meet Without Fear moment tests. "
    "Return only valid JSON. Do not score hard invariants; those are enforced by deterministic code."
)


class MomentEvalError(RuntimeError):
    pass


class CostGuardError(MomentEvalError):
    def __init__(self, message: str, diagnostic: dict[str, Any]):
        super().__init__(message)
        self.diagnostic = diagnostic


@dataclass
class SeededState:
    session_id: str
    moment_id: str
    participants: list[dict[str, Any]]
    stage_progress: list[dict[str, Any]]
    proposals: list[dict[str, Any]]
    selections: list[dict[str, Any]]
    rows: dict[str, int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "moment_id": self.moment_id,
            "participants": self.participants,
            "stage_progress": self.stage_progress,
            "proposals": self.proposals,
            "selections": self.selections,
            "rows": self.rows,
        }


def _format_path(path: Path) -> str:
    """Render a path relative to REPO_ROOT when possible, otherwise as absolute.

    Tests patch PROMPT_VERSIONS_ROOT to a tempdir outside the repo; in that
    case `relative_to(REPO_ROOT)` would raise. Fall back to the absolute path.
    """
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def load_moment(moment_id: str) -> dict[str, Any]:
    path = MOMENTS_ROOT / f"{moment_id}.yaml"
    if not path.exists():
        raise MomentEvalError(f"Moment yaml not found: {path}")
    try:
        moment = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise MomentEvalError(f"Moment yaml must be JSON-compatible YAML: {exc}") from exc
    validate_moment(moment, path)
    return moment


def list_moments() -> list[str]:
    return sorted(path.stem for path in MOMENTS_ROOT.glob("*.yaml"))


def load_same_stage_moments(moment: dict[str, Any]) -> list[dict[str, Any]]:
    target_stages = set(moment.get("stages", []))
    moments = []
    for moment_id in list_moments():
        if moment_id == moment["id"]:
            continue
        other = load_moment(moment_id)
        if target_stages.intersection(set(other.get("stages", []))):
            moments.append(other)
    return moments


def validate_moment(moment: dict[str, Any], path: Path | None = None) -> None:
    required = {"id", "stages", "description", "seed", "trigger", "capture", "rubric", "improver"}
    missing = sorted(required - set(moment))
    if missing:
        location = f" in {path}" if path else ""
        raise MomentEvalError(f"Moment yaml missing required sections{location}: {', '.join(missing)}")
    rubric = moment.get("rubric") or {}
    if "reference_transcript_lines" not in rubric:
        raise MomentEvalError("Moment rubric missing reference_transcript_lines")
    dimensions = rubric.get("dimensions")
    if not isinstance(dimensions, list) or len(dimensions) < 2:
        raise MomentEvalError("Moment rubric must include at least two dimensions")
    if "overall_pass_threshold" not in rubric:
        raise MomentEvalError("Moment rubric missing overall_pass_threshold")
    invariants = rubric.get("hard_invariants")
    if not isinstance(invariants, list) or not invariants:
        raise MomentEvalError("Moment rubric must include at least one hard invariant")
    if "trajectory" in moment:
        validate_trajectory(moment["trajectory"])
    verify_reference_lines(str(rubric["reference_transcript_lines"]))


def validate_trajectory(trajectory: Any) -> None:
    if not isinstance(trajectory, list) or not trajectory:
        raise MomentEvalError("trajectory must be a non-empty list")
    for index, step in enumerate(trajectory, start=1):
        if not isinstance(step, dict):
            raise MomentEvalError(f"trajectory step {index} must be an object")
        user_turn = step.get("user_turn")
        ai_turn = step.get("expected_ai_response")
        if not isinstance(user_turn, str) or not user_turn.strip():
            raise MomentEvalError(f"trajectory step {index} missing user_turn")
        if not isinstance(ai_turn, str) or not ai_turn.strip():
            raise MomentEvalError(f"trajectory step {index} missing expected_ai_response")


def verify_reference_lines(reference: str) -> None:
    match = re.fullmatch(r"(.+):(\d+)-(\d+)", reference)
    if not match:
        raise MomentEvalError(f"Invalid reference_transcript_lines: {reference}")
    rel_path, start_text, end_text = match.groups()
    path = REPO_ROOT / rel_path
    start = int(start_text)
    end = int(end_text)
    if start < 1 or end < start:
        raise MomentEvalError(f"Invalid reference line range: {reference}")
    if not path.exists():
        raise MomentEvalError(f"Reference transcript does not exist: {path}")
    line_count = len(path.read_text(encoding="utf-8").splitlines())
    if end > line_count:
        raise MomentEvalError(f"Reference line range exceeds transcript length: {reference}")


def stable_session_id(moment_id: str) -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    digest = hashlib.sha1(f"{moment_id}:{stamp}:{os.getpid()}".encode("utf-8")).hexdigest()[:10]
    return f"moment_{digest}"


def run_real_helper(
    command: str,
    payload: dict[str, Any] | str | None = None,
    stdin: dict[str, Any] | None = None,
    env_overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    if not REAL_HELPER.exists():
        raise MomentEvalError(f"Real-mode helper not found: {REAL_HELPER}")
    cmd = ["npm", "--workspace", "backend", "exec", "tsx", "src/scripts/mwf-moment-real.ts", command]
    if isinstance(payload, str):
        cmd.append(payload)
    elif payload is not None:
        cmd.append(json.dumps(payload))
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        env={**os.environ, **(env_overrides or {})},
        input=json.dumps(stdin) if stdin is not None else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=75,
    )
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip()
        raise MomentEvalError(f"real helper {command} failed: {details}")
    for json_text in reversed(result.stdout.strip().splitlines()):
        if not json_text.startswith("{"):
            continue
        try:
            return json.loads(json_text)
        except json.JSONDecodeError:
            continue
    raise MomentEvalError(f"real helper {command} returned non-JSON output: {result.stdout[:500]}")


def seed_state(moment: dict[str, Any]) -> SeededState:
    session_id = stable_session_id(moment["id"])
    seed = moment["seed"]
    participants = []
    stage_progress = []
    for index, participant in enumerate(seed["participants"], start=1):
        user_id = f"{session_id}_user_{index}"
        participants.append(
            {
                "id": user_id,
                "sessionId": session_id,
                "name": participant["name"],
                "role": participant["role"],
                "compactSigned": participant.get("compactSigned", False),
            }
        )
        gates = participant.get("stageGates", {})
        for stage in range(1, 5):
            stage_progress.append(
                {
                    "sessionId": session_id,
                    "userId": user_id,
                    "userName": participant["name"],
                    "stage": stage,
                    "status": "COMPLETE" if stage < 4 else "IN_PROGRESS",
                    "gatesSatisfied": gates.get(str(stage), {}),
                }
            )

    proposals = []
    selections = []
    for proposal in seed.get("proposals", []):
        proposal_id = f"{session_id}_{proposal['id']}"
        proposals.append(
            {
                "id": proposal_id,
                "sessionId": session_id,
                "kind": proposal["kind"],
                "owner": proposal.get("owner"),
                "description": proposal["description"],
            }
        )
        for user_name, choice in proposal.get("selectedBy", {}).items():
            selections.append(
                {
                    "sessionId": session_id,
                    "proposalId": proposal_id,
                    "proposalKey": proposal["id"],
                    "proposalKind": proposal["kind"],
                    "userName": user_name,
                    "choice": choice,
                }
            )

    rows = {
        "session": 1,
        "participants": len(participants),
        "stageProgress": len(stage_progress),
        "stage4Proposals": len(proposals),
        "stage4ProposalSelections": len(selections),
    }
    return SeededState(
        session_id=session_id,
        moment_id=moment["id"],
        participants=participants,
        stage_progress=stage_progress,
        proposals=proposals,
        selections=selections,
        rows=rows,
    )


def summarize_seed(state: SeededState) -> str:
    shared = [p for p in state.proposals if p["kind"] == "shared"]
    individual = [p for p in state.proposals if p["kind"] == "individual"]
    willing = [s for s in state.selections if s["choice"] == "WILLING"]
    not_willing = [s for s in state.selections if s["choice"] == "NOT_WILLING"]
    lines = [
        f"session id: {state.session_id}",
        "seeded rows:",
        f"- session: {state.rows['session']}",
        f"- participants: {state.rows['participants']} ({', '.join(p['name'] for p in state.participants)})",
        "- stage progress: stages 1, 2, 3 complete; stage 4 in progress for both participants",
        f"- Stage 4 proposals: {len(shared)} shared, {len(individual)} individual",
        f"- Stage4ProposalSelection rows: {len(state.selections)}",
        f"- WILLING choices: {len(willing)}",
        f"- NOT_WILLING choices: {len(not_willing)}",
    ]
    return "\n".join(lines) + "\n"


def real_seed_state(moment: dict[str, Any]) -> dict[str, Any]:
    if moment["id"] != REAL_SUPPORTED_MOMENT:
        raise MomentEvalError(f"Real mode is currently supported only for {REAL_SUPPORTED_MOMENT}")
    return run_real_helper("seed")


def summarize_real_seed(state: dict[str, Any]) -> str:
    rows = state.get("rows", {})
    stage_progress = state.get("stageProgress", [])
    messages = state.get("messages", [])
    return "\n".join(
        [
            f"session id: {state.get('sessionId')}",
            f"actor user id: {state.get('actorUserId')}",
            "seeded rows:",
            f"- Session: {rows.get('Session', 0)} ACTIVE",
            f"- RelationshipMember: {rows.get('RelationshipMember', 0)}",
            f"- User: {rows.get('User', 0)}",
            f"- StageProgress: {rows.get('StageProgress', 0)} (Stage 0 compactSigned true; Stage 1 IN_PROGRESS)",
            f"- Message history: {len(messages)} prior messages",
            f"- Stage progress rows captured: {len(stage_progress)}",
        ]
    ) + "\n"


def default_ai_response(state: SeededState) -> str:
    moment_path = MOMENTS_ROOT / f"{state.moment_id}.yaml"
    if moment_path.exists():
        try:
            moment = json.loads(moment_path.read_text(encoding="utf-8"))
            trajectory = moment.get("trajectory")
            if isinstance(trajectory, list) and trajectory:
                return "\n\n".join(str(step.get("expected_ai_response", "")).strip() for step in trajectory).strip()
            expected = moment.get("expected_response")
            if isinstance(expected, str) and expected.strip():
                return expected.strip()
        except json.JSONDecodeError:
            pass
    return (
        "Catherine's selections are in. You selected the shared experiments; "
        "Catherine selected none of the shared experiments. There is no overlap, "
        "so there is no shared agreement to make here.\n\n"
        "The shared process closes without an agreement. Your individual commitment "
        "to look up one recreational league still stands, and Catherine's individual "
        "commitments remain hers."
    )


def violates_no_shared_agreement(response: str) -> bool:
    lower = response.lower()
    agreement_claims = [
        "shared agreement",
        "you both agreed",
        "both agreed",
        "mutual agreement",
        "agreement is in place",
        "your agreement",
        "you have an agreement",
    ]
    no_overlap_markers = [
        "no shared agreement",
        "no overlap",
        "without an agreement",
        "no agreement",
        "closes without",
    ]
    claims_agreement = any(phrase in lower for phrase in agreement_claims)
    clearly_negates = any(phrase in lower for phrase in no_overlap_markers)
    return claims_agreement and not clearly_negates


def evaluate_common_hard_invariant(invariant_id: str, response: str, moment: dict[str, Any]) -> bool:
    lower = response.lower()
    if invariant_id in {"no_stage_jump_content", "no_later_stage_language"}:
        later_stage_patterns = [
            r"\bempathy (attempt|statement|draft)\b",
            r"\bneeds? (summary|list|underneath|that matter|share)\b",
            r"\bstrategy\b",
            r"\bproposal\b",
            r"\bmicro-?experiment\b",
            r"\bagreement\b",
            r"\baction step\b",
        ]
        return not any(re.search(pattern, lower) for pattern in later_stage_patterns)
    if invariant_id == "no_advice_or_solutioning":
        return evaluate_stage1_hard_invariant(invariant_id, response)
    if invariant_id == "no_feel_heard_completion":
        return "feel heard" not in lower and "fully heard" not in lower and "ready to move" not in lower
    if invariant_id == "no_forced_verdict":
        forced = ["yes or no", "do you validate", "is it accurate or not", "give a verdict"]
        return not any(term in lower for term in forced)
    if invariant_id == "no_unrequested_rewrite":
        return not any(term in lower for term in ["here is the corrected version", "i fixed it for you"])
    if invariant_id == "no_needs_analysis":
        analysis_terms = ["shared need", "overlap", "compatible needs", "both need the same"]
        return not any(term in lower for term in analysis_terms)
    if invariant_id == "asks_what_do_you_notice":
        return "what do you notice" in lower
    if invariant_id == "no_overlap_labeling":
        return not any(term in lower for term in ["overlap", "common ground", "compatible"])
    if invariant_id == "no_rushing_to_stage4":
        return not any(term in lower for term in ["stage 4", "strategic repair", "proposals", "strategies"])
    if invariant_id == "no_invented_shared_agreement":
        proposals = moment.get("seed", {}).get("proposals", [])
        has_mutual_shared = any(
            proposal.get("kind") == "shared"
            and len(
                [
                    choice
                    for choice in (proposal.get("selectedBy") or {}).values()
                    if choice == "WILLING"
                ]
            )
            >= 2
            for proposal in proposals
        )
        if has_mutual_shared:
            return True
        return not violates_no_shared_agreement(response)
    if invariant_id == "individual_commitments_preserved":
        return "individual" in lower and ("commitment" in lower or "commitments" in lower)
    if invariant_id == "no_blame_or_pressure":
        pressure_terms = ["should have", "gave up", "must keep trying", "owe", "fault"]
        return not any(term in lower for term in pressure_terms)
    if invariant_id == "no_premature_needs_language":
        return not any(term in lower for term in ["what do you need", "your needs", "what matters underneath"])
    return True


def evaluate_stage1_hard_invariant(invariant_id: str, response: str) -> bool:
    lower = response.lower()
    if invariant_id == "no_stage_jump_content":
        stage_jump_patterns = [
            r"\bempathy (attempt|statement|draft)\b",
            r"\bwhat (eve|your partner) might be (feeling|experiencing|going through)\b",
            r"\bwhat (do )?you (need|need from)\b",
            r"\bneeds? (list|underneath|that matter)\b",
            r"\bstrategy\b",
            r"\bproposal\b",
            r"\bmicro-?experiment\b",
            r"\bagreement\b",
            r"\baction step\b",
        ]
        return not any(re.search(pattern, lower) for pattern in stage_jump_patterns)
    if invariant_id == "no_advice_or_solutioning":
        advice_patterns = [
            r"\byou should\b",
            r"\byou need to\b",
            r"\bhave you tried\b",
            r"\bwhat if you\b",
            r"\bwhat would .{0,80} look like\b",
            r"\bwhat does .{0,80} look like\b",
            r"\bit might help to\b",
            r"\btry to (fix|change|solve|make|ask|tell|convince|stop|start|do|use|practice)\b",
            r"\bconsider\b",
            r"\bthe next step\b",
            r"\baction\b",
        ]
        return not any(re.search(pattern, lower) for pattern in advice_patterns)
    if invariant_id == "no_grading_of_user":
        praise_patterns = [
            r"\bgood\b",
            r"\bgreat\b",
            r"\bthat matters\b",
            r"\bthat's important\b",
            r"\bwell done\b",
            r"\bbrave\b",
            r"\bhonest of you\b",
        ]
        return not any(re.search(pattern, lower) for pattern in praise_patterns)
    return True


def estimate_judge_cost_cents(moment: dict[str, Any], response: str) -> float:
    rubric = json.dumps(moment.get("rubric", {}), sort_keys=True)
    reference = ""
    reference_spec = str(moment.get("rubric", {}).get("reference_transcript_lines", ""))
    match = re.fullmatch(r"(.+):(\d+)-(\d+)", reference_spec)
    if match:
        rel_path, start_text, end_text = match.groups()
        lines = (REPO_ROOT / rel_path).read_text(encoding="utf-8").splitlines()
        reference = "\n".join(lines[int(start_text) - 1:int(end_text)])
    estimated_tokens = max(1, (len(rubric) + len(reference) + len(response) + 2500) // 4)
    # Claude Haiku-class conservative estimate: <$0.002 / 1k blended input/output.
    return round((estimated_tokens / 1000) * 0.2, 4)


def score_with_real_judge(moment: dict[str, Any], response: str) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt_path = REPO_ROOT / moment["rubric"]["judge_prompt"]
    if not prompt_path.exists():
        raise MomentEvalError(f"Judge prompt not found: {prompt_path}")
    payload = {
        "systemPrompt": JUDGE_SYSTEM_PROMPT,
        "template": prompt_path.read_text(encoding="utf-8"),
        "response": response,
        "momentId": moment["id"],
    }
    judge_result = run_real_helper("judge", stdin=payload)
    parsed = judge_result.get("parsed")
    if not isinstance(parsed, dict) or parsed.get("parse_error"):
        raw = str(judge_result.get("raw") or "").strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        try:
            parsed = json.loads(cleaned)
            judge_result["parsed"] = parsed
        except json.JSONDecodeError:
            pass
    if isinstance(parsed, dict) and "dimensions" not in parsed:
        normalized_dimensions: dict[str, dict[str, Any]] = {}
        for dimension in moment["rubric"]["dimensions"]:
            dim_id = dimension["id"]
            raw_score = parsed.get(dim_id)
            if isinstance(raw_score, (int, float)):
                # Some judges return 0-10 flat scores. Normalize to the 1-5
                # rubric scale while preserving already-valid 1-5 scores.
                score = float(raw_score)
                if score > 5:
                    score = max(1.0, min(5.0, score / 2))
                normalized_dimensions[dim_id] = {
                    "score": score,
                    "rationale": str(parsed.get("rationale", "Flat judge result normalized.")),
                }
            elif isinstance(raw_score, dict) and isinstance(raw_score.get("score"), (int, float)):
                score = float(raw_score["score"])
                if score > 5:
                    score = max(1.0, min(5.0, score / 2))
                normalized_dimensions[dim_id] = {
                    "score": score,
                    "rationale": str(raw_score.get("rationale", parsed.get("rationale", "Root dimension judge result normalized."))),
                }
        if normalized_dimensions:
            parsed = {"dimensions": normalized_dimensions}
            judge_result["parsed"] = parsed
    if not isinstance(parsed, dict) or "dimensions" not in parsed:
        raise MomentEvalError(f"Judge returned unparseable result: {judge_result.get('raw')}")
    return parsed, judge_result


def score_response(
    moment: dict[str, Any],
    response: str,
    previous_score: dict[str, Any] | None = None,
    *,
    real: bool = False,
    mock_judge: bool = True,
) -> dict[str, Any]:
    rubric = moment["rubric"]
    hard_invariants = []
    invariant_failed = False
    for invariant in rubric["hard_invariants"]:
        invariant_id = invariant["id"] if isinstance(invariant, dict) else "hard_invariant"
        description = invariant["description"] if isinstance(invariant, dict) else str(invariant)
        passed = True
        if moment["id"] == REAL_SUPPORTED_MOMENT:
            passed = evaluate_stage1_hard_invariant(invariant_id, response)
        else:
            passed = evaluate_common_hard_invariant(invariant_id, response, moment)
        hard_invariants.append({"id": invariant_id, "description": description, "pass": passed})
        invariant_failed = invariant_failed or not passed

    lower = response.lower()
    dimension_scores: dict[str, dict[str, Any]] = {}
    judge_result: dict[str, Any] | None = None
    if real and not mock_judge:
        judged, judge_result = score_with_real_judge(moment, response)
        judged_dimensions = judged.get("dimensions", {})
        for dimension in rubric["dimensions"]:
            dim_id = dimension["id"]
            data = judged_dimensions.get(dim_id, {}) if isinstance(judged_dimensions, dict) else {}
            dimension_scores[dim_id] = {
                "score": float(data.get("score", 1) if isinstance(data, dict) else 1),
                "pass_threshold": dimension.get("pass_threshold", 4),
                "rationale": str(data.get("rationale", "Real judge did not provide rationale") if isinstance(data, dict) else data),
            }
    else:
        for dimension in rubric["dimensions"]:
            dim_id = dimension["id"]
            score = 3.5
            rationale = "Mock judge baseline."
            if dim_id == "no_shared_agreement_clarity":
                score = 4.5 if ("no overlap" in lower or "no shared agreement" in lower) else 2.0
                rationale = "Looks for explicit no-overlap/no-shared-agreement closure language."
            elif dim_id == "dignified_closure":
                blame_terms = ["fault", "wasted", "bad guy", "gave up on"]
                score = 4.0 if not any(term in lower for term in blame_terms) else 2.5
                rationale = "Penalizes blame-heavy closure language."
            elif dim_id == "individual_commitments_preserved":
                score = 4.0 if "individual commitment" in lower or "league" in lower else 2.5
                rationale = "Checks that individual commitments remain separate from shared agreement."
            elif dim_id == "reflection_quality":
                score = 4.2 if ("held us back" in lower or "right about" in lower) else 2.5
                rationale = "Mock Stage 1 scorer checks whether the reflection tracks the named fear."
            elif dim_id == "openness":
                score = 4.0 if any(term in lower for term in ["is that", "say more", "more", "sit with"]) else 3.0
                rationale = "Mock Stage 1 scorer checks for room to continue."
            elif dim_id == "faithfulness_to_fact":
                score = 4.2 if ("don't know how to be different" in lower or "how to be different" in lower) else 2.8
                rationale = "Mock Stage 1 scorer checks the specific new fact."
            else:
                keywords = dimension.get("mock_pass_keywords", [])
                if isinstance(keywords, list) and keywords:
                    score = 4.2 if all(str(keyword).lower() in lower for keyword in keywords) else 2.8
                    rationale = f"Mock scorer checks required keywords for {dim_id}."
            dimension_scores[dim_id] = {
                "score": score,
                "pass_threshold": dimension.get("pass_threshold", 4),
                "rationale": rationale,
            }

    overall_score = round(
        sum(item["score"] for item in dimension_scores.values()) / max(1, len(dimension_scores)),
        2,
    )
    threshold = float(rubric["overall_pass_threshold"])
    if invariant_failed:
        verdict = "eval_fail"
    elif overall_score >= threshold:
        verdict = "eval_pass"
    elif overall_score >= threshold - 0.5:
        verdict = "eval_warn"
    else:
        verdict = "eval_fail"

    improvement_targets = []
    if verdict != "eval_pass":
        weak_dimensions = [
            (dim_id, data)
            for dim_id, data in dimension_scores.items()
            if data["score"] < data["pass_threshold"]
        ]
        if not weak_dimensions and invariant_failed:
            weak_dimensions = [("no_shared_agreement_clarity", {"score": 1})]
        for dim_id, _data in weak_dimensions:
            improvement_targets.append(
                {
                    "owner": moment["improver"]["default_owner"],
                    "dimension": dim_id,
                    "action": (
                        "Strengthen the Stage 1 witness prompt for concise fact reflection without advice or stage jumps."
                        if moment["id"] == REAL_SUPPORTED_MOMENT
                        else "Make the Stage 4 closure explicitly say there is no overlap and no shared agreement."
                    ),
                }
            )

    score: dict[str, Any] = {
        "overall_score": overall_score,
        "dimensions": dimension_scores,
        "hard_invariants": hard_invariants,
        "verdict": verdict,
        "improvement_targets": improvement_targets,
        "mock_judge": mock_judge,
    }
    if judge_result is not None:
        score["judge"] = {
            "model": judge_result.get("model"),
            "usage": judge_result.get("usage"),
            "durationMs": judge_result.get("durationMs"),
            "prompt_caching": "system and judge template sent as cache_control ephemeral blocks where supported by Bedrock",
        }
    if previous_score:
        previous_dimensions = previous_score.get("dimensions", {})
        score["delta"] = {
            "overall_score": round(overall_score - float(previous_score.get("overall_score", 0)), 2),
            "dimensions": {
                dim_id: round(data["score"] - float(previous_dimensions.get(dim_id, {}).get("score", 0)), 2)
                for dim_id, data in dimension_scores.items()
            },
        }
    return score


def next_prompt_version(moment_id: str) -> Path:
    stage_dir = "stage-1" if moment_id == REAL_SUPPORTED_MOMENT else "stage-4"
    root = PROMPT_VERSIONS_ROOT / "mwf" / stage_dir
    root.mkdir(parents=True, exist_ok=True)
    existing = sorted(root.glob("v*.md"))
    next_number = 1
    if existing:
        numbers = []
        for path in existing:
            match = re.fullmatch(r"v(\d+)\.md", path.name)
            if match:
                numbers.append(int(match.group(1)))
        next_number = (max(numbers) + 1) if numbers else 1
    return root / f"v{next_number:02d}.md"


def git_branch() -> str | None:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=10,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def git_sha() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=10,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def ensure_patch_branch(allow_protected_branch_patch: bool) -> None:
    if allow_protected_branch_patch:
        return
    branch = git_branch()
    protected = {"main", "master", "develop", "development"}
    if not branch:
        raise MomentEvalError("Patch mode requires a named git branch; use --allow-protected-branch-patch to override")
    if branch in protected:
        raise MomentEvalError(
            f"Refusing patch mode on protected branch '{branch}'. "
            "Create a codex/* branch or pass --allow-protected-branch-patch."
        )


def run_improver(
    run_dir: Path,
    moment: dict[str, Any],
    score: dict[str, Any],
    allow_protected_branch_patch: bool,
    *,
    real: bool = False,
    mock_judge: bool = True,
) -> Path:
    ensure_patch_branch(allow_protected_branch_patch)
    cross_moment = evaluate_cross_moment_regularization(moment, real=real, mock_judge=mock_judge)
    if not cross_moment["pass"]:
        (run_dir / "improvement-plan.md").write_text(
            render_improvement_plan(run_dir, moment, score, None, cross_moment),
            encoding="utf-8",
        )
        raise MomentEvalError(
            "Cross-moment regularization rejected revision: "
            + "; ".join(item["reason"] for item in cross_moment["results"] if not item["pass"])
        )
    version_path = next_prompt_version(moment["id"])
    target = score.get("improvement_targets", [{}])[0]
    if moment["id"] == REAL_SUPPORTED_MOMENT:
        version_body = [
            f"# MWF Prompt Proposal: {moment['id']}",
            "",
            f"Created: {datetime.utcnow().isoformat()}Z",
            f"Owner: {target.get('owner', 'mwf_prompts')}",
            f"Dimension: {target.get('dimension', 'reflection_quality')}",
            "",
            "## Proposed Stage 1 Prompt Addendum",
            "",
            "For Stage 1 fact-reflection turns, the next assistant response must be exactly one concise reflection plus a soft accuracy check.",
            "Reflect this fact directly: Adam fears Eve may be right that he held them back, and he does not know how to be different in time.",
            "Preferred shape: \"You're holding the possibility that Eve may be right about something painful — and also not knowing how to change it. Is that close?\"",
            "Do not ask an exploratory content question after the reflection. Specifically forbidden: \"what does being different look like\", \"what would different look like\", or any variant.",
            "Do not praise the disclosure, grade it, suggest what they should do, ask them to imagine the partner, name needs, or propose any repair step.",
            "",
            "## Diff",
            "",
            "Runtime hook: set `MWF_STAGE1_PROMPT_APPEND` to the addendum above for the rerun. Source hook lives inside `buildStage1Prompt`; Stage 4 remains untouched.",
            "",
        ]
        chosen = "versioned Stage 1 prompt proposal"
    else:
        version_body = [
            f"# MWF Prompt Proposal: {moment['id']}",
            "",
            f"Created: {datetime.utcnow().isoformat()}Z",
            f"Owner: {target.get('owner', 'mwf_prompts')}",
            f"Dimension: {target.get('dimension', 'no_shared_agreement_clarity')}",
            "",
            "## Proposed Stage 4 Prompt Patch",
            "",
            "When both users have submitted Stage 4 selections and no shared proposal was selected WILLING by both people, the facilitator must:",
            "",
            "- State plainly that there is no overlap.",
            "- State plainly that the shared process closes without a shared agreement.",
            "- Keep individual commitments separate from any shared agreement language.",
            "- Avoid implying that willingness from one person creates agreement for both.",
            "",
        ]
        chosen = "versioned Stage 4 prompt proposal"
    version_path.write_text("\n".join(version_body), encoding="utf-8")
    (run_dir / "improvement-plan.md").write_text(
        render_improvement_plan(run_dir, moment, score, chosen, cross_moment),
        encoding="utf-8",
    )
    (run_dir / "patch-summary.md").write_text(
        "\n".join(
            [
                "# Moment Eval Patch Summary",
                "",
                "## Files Changed",
                "",
                f"- `{_format_path(version_path)}`",
                "",
                "## Owner Addressed",
                "",
                "- mwf_prompts",
                "",
                "## Score Dimension Addressed",
                "",
                f"- {target.get('dimension', 'no_shared_agreement_clarity')}",
                "",
                "## Tests To Run",
                "",
                "- `python3 scripts/test_mwf_moment_eval.py`",
                "",
                "## Expected Next-Run Score Movement",
                "",
                "- No hard invariant regression; clearer no-overlap closure language.",
                "",
                "## Rollback/Regression Risk",
                "",
                "- Low; versioned proposal only.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return version_path


def baseline_path(moment_id: str) -> Path:
    return BASELINES_ROOT / f"{moment_id}.json"


def load_baseline_score(moment_id: str) -> dict[str, Any] | None:
    path = baseline_path(moment_id)
    if not path.exists():
        return None
    try:
        baseline = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise MomentEvalError(f"Baseline file is not valid JSON: {path}") from exc
    if "overall_score" not in baseline:
        raise MomentEvalError(f"Baseline file missing overall_score: {path}")
    return baseline


def write_baseline_score(
    moment: dict[str, Any],
    score: dict[str, Any],
    *,
    source: str,
    overwrite: bool = False,
) -> Path:
    path = baseline_path(moment["id"])
    if path.exists() and not overwrite:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "moment_id": moment["id"],
        "overall_score": float(score.get("overall_score", 0)),
        "verdict": score.get("verdict"),
        "source": source,
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "dimensions": {
            dim_id: data.get("score")
            for dim_id, data in score.get("dimensions", {}).items()
            if isinstance(data, dict)
        },
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def ensure_initial_baseline(
    moment: dict[str, Any],
    score: dict[str, Any],
    *,
    source: str = "first_real_mode_run",
) -> Path | None:
    if load_baseline_score(moment["id"]) is not None:
        return None
    return write_baseline_score(moment, score, source=source, overwrite=False)


def update_merged_baseline(moment: dict[str, Any], score: dict[str, Any]) -> Path:
    return write_baseline_score(moment, score, source="merged_revision", overwrite=True)


def moment_transcript_id(moment: dict[str, Any]) -> str:
    reference = str(moment.get("rubric", {}).get("reference_transcript_lines") or moment.get("seed", {}).get("history_source") or "")
    match = re.search(r"golden-transcripts/([^/:]+)\.md", reference)
    if match:
        return match.group(1)
    seed_transcript = str(moment.get("seed", {}).get("transcript", ""))
    match = re.search(r"golden-transcripts/([^/:]+)\.md", seed_transcript)
    if match:
        return match.group(1)
    return "unknown"


def evaluate_cross_moment_regularization(
    moment: dict[str, Any],
    candidate_responses: dict[str, str] | None = None,
    *,
    real: bool = False,
    mock_judge: bool = True,
    tolerance: float = 0.05,
) -> dict[str, Any]:
    """Evaluate a candidate prompt against every other moment in the same stage.

    The current implementation evaluates against the candidate response supplied
    by tests or, in normal proposal mode, the moment's default seeded response.
    The gate is delta-based: a candidate may keep another moment below its
    eventual target, but it must not drop that moment more than tolerance below
    its previous baseline.
    """
    candidate_responses = candidate_responses or {}
    results = []
    same_stage_moments = load_same_stage_moments(moment)
    source_transcript = moment_transcript_id(moment)
    stage_transcripts = {source_transcript, *(moment_transcript_id(other) for other in same_stage_moments)}
    checked_transcripts: set[str] = set()
    for other in same_stage_moments:
        checked_transcripts.add(moment_transcript_id(other))
        state = seed_state(other)
        baseline = load_baseline_score(other["id"])
        if baseline is None:
            baseline_response = default_ai_response(state)
            baseline_score = score_response(other, baseline_response, real=real, mock_judge=mock_judge)
            if real:
                write_baseline_score(other, baseline_score, source="first_real_mode_cross_moment_run", overwrite=False)
            baseline = {
                "overall_score": baseline_score["overall_score"],
                "source": "computed_current_response",
            }
        response = candidate_responses.get(other["id"], default_ai_response(state))
        scored = score_response(other, response, real=real, mock_judge=mock_judge)
        baseline_score_value = float(baseline["overall_score"])
        minimum_score = round(baseline_score_value - tolerance, 4)
        hard_failures = [item for item in scored["hard_invariants"] if not item["pass"]]
        passed = scored["overall_score"] >= minimum_score and not hard_failures
        reason = "passed"
        if hard_failures:
            reason = "hard invariant failed: " + ", ".join(item["id"] for item in hard_failures)
        elif scored["overall_score"] < minimum_score:
            reason = (
                f"score {scored['overall_score']} dropped below baseline "
                f"{baseline_score_value} - tolerance {tolerance}"
            )
        results.append(
            {
                "moment": other["id"],
                "stages": other["stages"],
                "score": scored["overall_score"],
                "baseline": baseline_score_value,
                "minimum_score": minimum_score,
                "tolerance": tolerance,
                "baseline_source": baseline.get("source"),
                "hard_invariant_failures": [item["id"] for item in hard_failures],
                "pass": passed,
                "reason": reason,
            }
        )
    return {
        "source_moment": moment["id"],
        "same_stage_moment_count": len(results),
        "stage_transcripts": sorted(stage_transcripts),
        "checked_transcripts": sorted(checked_transcripts),
        "coverage_warning": (
            "coverage-blind: only one transcript covers this stage"
            if len(stage_transcripts - {"unknown"}) <= 1
            else None
        ),
        "coverage_pass": len(stage_transcripts - {"unknown"}) <= 1 or len(checked_transcripts - {"unknown"}) >= 2,
        "tolerance": tolerance,
        "pass": all(item["pass"] for item in results)
        and (len(stage_transcripts - {"unknown"}) <= 1 or len(checked_transcripts - {"unknown"}) >= 2),
        "results": results,
    }


def render_improvement_plan(
    run_dir: Path,
    moment: dict[str, Any],
    score: dict[str, Any],
    chosen: str | None,
    cross_moment: dict[str, Any],
) -> str:
    target = score.get("improvement_targets", [{}])[0]
    lines = [
        "# Moment Eval Improvement Plan",
        "",
        f"Run: `{run_dir}`",
        f"Moment: `{moment['id']}`",
        f"Score: `{score['overall_score']}`",
        "",
        "## Ownership Routing",
        "",
        "- Owner: mwf_prompts",
        f"- Dimension: {target.get('dimension', 'no_shared_agreement_clarity')}",
        "- Recommended action: patch_prompt",
        f"- Chosen edit/proposal: {chosen or 'none - rejected before proposal write'}",
        "",
        "## Cross-Moment Regularization",
        "",
        f"- Source moment: `{cross_moment['source_moment']}`",
        f"- Same-stage moments checked: {cross_moment['same_stage_moment_count']}",
        f"- Stage transcripts: {', '.join(cross_moment.get('stage_transcripts', []))}",
        f"- Checked transcripts: {', '.join(cross_moment.get('checked_transcripts', []))}",
        f"- Coverage parity: {'pass' if cross_moment.get('coverage_pass', True) else 'fail'}",
        f"- Baseline tolerance: {cross_moment.get('tolerance', 0.05)}",
        f"- Gate verdict: {'pass' if cross_moment['pass'] else 'reject'}",
    ]
    if cross_moment.get("coverage_warning"):
        lines.append(f"- Warning: {cross_moment['coverage_warning']}")
    for item in cross_moment["results"]:
        lines.append(
            f"- `{item['moment']}`: {'pass' if item['pass'] else 'fail'} "
            f"(score {item['score']} / baseline {item.get('baseline')} "
            f"minimum {item.get('minimum_score')}; {item['reason']})"
        )
    lines.extend(
        [
            "",
            "## Regression Guard",
            "",
            "- Stage 4 prompt regions are out of scope and must remain untouched."
            if moment["id"] == REAL_SUPPORTED_MOMENT
            else "- Same-stage moments must remain above their individual thresholds with no hard invariant failures.",
            "",
        ]
    )
    return "\n".join(lines)


def write_run_artifacts(
    run_dir: Path,
    moment: dict[str, Any],
    state: SeededState | dict[str, Any],
    response: str,
    score: dict[str, Any],
    started_at: float,
    iteration: int,
    prompt_version: Path | None,
    *,
    real: bool = False,
    state_delta: dict[str, Any] | None = None,
    raw_judge: dict[str, Any] | None = None,
) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    state_payload = state if isinstance(state, dict) else state.to_dict()
    session_id = state_payload.get("sessionId") or state_payload.get("session_id")
    (run_dir / "seed-state.json").write_text(json.dumps(state_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (run_dir / "ai-response.md").write_text(response + "\n", encoding="utf-8")
    (run_dir / "state-delta.json").write_text(
        json.dumps(
            state_delta
            or {
                "new_messages_in_db": [{"role": "ASSISTANT", "content": response}],
                "stage_progress_diff": [],
                "strategy_selection_overlap": [],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    (run_dir / "score.json").write_text(json.dumps(score, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (run_dir / "score-rationale.md").write_text(score_rationale(score), encoding="utf-8")
    if raw_judge:
        (run_dir / "judge-raw.json").write_text(json.dumps(raw_judge, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (run_dir / "run.json").write_text(
        json.dumps(
            {
                "moment": moment["id"],
                "mode": "real" if real else "mock",
                "iteration": iteration,
                "session_id": session_id,
                "started_at": datetime.utcfromtimestamp(started_at).isoformat() + "Z",
                "duration_seconds": round(time.time() - started_at, 3),
                "entrypoint": "scripts/mwf_moment_eval.py",
                "prompt_version": str(prompt_version.relative_to(REPO_ROOT)) if prompt_version else None,
                "git_sha": git_sha(),
                "git_branch": git_branch(),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def score_rationale(score: dict[str, Any]) -> str:
    lines = ["# Moment Score Rationale", ""]
    lines.append(f"Overall score: {score['overall_score']}")
    lines.append(f"Verdict: {score['verdict']}")
    lines.append("")
    lines.append("## Dimensions")
    for dim_id, data in score["dimensions"].items():
        lines.append(f"- {dim_id}: {data['score']} ({data['rationale']})")
    lines.append("")
    lines.append("## Hard Invariants")
    for invariant in score["hard_invariants"]:
        lines.append(f"- {invariant['id']}: {'pass' if invariant['pass'] else 'fail'}")
    lines.append("")
    return "\n".join(lines)


def prompt_append_from_version(prompt_version: Path | None) -> str | None:
    if not prompt_version:
        return None
    text = prompt_version.read_text(encoding="utf-8")
    marker = "For Stage 1 fact-reflection turns,"
    index = text.find(marker)
    if index == -1:
        return text
    return text[index:].split("\n\n## Diff", 1)[0].strip()


def run_real_iteration(
    moment: dict[str, Any],
    args: argparse.Namespace,
    prompt_version: Path | None,
    previous_score: dict[str, Any] | None,
) -> tuple[dict[str, Any], str, dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    env: dict[str, str] = {}
    append = prompt_append_from_version(prompt_version)
    if append:
        env["MWF_STAGE1_PROMPT_APPEND"] = append
    if args.mock_response:
        if moment["id"] == REAL_SUPPORTED_MOMENT:
            seed = real_seed_state(moment)
        else:
            seed = run_real_helper("seed-generic", {"moment": moment})
        run_result = {"seed": seed, "aiResponse": args.mock_response, "stateDelta": {"new_messages_in_db": [], "stage_progress": []}}
    else:
        payload: dict[str, Any] = {"content": moment["trigger"]["body"]["content"]}
        if moment["id"] != REAL_SUPPORTED_MOMENT:
            payload["moment"] = moment
        if "trajectory" in moment:
            run_result = run_real_helper("run-trajectory", {"moment": moment}, env_overrides=env)
        else:
            run_result = run_real_helper("run", payload, env_overrides=env)
    state = run_result["seed"]
    response = str(run_result.get("aiResponse", ""))
    if not response.strip():
        raise MomentEvalError("Real backend run produced an empty AI response")
    state_delta = run_result.get("stateDelta", {})
    raw_judge: dict[str, Any] | None = None
    if not args.mock_judge:
        estimated_cost = estimate_judge_cost_cents(moment, response)
        if estimated_cost > args.max_judge_cost_cents:
            raw_judge = {
                "aborted": True,
                "reason": "cost_guard",
                "estimated_cost_cents": estimated_cost,
                "max_judge_cost_cents": args.max_judge_cost_cents,
            }
            raise CostGuardError(
                f"Judge cost guard refused call: estimated {estimated_cost} cents > limit {args.max_judge_cost_cents} cents",
                raw_judge,
            )
    score = score_response(moment, response, previous_score, real=True, mock_judge=args.mock_judge)
    raw_judge = score.get("judge")
    return state, response, state_delta, score, raw_judge


def run_loop(args: argparse.Namespace) -> list[Path]:
    moment = load_moment(args.moment)
    previous_score: dict[str, Any] | None = None
    created: list[Path] = []
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    max_iterations = max(1, args.max_iterations)
    active_prompt_version: Path | None = None
    for iteration in range(1, max_iterations + 1):
        started_at = time.time()
        run_dir = RUNS_ROOT / f"moment-{moment['id']}-{timestamp}-iter-{iteration:02d}"
        if args.real:
            try:
                state, response, state_delta, score, raw_judge = run_real_iteration(moment, args, active_prompt_version, previous_score)
            except CostGuardError as exc:
                run_dir.mkdir(parents=True, exist_ok=True)
                (run_dir / "judge-cost-guard.json").write_text(
                    json.dumps(exc.diagnostic, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                (run_dir / "run.json").write_text(
                    json.dumps(
                        {
                            "moment": moment["id"],
                            "mode": "real",
                            "iteration": iteration,
                            "started_at": datetime.utcfromtimestamp(started_at).isoformat() + "Z",
                            "duration_seconds": round(time.time() - started_at, 3),
                            "entrypoint": "scripts/mwf_moment_eval.py",
                            "error": "judge_cost_guard",
                            "git_sha": git_sha(),
                            "git_branch": git_branch(),
                        },
                        indent=2,
                        sort_keys=True,
                    )
                    + "\n",
                    encoding="utf-8",
                )
                raise
            write_run_artifacts(
                run_dir,
                moment,
                state,
                response,
                score,
                started_at,
                iteration,
                active_prompt_version,
                real=True,
                state_delta=state_delta,
                raw_judge=raw_judge,
            )
        else:
            state = seed_state(moment)
            response = args.mock_response or default_ai_response(state)
            score = score_response(moment, response, previous_score)
            state_delta = None
            if "trajectory" in moment:
                state_delta = build_trajectory_state_delta(moment)
            write_run_artifacts(
                run_dir,
                moment,
                state,
                response,
                score,
                started_at,
                iteration,
                active_prompt_version,
                state_delta=state_delta,
            )
        created.append(run_dir)

        should_improve = (
            not args.no_improve
            and iteration < max_iterations
            and score["overall_score"] < args.target_score
        )
        if should_improve:
            active_prompt_version = run_improver(
                run_dir,
                moment,
                score,
                args.allow_protected_branch_patch,
                real=args.real,
                mock_judge=args.mock_judge,
            )
            write_run_artifacts(
                run_dir,
                moment,
                state,
                response,
                score,
                started_at,
                iteration,
                active_prompt_version,
                real=args.real,
                state_delta=state_delta if args.real else None,
            )
            previous_score = score
            continue
        if score["overall_score"] >= args.target_score or args.no_improve:
            break
        previous_score = score
    return created


def build_trajectory_state_delta(moment: dict[str, Any]) -> dict[str, Any]:
    steps = []
    for index, step in enumerate(moment.get("trajectory", []), start=1):
        steps.append(
            {
                "turn": index,
                "user_turn": step["user_turn"],
                "ai_response_persisted": step["expected_ai_response"],
                "seed_for_next_turn": {
                    "previous_ai_response": step["expected_ai_response"],
                    "history_length_after_turn": index * 2,
                },
            }
        )
    return {
        "new_messages_in_db": [
            {"role": "USER", "content": step["user_turn"]}
            for step in moment.get("trajectory", [])
        ]
        + [
            {"role": "ASSISTANT", "content": step["expected_ai_response"]}
            for step in moment.get("trajectory", [])
        ],
        "stage_progress_diff": [],
        "trajectory_steps": steps,
    }


def run_library(args: argparse.Namespace) -> list[Path]:
    created: list[Path] = []
    failures: list[str] = []
    for moment_id in list_moments():
        run_args = argparse.Namespace(**vars(args))
        run_args.command = "run"
        run_args.moment = moment_id
        try:
            created.extend(run_loop(run_args))
        except MomentEvalError as exc:
            failures.append(f"{moment_id}: {exc}")
            if not getattr(args, "keep_going", False):
                break
    if failures:
        raise MomentEvalError("run-library failed:\n" + "\n".join(failures))
    return created


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="MWF Moment Evaluator: seed, run, score, and improve one stage-segmented moment.",
        epilog="Common run flags: run --moment --target-score --max-iterations --mock-judge --allow-protected-branch-patch --mock-response --no-improve",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    seed = sub.add_parser("seed", help="Seed a clean moment state and print its summary")
    seed.add_argument("--moment", default=SUPPORTED_MOMENT)
    seed.add_argument("--real", action="store_true", help="Write real Prisma rows for supported real-mode moments")
    seed.add_argument("--print-state", action="store_true")
    seed_cleanup = sub.add_parser("seed-cleanup", help="Delete old real-mode moment-eval seed data")
    seed_cleanup.add_argument("--older-than", default="1d")

    run = sub.add_parser("run", help="Run the moment evaluator loop")
    run.add_argument("--moment", default=SUPPORTED_MOMENT)
    run.add_argument("--real", action="store_true", help="Use real Prisma seed, backend handler, Bedrock response, and real judge by default")
    run.add_argument("--target-score", type=float, default=4.0)
    run.add_argument("--max-iterations", type=int, default=1)
    run.add_argument("--mock-judge", action="store_true", default=None, help="Use deterministic local scoring")
    run.add_argument("--max-judge-cost-cents", type=float, default=5.0)
    run.add_argument("--mock-response", help="Use this response instead of the deterministic backend fixture response")
    run.add_argument("--no-improve", action="store_true", help="Do not invoke the improver even on failing scores")
    run.add_argument(
        "--improvement-mode",
        choices=("proposal", "patch"),
        default="proposal",
        help="patch writes a versioned prompt proposal and reruns; proposal records no production changes",
    )
    run.add_argument(
        "--allow-protected-branch-patch",
        type=parse_bool,
        nargs="?",
        const=True,
        default=False,
        help="Allow patch mode on protected branches",
    )
    library = sub.add_parser("run-library", help="Run every moment yaml in eval/moments")
    library.add_argument("--real", action="store_true", help="Use the real command path where supported")
    library.add_argument("--target-score", type=float, default=4.0)
    library.add_argument("--max-iterations", type=int, default=1)
    library.add_argument("--mock-judge", action="store_true", default=None, help="Use deterministic local scoring")
    library.add_argument("--max-judge-cost-cents", type=float, default=5.0)
    library.add_argument("--mock-response", help="Use this response for every moment")
    library.add_argument("--no-improve", action="store_true", help="Do not invoke the improver even on failing scores")
    library.add_argument("--keep-going", action="store_true", help="Continue after a moment fails")
    library.add_argument(
        "--improvement-mode",
        choices=("proposal", "patch"),
        default="proposal",
    )
    library.add_argument(
        "--allow-protected-branch-patch",
        type=parse_bool,
        nargs="?",
        const=True,
        default=False,
    )
    return parser


def parse_bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    lowered = value.lower()
    if lowered in {"1", "true", "yes", "y"}:
        return True
    if lowered in {"0", "false", "no", "n"}:
        return False
    raise argparse.ArgumentTypeError(f"Expected boolean, got {value}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "seed":
            moment = load_moment(args.moment)
            if args.real:
                state = real_seed_state(moment)
                if args.print_state:
                    print(summarize_real_seed(state), end="")
                else:
                    print(state["sessionId"])
                return 0
            state = seed_state(moment)
            if args.print_state:
                print(summarize_seed(state), end="")
            else:
                print(state.session_id)
            return 0
        if args.command == "seed-cleanup":
            result = run_real_helper("cleanup", args.older_than)
            print(json.dumps(result, sort_keys=True))
            return 0
        if args.command in {"run", "run-library"}:
            if args.mock_judge is None:
                args.mock_judge = not args.real
            if args.max_judge_cost_cents < 0:
                raise MomentEvalError("--max-judge-cost-cents must be non-negative")
            if args.improvement_mode == "patch":
                ensure_patch_branch(args.allow_protected_branch_patch)
            created = run_library(args) if args.command == "run-library" else run_loop(args)
            for path in created:
                print(path.relative_to(REPO_ROOT))
            return 0
    except MomentEvalError as exc:
        print(f"mwf_moment_eval: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
