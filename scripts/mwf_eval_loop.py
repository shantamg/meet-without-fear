#!/usr/bin/env python3
"""Self-refining evaluation loop for Meet Without Fear.

Orchestrates simulation via mwf_gold_loop, scores across four domains
(character fidelity, AI response quality, technical bugs, UX quality),
and runs a lead agent review that creates prioritized improvement tasks.
Iterates until all domains reach the convergence target (default 95/100).

Usage:
    # Full loop (simulate + score + review + iterate)
    python3 scripts/mwf_eval_loop.py run --scenario adam-eve

    # Score-only (from existing run artifacts)
    python3 scripts/mwf_eval_loop.py score --run-dir eval/runs/<dir>

    # Review-only (from existing scores)
    python3 scripts/mwf_eval_loop.py review --run-dir eval/runs/<dir>

    # Dry run (no simulation, mock data)
    python3 scripts/mwf_eval_loop.py run --scenario adam-eve --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
EVAL_ROOT = REPO_ROOT / "eval"
RUNS_ROOT = EVAL_ROOT / "runs"
CONFIG_PATH = EVAL_ROOT / "eval-loop-config.yaml"
GOLD_PROFILES_ROOT = EVAL_ROOT / "gold-profiles"
SCENARIOS_PATH = EVAL_ROOT / "gold-scenarios.json"
MOMENTS_ROOT = EVAL_ROOT / "moments"
BASELINES_ROOT = EVAL_ROOT / "baselines"
ALIGNMENT_CONFIG_PATH = EVAL_ROOT / "alignment-loop-config.yaml"

DOMAIN_IDS = ("character_fidelity", "ai_response_quality", "technical_bugs", "ux_quality")
DEFAULT_CONVERGENCE_TARGET = 95
DEFAULT_MAX_ITERATIONS = 5


class EvalLoopError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class DomainScore:
    domain: str
    score: float  # 0-100
    details: str
    per_stage: dict[int, float] | None = None
    issues: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "domain": self.domain,
            "score": self.score,
            "details": self.details,
        }
        if self.per_stage is not None:
            result["per_stage"] = self.per_stage
        if self.issues:
            result["issues"] = self.issues
        return result


@dataclass
class EvalReport:
    scenario_id: str
    iteration: int
    timestamp: str
    domains: list[DomainScore]
    overall_score: float
    converged: bool
    convergence_target: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "iteration": self.iteration,
            "timestamp": self.timestamp,
            "domains": {d.domain: d.to_dict() for d in self.domains},
            "overall_score": self.overall_score,
            "converged": self.converged,
            "convergence_target": self.convergence_target,
        }


@dataclass
class ImprovementTask:
    domain: str
    priority: int  # 0 = highest
    title: str
    description: str
    owner: str  # mwf_prompts | product_code | eval_harness | actor_skill
    estimated_complexity: str  # small | medium | large
    acceptance_criteria: list[str] = field(default_factory=list)
    related_files: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class LeadAgentReview:
    scenario_id: str
    iteration: int
    timestamp: str
    summary: str
    all_passing: bool
    tasks: list[ImprovementTask]
    score_history: list[dict[str, float]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "iteration": self.iteration,
            "timestamp": self.timestamp,
            "summary": self.summary,
            "all_passing": self.all_passing,
            "tasks": [t.to_dict() for t in self.tasks],
            "score_history": self.score_history,
        }


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

def load_config(path: Path | None = None) -> dict[str, Any]:
    config_path = path or CONFIG_PATH
    if not config_path.exists():
        raise EvalLoopError(f"Eval loop config not found: {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def load_gold_profile(scenario_id: str) -> dict[str, Any] | None:
    path = GOLD_PROFILES_ROOT / f"{scenario_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_scenarios_registry() -> list[dict[str, Any]]:
    if not SCENARIOS_PATH.exists():
        raise EvalLoopError(f"Gold scenarios registry not found: {SCENARIOS_PATH}")
    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    return data.get("scenarios", [])


# ---------------------------------------------------------------------------
# Domain 1: Character Fidelity (0-100)
# ---------------------------------------------------------------------------

def score_character_fidelity(
    run_dir: Path,
    scenario_id: str,
    gold_profile: dict[str, Any] | None = None,
) -> DomainScore:
    """Score how well simulation actors stayed in character vs gold profiles.

    Checks:
    - Actor operated correct side throughout
    - Behavioral consistency with gold profile participant_profiles
    - Resistance level and cooperation patterns match profile
    - Voice/posture alignment with profile evidence
    """
    issues: list[dict[str, Any]] = []
    score = 100.0

    # Check invariants.json for actor fidelity results
    invariants_path = run_dir / "invariants.json"
    if invariants_path.exists():
        invariants = json.loads(invariants_path.read_text(encoding="utf-8"))
        for check in invariants.get("checks", []):
            if check.get("dimension") == "actor_fidelity" and check.get("status") == "fail":
                score -= 30
                issues.append({
                    "type": "actor_side_violation",
                    "severity": "critical",
                    "details": check.get("details", "Actor operated wrong side"),
                    "evidence": check.get("evidence", []),
                })

    # Check score.json for actor_fidelity dimension from scorer
    score_path = run_dir / "score.json"
    if score_path.exists():
        score_data = json.loads(score_path.read_text(encoding="utf-8"))
        dimensions = score_data.get("dimensions", {})
        actor_dim = dimensions.get("actor_fidelity", {})
        if isinstance(actor_dim, dict):
            raw = actor_dim.get("score")
            if isinstance(raw, (int, float)):
                # Scorer uses 0-5 scale; normalize to 0-100
                normalized = min(100, max(0, (float(raw) / 5.0) * 100))
                score = min(score, normalized)
            if actor_dim.get("pass") is False:
                issues.append({
                    "type": "actor_fidelity_below_threshold",
                    "severity": "major",
                    "details": actor_dim.get("rationale", "Actor fidelity below threshold"),
                })

    # Check gold alignment data
    if score_path.exists():
        score_data = json.loads(score_path.read_text(encoding="utf-8"))
        alignment = score_data.get("gold_alignment", {})
        actor_alignment = alignment.get("actor_fidelity", {})
        if isinstance(actor_alignment, dict) and actor_alignment.get("drift_points"):
            drift_count = len(actor_alignment["drift_points"])
            score -= min(20, drift_count * 5)
            issues.append({
                "type": "character_drift",
                "severity": "moderate",
                "details": f"{drift_count} drift point(s) detected",
                "drift_points": actor_alignment["drift_points"][:5],
            })

    # If gold profile available, check for profile-specific concerns
    if gold_profile:
        scorer_priorities = gold_profile.get("scorer_priorities", [])
        if scorer_priorities and not score_path.exists():
            issues.append({
                "type": "unscored_profile_priorities",
                "severity": "info",
                "details": f"{len(scorer_priorities)} scorer priorities not yet evaluated",
            })

    score = max(0, min(100, score))
    return DomainScore(
        domain="character_fidelity",
        score=round(score, 1),
        details=f"Character fidelity for {scenario_id}: {len(issues)} issue(s) found",
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Domain 2: MWF AI Response Quality (0-100, per stage)
# ---------------------------------------------------------------------------

def score_ai_response_quality(
    run_dir: Path,
    scenario_id: str,
) -> DomainScore:
    """Score MWF AI response quality using moment baselines and scorer results.

    Checks per-stage:
    - Listening depth and empathy accuracy
    - Resistance handling
    - Consent gate honoring
    - Boundary respect
    - Stage-appropriate language
    """
    per_stage: dict[int, float] = {}
    issues: list[dict[str, Any]] = []

    # Load moment baselines for this scenario
    scenario_moments = _find_scenario_moments(scenario_id)
    if scenario_moments:
        for stage in range(5):
            stage_moments = [m for m in scenario_moments if stage in m.get("stages", [])]
            if not stage_moments:
                continue
            stage_scores: list[float] = []
            for moment in stage_moments:
                baseline_path = BASELINES_ROOT / f"{moment['id']}.json"
                if baseline_path.exists():
                    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
                    raw = baseline.get("overall_score")
                    if isinstance(raw, (int, float)):
                        # Baseline is 1-5 scale; normalize to 0-100
                        stage_scores.append(min(100, max(0, (float(raw) / 5.0) * 100)))
                    if baseline.get("verdict") == "eval_fail":
                        issues.append({
                            "type": "moment_failure",
                            "severity": "major",
                            "stage": stage,
                            "moment_id": moment["id"],
                            "details": f"Moment {moment['id']} failed evaluation",
                        })
            if stage_scores:
                per_stage[stage] = round(sum(stage_scores) / len(stage_scores), 1)

    # Also check run-level score.json mwf_handling dimension
    score_path = run_dir / "score.json"
    if score_path.exists():
        score_data = json.loads(score_path.read_text(encoding="utf-8"))
        dimensions = score_data.get("dimensions", {})
        mwf_dim = dimensions.get("mwf_handling", {})
        if isinstance(mwf_dim, dict):
            raw = mwf_dim.get("score")
            if isinstance(raw, (int, float)):
                normalized = min(100, max(0, (float(raw) / 5.0) * 100))
                if not per_stage:
                    per_stage[0] = normalized
            if mwf_dim.get("pass") is False:
                issues.append({
                    "type": "mwf_handling_below_threshold",
                    "severity": "major",
                    "details": mwf_dim.get("rationale", "MWF handling below threshold"),
                })

    # Check gold alignment for MWF guidance
    if score_path.exists():
        score_data = json.loads(score_path.read_text(encoding="utf-8"))
        alignment = score_data.get("gold_alignment", {})
        mwf_guidance = alignment.get("mwf_guidance", {})
        if isinstance(mwf_guidance, dict) and mwf_guidance.get("issues"):
            for issue in mwf_guidance["issues"][:5]:
                issues.append({
                    "type": "gold_alignment_issue",
                    "severity": "moderate",
                    "details": str(issue),
                })

    # Check invariants for stage-gate violations
    invariants_path = run_dir / "invariants.json"
    if invariants_path.exists():
        invariants = json.loads(invariants_path.read_text(encoding="utf-8"))
        for check in invariants.get("checks", []):
            if check.get("dimension") == "stage_gates" and check.get("status") == "fail":
                issues.append({
                    "type": "stage_gate_violation",
                    "severity": "critical",
                    "details": check.get("details", "Stage gate check failed"),
                    "evidence": check.get("evidence", []),
                })

    overall = _average_or_default(list(per_stage.values()), 50.0)
    return DomainScore(
        domain="ai_response_quality",
        score=round(overall, 1),
        details=f"AI response quality for {scenario_id}: {len(per_stage)} stages scored, {len(issues)} issue(s)",
        per_stage=per_stage if per_stage else None,
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Domain 3: Technical Bugs (0-100)
# ---------------------------------------------------------------------------

def score_technical_bugs(run_dir: Path, scenario_id: str) -> DomainScore:
    """Capture and score technical issues encountered during simulation.

    Checks:
    - Console errors in service logs
    - API failures (non-2xx responses)
    - State machine violations
    - SSE/streaming issues
    - Actor error states
    """
    issues: list[dict[str, Any]] = []
    score = 100.0

    # Check for actor error/bug_blocked states in run.json
    run_json_path = run_dir / "run.json"
    if run_json_path.exists():
        run_data = json.loads(run_json_path.read_text(encoding="utf-8"))
        for entry in run_data.get("status_history", []):
            status = entry.get("status", {}) if isinstance(entry.get("status"), dict) else {}
            state = status.get("state", "")
            if state == "error":
                score -= 25
                issues.append({
                    "type": "actor_error",
                    "severity": "critical",
                    "details": status.get("next_action_needed", "Actor encountered error"),
                    "side": entry.get("side"),
                })
            elif state == "bug_blocked":
                score -= 20
                issues.append({
                    "type": "bug_blocked",
                    "severity": "major",
                    "details": status.get("next_action_needed", "Actor blocked by bug"),
                    "side": entry.get("side"),
                })

    # Check service logs for errors
    for log_name in ("backend.log", "web.log"):
        log_path = run_dir / log_name
        if not log_path.exists():
            # Check parent service dir
            for parent_dir in run_dir.parent.glob("*-services"):
                candidate = parent_dir / log_name
                if candidate.exists():
                    log_path = candidate
                    break
        if log_path.exists():
            log_errors = _scan_log_for_errors(log_path)
            for error in log_errors[:10]:
                severity_penalty = 5 if error["severity"] == "error" else 2
                score -= severity_penalty
                issues.append({
                    "type": "service_log_error",
                    "severity": error["severity"],
                    "source": log_name,
                    "details": error["message"][:200],
                })

    # Check invariants for hard failures
    invariants_path = run_dir / "invariants.json"
    if invariants_path.exists():
        invariants = json.loads(invariants_path.read_text(encoding="utf-8"))
        hard_failures = invariants.get("hard_failures", [])
        for failure in hard_failures:
            score -= 15
            issues.append({
                "type": "invariant_hard_failure",
                "severity": "critical",
                "details": failure.get("details", "Hard invariant failed"),
                "check_id": failure.get("id"),
            })

    # Check for transcript extraction errors
    transcript_error_path = run_dir / "transcript-extract-error.txt"
    if transcript_error_path.exists():
        score -= 10
        issues.append({
            "type": "transcript_extraction_error",
            "severity": "major",
            "details": "Transcript extraction failed",
        })

    # Check for snapshot restore errors
    snapshot_error_path = run_dir / "snapshot-restore-error.txt"
    if snapshot_error_path.exists():
        score -= 10
        issues.append({
            "type": "snapshot_restore_error",
            "severity": "major",
            "details": "Snapshot restore failed",
        })

    score = max(0, min(100, score))
    return DomainScore(
        domain="technical_bugs",
        score=round(score, 1),
        details=f"Technical bugs for {scenario_id}: {len(issues)} issue(s), score {round(score, 1)}/100",
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Domain 4: UX Quality (0-100)
# ---------------------------------------------------------------------------

def score_ux_quality(run_dir: Path, scenario_id: str) -> DomainScore:
    """Evaluate user-facing experience during simulation.

    Checks:
    - Flow coherence (stages progress in order)
    - No visible control tags in transcripts
    - Transcript completeness (all expected side/stage combinations present)
    - CTA/input state visibility
    - Privacy (no partner private content leakage)
    """
    issues: list[dict[str, Any]] = []
    score = 100.0

    invariants_path = run_dir / "invariants.json"
    if invariants_path.exists():
        invariants = json.loads(invariants_path.read_text(encoding="utf-8"))
        for check in invariants.get("checks", []):
            check_id = check.get("id", "")
            passed = check.get("status") == "pass"

            if check_id == "no_visible_internal_control_tags" and not passed:
                score -= 20
                issues.append({
                    "type": "visible_control_tags",
                    "severity": "major",
                    "details": "Internal control tags visible to user",
                    "evidence": check.get("evidence", [])[:5],
                })

            elif check_id == "transcript_side_stage_complete" and not passed:
                score -= 15
                issues.append({
                    "type": "incomplete_flow",
                    "severity": "major",
                    "details": "Missing transcript stages — flow incomplete",
                    "evidence": check.get("evidence", [])[:5],
                })

            elif check_id == "cta_input_visibility_state_sane" and not passed:
                score -= 10
                issues.append({
                    "type": "cta_state_missing",
                    "severity": "moderate",
                    "details": "CTA/input visibility state not captured",
                    "evidence": check.get("evidence", [])[:5],
                })

            elif check_id == "no_partner_private_content_leakage" and not passed:
                score -= 30
                issues.append({
                    "type": "privacy_leakage",
                    "severity": "critical",
                    "details": "Partner private content leaked",
                    "evidence": check.get("evidence", [])[:5],
                })

            elif check_id == "felt_heard_gate_after_substantive_witnessing" and not passed:
                score -= 15
                issues.append({
                    "type": "premature_gate",
                    "severity": "major",
                    "details": "Feel-heard gate appeared before substantive witnessing",
                    "evidence": check.get("evidence", [])[:5],
                })

            elif check_id == "stage_limit_reached_correctly" and not passed:
                score -= 10
                issues.append({
                    "type": "flow_incomplete",
                    "severity": "moderate",
                    "details": "Not all sides reached the expected stage",
                    "evidence": check.get("evidence", [])[:5],
                })

    # Check transcript count — expect both sides with multiple stages
    transcripts_dir = run_dir / "transcripts"
    if transcripts_dir.exists():
        transcript_files = list(transcripts_dir.glob("*.md"))
        if len(transcript_files) < 4:
            score -= 10
            issues.append({
                "type": "few_transcripts",
                "severity": "moderate",
                "details": f"Only {len(transcript_files)} transcript file(s); expected at least 4 for a full flow",
            })
    elif not invariants_path.exists():
        score -= 20
        issues.append({
            "type": "no_transcripts",
            "severity": "major",
            "details": "No transcript directory found",
        })

    score = max(0, min(100, score))
    return DomainScore(
        domain="ux_quality",
        score=round(score, 1),
        details=f"UX quality for {scenario_id}: {len(issues)} issue(s)",
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Lead Agent Review
# ---------------------------------------------------------------------------

def lead_agent_review(
    report: EvalReport,
    gold_profile: dict[str, Any] | None = None,
    score_history: list[dict[str, float]] | None = None,
) -> LeadAgentReview:
    """Review all domain scores and create prioritized improvement tasks.

    The lead agent:
    1. Reviews all four domain scores
    2. Identifies the weakest areas
    3. Creates AI-completable tasks ordered by impact
    4. Tracks score progression across iterations
    """
    tasks: list[ImprovementTask] = []
    history = score_history or []

    # Sort domains by score (lowest first) for prioritization
    sorted_domains = sorted(report.domains, key=lambda d: d.score)

    for priority, domain in enumerate(sorted_domains):
        if domain.score >= report.convergence_target:
            continue

        gap = report.convergence_target - domain.score
        domain_tasks = _create_improvement_tasks(domain, priority, gap, gold_profile)
        tasks.extend(domain_tasks)

    # Build summary
    domain_summaries = []
    for d in report.domains:
        status = "PASS" if d.score >= report.convergence_target else "NEEDS WORK"
        domain_summaries.append(f"  {d.domain}: {d.score}/100 [{status}]")

    trend = ""
    if history:
        prev = history[-1] if history else {}
        improvements = []
        regressions = []
        for d in report.domains:
            prev_score = prev.get(d.domain)
            if prev_score is not None:
                delta = d.score - prev_score
                if delta > 0:
                    improvements.append(f"{d.domain} +{delta:.1f}")
                elif delta < 0:
                    regressions.append(f"{d.domain} {delta:.1f}")
        if improvements:
            trend = f"\n  Improvements: {', '.join(improvements)}"
        if regressions:
            trend += f"\n  Regressions: {', '.join(regressions)}"

    summary = (
        f"Iteration {report.iteration} — {report.scenario_id}\n"
        f"Overall: {report.overall_score}/100 (target: {report.convergence_target})\n"
        f"{'CONVERGED' if report.converged else 'NOT CONVERGED'}\n\n"
        f"Domain scores:\n" + "\n".join(domain_summaries)
        + (trend or "")
        + f"\n\nTasks created: {len(tasks)}"
    )

    # Record current scores in history
    current_scores = {d.domain: d.score for d in report.domains}
    current_scores["overall"] = report.overall_score

    return LeadAgentReview(
        scenario_id=report.scenario_id,
        iteration=report.iteration,
        timestamp=datetime.utcnow().isoformat() + "Z",
        summary=summary,
        all_passing=report.converged,
        tasks=tasks,
        score_history=history + [current_scores],
    )


def _create_improvement_tasks(
    domain: DomainScore,
    base_priority: int,
    gap: float,
    gold_profile: dict[str, Any] | None = None,
) -> list[ImprovementTask]:
    """Create concrete, AI-completable tasks for a domain that needs improvement."""
    tasks: list[ImprovementTask] = []

    if domain.domain == "character_fidelity":
        for issue in domain.issues:
            if issue.get("type") == "actor_side_violation":
                tasks.append(ImprovementTask(
                    domain="character_fidelity",
                    priority=base_priority,
                    title="Fix actor side assignment in gold loop orchestrator",
                    description="Actor operated the wrong side during simulation. Review actor prompt construction and side assignment logic.",
                    owner="eval_harness",
                    estimated_complexity="medium",
                    acceptance_criteria=["Actor status blocks always match assigned side", "check_actor_operated_correct_side invariant passes"],
                    related_files=["scripts/mwf_gold_loop.py"],
                ))
            elif issue.get("type") == "character_drift":
                tasks.append(ImprovementTask(
                    domain="character_fidelity",
                    priority=base_priority + 1,
                    title="Reduce character drift in actor simulation",
                    description=f"Actor drifted from gold profile. {issue.get('details', '')}. Tighten the actor skill prompt with more specific behavioral constraints from the gold profile.",
                    owner="actor_skill",
                    estimated_complexity="medium",
                    acceptance_criteria=["Actor fidelity score >= 95", "No drift points in gold alignment"],
                    related_files=["eval/skills/self-improvement/mwf-gold-loop-actor/SKILL.md"],
                ))

    elif domain.domain == "ai_response_quality":
        # Group issues by stage
        stage_issues: dict[int, list[dict[str, Any]]] = {}
        for issue in domain.issues:
            stage = issue.get("stage", -1)
            stage_issues.setdefault(stage, []).append(issue)

        for stage, issues in sorted(stage_issues.items()):
            moment_failures = [i for i in issues if i.get("type") == "moment_failure"]
            if moment_failures:
                moment_ids = [i.get("moment_id", "unknown") for i in moment_failures]
                tasks.append(ImprovementTask(
                    domain="ai_response_quality",
                    priority=base_priority,
                    title=f"Improve Stage {stage} AI prompt for failing moments",
                    description=f"Moments failing evaluation: {', '.join(moment_ids)}. Run the moment improver with cross-moment regularization to propose a revision that passes without regressing other moments.",
                    owner="mwf_prompts",
                    estimated_complexity="medium",
                    acceptance_criteria=[f"Moment {mid} scores >= 4.0" for mid in moment_ids],
                    related_files=["backend/src/services/stage-prompts.ts", "scripts/mwf_moment_eval.py"],
                ))

        if not stage_issues and domain.per_stage:
            weakest_stage = min(domain.per_stage, key=domain.per_stage.get)  # type: ignore[arg-type]
            tasks.append(ImprovementTask(
                domain="ai_response_quality",
                priority=base_priority,
                title=f"Improve Stage {weakest_stage} AI response quality",
                description=f"Stage {weakest_stage} has the lowest AI response quality score ({domain.per_stage[weakest_stage]}/100). Review the stage prompt and run moment evaluations to identify specific improvements.",
                owner="mwf_prompts",
                estimated_complexity="medium",
                acceptance_criteria=[f"Stage {weakest_stage} AI response quality >= 95"],
                related_files=["backend/src/services/stage-prompts.ts"],
            ))

    elif domain.domain == "technical_bugs":
        for issue in domain.issues:
            issue_type = issue.get("type", "")
            if issue_type == "actor_error":
                tasks.append(ImprovementTask(
                    domain="technical_bugs",
                    priority=base_priority,
                    title=f"Fix actor error on {issue.get('side', 'unknown')} side",
                    description=issue.get("details", "Actor encountered an error during simulation"),
                    owner="product_code",
                    estimated_complexity="medium",
                    acceptance_criteria=["Simulation completes without actor errors"],
                    related_files=["scripts/mwf_gold_loop.py"],
                ))
            elif issue_type == "service_log_error":
                tasks.append(ImprovementTask(
                    domain="technical_bugs",
                    priority=base_priority + 1,
                    title=f"Fix {issue.get('source', 'service')} error: {issue.get('details', '')[:60]}",
                    description=issue.get("details", "Service produced error during simulation"),
                    owner="product_code",
                    estimated_complexity="small",
                    acceptance_criteria=["No new errors in service logs during simulation"],
                    related_files=["backend/src/"],
                ))
            elif issue_type == "invariant_hard_failure":
                tasks.append(ImprovementTask(
                    domain="technical_bugs",
                    priority=base_priority,
                    title=f"Fix hard invariant failure: {issue.get('check_id', 'unknown')}",
                    description=issue.get("details", "Hard invariant check failed"),
                    owner="product_code",
                    estimated_complexity="medium",
                    acceptance_criteria=[f"Invariant {issue.get('check_id', '')} passes"],
                    related_files=[],
                ))

    elif domain.domain == "ux_quality":
        for issue in domain.issues:
            issue_type = issue.get("type", "")
            if issue_type == "visible_control_tags":
                tasks.append(ImprovementTask(
                    domain="ux_quality",
                    priority=base_priority,
                    title="Strip internal control tags from AI responses",
                    description="AI responses contain visible internal control tags (e.g., <thinking>, <draft>). These must be stripped before displaying to users.",
                    owner="product_code",
                    estimated_complexity="small",
                    acceptance_criteria=["No control tags visible in transcripts"],
                    related_files=["backend/src/services/"],
                ))
            elif issue_type == "privacy_leakage":
                tasks.append(ImprovementTask(
                    domain="ux_quality",
                    priority=0,  # Highest priority
                    title="Fix partner private content leakage",
                    description="Partner's private content is being leaked to the other participant. This is a critical privacy violation.",
                    owner="product_code",
                    estimated_complexity="large",
                    acceptance_criteria=["No partner private content appears in other participant's view"],
                    related_files=["backend/src/services/"],
                ))
            elif issue_type == "premature_gate":
                tasks.append(ImprovementTask(
                    domain="ux_quality",
                    priority=base_priority,
                    title="Fix premature feel-heard gate",
                    description="The feel-heard gate appears before sufficient witnessing has occurred. Adjust the gate threshold or witnessing counter.",
                    owner="product_code",
                    estimated_complexity="medium",
                    acceptance_criteria=["Feel-heard gate only appears after substantive witnessing"],
                    related_files=["backend/src/services/"],
                ))

    # If no specific tasks were created from issues, add a general improvement task
    if not tasks and gap > 0:
        tasks.append(ImprovementTask(
            domain=domain.domain,
            priority=base_priority,
            title=f"Improve {domain.domain.replace('_', ' ')} score (currently {domain.score}/100)",
            description=f"The {domain.domain.replace('_', ' ')} domain scores {domain.score}/100, which is {gap:.1f} points below the convergence target. Review the domain's issues and create targeted fixes.",
            owner="eval_harness",
            estimated_complexity="medium",
            acceptance_criteria=[f"{domain.domain} score >= {domain.score + gap}"],
        ))

    return tasks


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_scenario_moments(scenario_id: str) -> list[dict[str, Any]]:
    """Find moment YAMLs that belong to a scenario."""
    moments: list[dict[str, Any]] = []
    if not MOMENTS_ROOT.exists():
        return moments
    prefix = scenario_id.lower().replace("-", "-")
    for path in sorted(MOMENTS_ROOT.glob("*.yaml")):
        if path.stem.startswith(prefix):
            try:
                moment = json.loads(path.read_text(encoding="utf-8"))
                moments.append(moment)
            except (json.JSONDecodeError, OSError):
                continue
    return moments


def _scan_log_for_errors(log_path: Path) -> list[dict[str, str]]:
    """Scan a log file for error patterns."""
    errors: list[dict[str, str]] = []
    error_patterns = [
        (re.compile(r"Error:|ERROR|FATAL|UnhandledPromiseRejection|EADDRINUSE|ECONNREFUSED", re.I), "error"),
        (re.compile(r"Warning:|WARN", re.I), "warning"),
    ]
    try:
        text = log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return errors
    for line in text.splitlines()[-500:]:  # Only scan last 500 lines
        for pattern, severity in error_patterns:
            if pattern.search(line):
                # Skip known noisy patterns
                if "DeprecationWarning" in line or "ExperimentalWarning" in line:
                    continue
                errors.append({"severity": severity, "message": line.strip()[:200]})
                break
    return errors


def _average_or_default(values: list[float], default: float) -> float:
    return sum(values) / len(values) if values else default


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def score_run(
    run_dir: Path,
    scenario_id: str,
    config: dict[str, Any] | None = None,
) -> EvalReport:
    """Score all four domains for a completed simulation run."""
    cfg = config or load_config()
    target = cfg.get("convergence_target", DEFAULT_CONVERGENCE_TARGET)
    gold_profile = load_gold_profile(scenario_id)

    domains = [
        score_character_fidelity(run_dir, scenario_id, gold_profile),
        score_ai_response_quality(run_dir, scenario_id),
        score_technical_bugs(run_dir, scenario_id),
        score_ux_quality(run_dir, scenario_id),
    ]

    # Weighted overall score
    domain_config = cfg.get("domains", {})
    total_weight = 0.0
    weighted_sum = 0.0
    for d in domains:
        w = domain_config.get(d.domain, {}).get("weight", 0.25)
        weighted_sum += d.score * w
        total_weight += w
    overall = weighted_sum / total_weight if total_weight > 0 else 0

    converged = all(d.score >= target for d in domains)

    return EvalReport(
        scenario_id=scenario_id,
        iteration=0,
        timestamp=datetime.utcnow().isoformat() + "Z",
        domains=domains,
        overall_score=round(overall, 1),
        converged=converged,
        convergence_target=target,
    )


def run_simulation(
    scenario_id: str,
    config: dict[str, Any],
    run_dir: Path,
    dry_run: bool = False,
) -> Path:
    """Run a gold loop simulation for the given scenario.

    In dry-run mode, creates mock artifacts instead of running the actual
    simulation.
    """
    run_dir.mkdir(parents=True, exist_ok=True)

    if dry_run:
        _write_mock_run_artifacts(run_dir, scenario_id)
        return run_dir

    gold_loop_cfg = config.get("gold_loop", {})
    cmd = [
        sys.executable,
        str(REPO_ROOT / "scripts/mwf_gold_loop.py"),
        "run-loop",
        "--scenario", scenario_id,
        "--stop-after-stage", str(gold_loop_cfg.get("stop_after_stage", 4)),
        "--timeout", str(gold_loop_cfg.get("actor_timeout", 600)),
        "--api-url", gold_loop_cfg.get("api_url", "http://localhost:3000"),
        "--app-url", gold_loop_cfg.get("app_url", "http://localhost:8082"),
    ]
    result = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=gold_loop_cfg.get("actor_timeout", 600) * 4,
    )
    if result.returncode != 0:
        error_path = run_dir / "simulation-error.txt"
        error_path.write_text(f"Exit code: {result.returncode}\n{result.stderr}\n{result.stdout}", encoding="utf-8")
        raise EvalLoopError(f"Gold loop simulation failed: {result.stderr[:500]}")

    return run_dir


def _write_mock_run_artifacts(run_dir: Path, scenario_id: str) -> None:
    """Create mock artifacts for dry-run mode."""
    run_data = {
        "scenario": scenario_id,
        "mode": "dry_run",
        "status_history": [
            {"side": "adam" if scenario_id == "adam-eve" else "james", "status": {"side": "adam" if scenario_id == "adam-eve" else "james", "state": "stage_limit_reached", "stage": 4}},
            {"side": "eve" if scenario_id == "adam-eve" else "catherine", "status": {"side": "eve" if scenario_id == "adam-eve" else "catherine", "state": "stage_limit_reached", "stage": 4}},
        ],
        "transcripts": [],
    }
    (run_dir / "run.json").write_text(json.dumps(run_data, indent=2) + "\n", encoding="utf-8")

    invariants = {
        "schema_version": 1,
        "status": "pass",
        "hard_failures": [],
        "checks": [
            {"id": "no_visible_internal_control_tags", "status": "pass", "severity": "hard", "dimension": "visible_text", "details": "Mock: pass", "evidence": []},
            {"id": "transcript_side_stage_complete", "status": "pass", "severity": "hard", "dimension": "transcript_extraction", "details": "Mock: pass", "evidence": []},
            {"id": "cta_input_visibility_state_sane", "status": "pass", "severity": "hard", "dimension": "transcript_extraction", "details": "Mock: pass", "evidence": []},
            {"id": "no_partner_private_content_leakage", "status": "pass", "severity": "hard", "dimension": "privacy", "details": "Mock: pass", "evidence": []},
            {"id": "stage_limit_reached_correctly", "status": "pass", "severity": "hard", "dimension": "actor_orchestration", "details": "Mock: pass", "evidence": []},
            {"id": "actor_operated_correct_side", "status": "pass", "severity": "hard", "dimension": "actor_fidelity", "details": "Mock: pass", "evidence": []},
            {"id": "felt_heard_gate_after_substantive_witnessing", "status": "pass", "severity": "hard", "dimension": "stage_gates", "details": "Mock: pass", "evidence": []},
        ],
    }
    (run_dir / "invariants.json").write_text(json.dumps(invariants, indent=2) + "\n", encoding="utf-8")

    score = {
        "overall_score": 4.2,
        "verdict": "eval_pass",
        "dimensions": {
            "actor_fidelity": {"score": 4.3, "pass": True, "rationale": "Mock: actor stayed in character"},
            "mwf_handling": {"score": 4.1, "pass": True, "rationale": "Mock: MWF responses within guidelines"},
        },
        "gold_alignment": {
            "actor_fidelity": {},
            "mwf_guidance": {},
        },
        "improvement_targets": [],
    }
    (run_dir / "score.json").write_text(json.dumps(score, indent=2) + "\n", encoding="utf-8")

    transcripts_dir = run_dir / "transcripts"
    transcripts_dir.mkdir(exist_ok=True)
    sides = ["adam", "eve"] if scenario_id == "adam-eve" else ["james", "catherine"]
    for side in sides:
        for stage in range(5):
            (transcripts_dir / f"{side}-stage{stage}.md").write_text(
                f"# {side.capitalize()} Stage {stage} Transcript\n\n"
                f"- side: `{side}`\n"
                f"- stage: `{stage}`\n"
                f"- visible_cta_state: mock\n\n"
                f"## Events\n\n"
                f"1. [{side.capitalize()}] Mock message for stage {stage}.\n"
                f"2. [MWF] Mock facilitator response.\n",
                encoding="utf-8",
            )


def write_report(run_dir: Path, report: EvalReport) -> Path:
    """Write evaluation report to the run directory."""
    path = run_dir / "eval-report.json"
    path.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def write_review(run_dir: Path, review: LeadAgentReview) -> Path:
    """Write lead agent review to the run directory."""
    # Write structured JSON
    json_path = run_dir / "lead-review.json"
    json_path.write_text(json.dumps(review.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # Write human-readable markdown
    md_path = run_dir / "lead-review.md"
    md_lines = [
        f"# Lead Agent Review — {review.scenario_id} (Iteration {review.iteration})",
        "",
        f"**Generated:** {review.timestamp}",
        "",
        "## Summary",
        "",
        review.summary,
        "",
    ]
    if review.tasks:
        md_lines.extend(["## Improvement Tasks", ""])
        for i, task in enumerate(review.tasks, 1):
            md_lines.extend([
                f"### {i}. [{task.domain}] {task.title}",
                "",
                f"**Priority:** {task.priority} | **Owner:** {task.owner} | **Complexity:** {task.estimated_complexity}",
                "",
                task.description,
                "",
            ])
            if task.acceptance_criteria:
                md_lines.append("**Acceptance criteria:**")
                for ac in task.acceptance_criteria:
                    md_lines.append(f"- {ac}")
                md_lines.append("")
            if task.related_files:
                md_lines.append(f"**Related files:** {', '.join(task.related_files)}")
                md_lines.append("")
    else:
        md_lines.extend(["## Status", "", "All domains passing. No improvement tasks needed.", ""])

    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    return json_path


def run_eval_loop(
    scenario_id: str,
    config: dict[str, Any] | None = None,
    dry_run: bool = False,
    max_iterations: int | None = None,
) -> tuple[EvalReport, LeadAgentReview]:
    """Run the full evaluation loop: simulate, score, review, iterate.

    Returns the final report and review after convergence or max iterations.
    """
    cfg = config or load_config()
    target = cfg.get("convergence_target", DEFAULT_CONVERGENCE_TARGET)
    max_iter = max_iterations or cfg.get("max_iterations", DEFAULT_MAX_ITERATIONS)
    score_history: list[dict[str, float]] = []

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    loop_dir = RUNS_ROOT / f"{stamp}-{scenario_id}-eval-loop"
    loop_dir.mkdir(parents=True, exist_ok=True)

    final_report: EvalReport | None = None
    final_review: LeadAgentReview | None = None

    for iteration in range(1, max_iter + 1):
        iter_dir = loop_dir / f"iter-{iteration:02d}"
        iter_dir.mkdir(parents=True, exist_ok=True)

        # 1. Simulate
        run_dir = iter_dir / "run"
        run_simulation(scenario_id, cfg, run_dir, dry_run=dry_run)

        # 2. Score
        report = score_run(run_dir, scenario_id, cfg)
        report.iteration = iteration
        write_report(run_dir, report)

        # 3. Review
        gold_profile = load_gold_profile(scenario_id)
        review = lead_agent_review(report, gold_profile, score_history)
        write_review(run_dir, review)

        score_history = review.score_history
        final_report = report
        final_review = review

        if report.converged:
            break

    # Write loop summary
    if final_report and final_review:
        summary = {
            "scenario_id": scenario_id,
            "iterations_run": final_report.iteration,
            "max_iterations": max_iter,
            "converged": final_report.converged,
            "final_overall_score": final_report.overall_score,
            "convergence_target": target,
            "final_domain_scores": {d.domain: d.score for d in final_report.domains},
            "tasks_remaining": len(final_review.tasks),
            "score_history": score_history,
        }
        (loop_dir / "loop-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    assert final_report is not None
    assert final_review is not None
    return final_report, final_review


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Self-refining evaluation loop for Meet Without Fear",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # run — full loop
    run_parser = sub.add_parser("run", help="Run the full evaluation loop")
    run_parser.add_argument("--scenario", required=True, help="Scenario ID (e.g., adam-eve)")
    run_parser.add_argument("--dry-run", action="store_true", help="Use mock simulation data")
    run_parser.add_argument("--max-iterations", type=int, help="Override max iterations from config")
    run_parser.add_argument("--config", type=Path, help="Path to eval loop config")

    # score — score existing run
    score_parser = sub.add_parser("score", help="Score an existing run directory")
    score_parser.add_argument("--run-dir", type=Path, required=True, help="Path to run directory")
    score_parser.add_argument("--scenario", required=True, help="Scenario ID")
    score_parser.add_argument("--config", type=Path, help="Path to eval loop config")

    # review — review existing scores
    review_parser = sub.add_parser("review", help="Run lead agent review on existing scores")
    review_parser.add_argument("--run-dir", type=Path, required=True, help="Path to run directory with eval-report.json")
    review_parser.add_argument("--scenario", required=True, help="Scenario ID")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "run":
        config = load_config(args.config) if args.config else None
        report, review = run_eval_loop(
            scenario_id=args.scenario,
            config=config,
            dry_run=args.dry_run,
            max_iterations=args.max_iterations,
        )
        print(review.summary)
        if review.tasks:
            print(f"\n{len(review.tasks)} improvement task(s) created.")
        if report.converged:
            print(f"\nConverged at iteration {report.iteration}!")
        else:
            print(f"\nDid not converge after {report.iteration} iteration(s).")

    elif args.command == "score":
        config = load_config(args.config) if args.config else None
        report = score_run(args.run_dir, args.scenario, config)
        path = write_report(args.run_dir, report)
        print(f"Report written to {path}")
        for d in report.domains:
            status = "PASS" if d.score >= report.convergence_target else "FAIL"
            print(f"  {d.domain}: {d.score}/100 [{status}]")
        print(f"Overall: {report.overall_score}/100")

    elif args.command == "review":
        report_path = args.run_dir / "eval-report.json"
        if not report_path.exists():
            print(f"No eval-report.json found in {args.run_dir}; run 'score' first.", file=sys.stderr)
            sys.exit(1)
        report_data = json.loads(report_path.read_text(encoding="utf-8"))
        domains = [
            DomainScore(
                domain=d_data["domain"],
                score=d_data["score"],
                details=d_data.get("details", ""),
                per_stage=d_data.get("per_stage"),
                issues=d_data.get("issues", []),
            )
            for d_data in report_data.get("domains", {}).values()
        ]
        report = EvalReport(
            scenario_id=report_data["scenario_id"],
            iteration=report_data.get("iteration", 0),
            timestamp=report_data.get("timestamp", ""),
            domains=domains,
            overall_score=report_data["overall_score"],
            converged=report_data.get("converged", False),
            convergence_target=report_data.get("convergence_target", DEFAULT_CONVERGENCE_TARGET),
        )
        gold_profile = load_gold_profile(args.scenario)
        review = lead_agent_review(report, gold_profile)
        path = write_review(args.run_dir, review)
        print(review.summary)


if __name__ == "__main__":
    main()
