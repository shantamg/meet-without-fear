#!/usr/bin/env python3
"""Autonomous MWF gold-alignment loop runner.

The loop is intentionally conservative:
- cost caps are checked before each moment run;
- dry-run mode never opens PRs;
- prompt edits are versioned proposals, not direct edits to stage-prompts.ts.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mwf_moment_eval as mme  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = REPO_ROOT / "eval/alignment-loop-config.yaml"
ALIGNMENT_RUNS_ROOT = REPO_ROOT / "eval/alignment-runs"
DEFAULT_LABEL = "loop:auto-improvement"


class AlignmentLoopError(RuntimeError):
    pass


@dataclass
class PrRequest:
    moment_id: str
    stage_label: str
    timestamp: str
    delta: float
    body: str
    artifact_paths: list[Path]
    borderline: bool
    label: str = DEFAULT_LABEL

    @property
    def branch_name(self) -> str:
        return f"loop/alignment-{self.moment_id}-{self.timestamp}"

    @property
    def title(self) -> str:
        sign = "+" if self.delta >= 0 else ""
        return f"loop: improve {self.stage_label} prompt for {self.moment_id} ({sign}{self.delta:.2f} overall)"


def load_config(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AlignmentLoopError(f"Config must be JSON-compatible YAML: {path}: {exc}") from exc


def run_command(
    cmd: list[str],
    *,
    cwd: Path = REPO_ROOT,
    input_text: str | None = None,
    timeout: int = 120,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=timeout,
    )


def git_current_branch() -> str:
    result = run_command(["git", "branch", "--show-current"])
    if result.returncode != 0:
        raise AlignmentLoopError(result.stderr.strip() or "Unable to determine git branch")
    return result.stdout.strip()


def stage_label_for(moment: dict[str, Any]) -> str:
    stages = moment.get("stages", [])
    if len(stages) == 1:
        return f"stage-{stages[0]}"
    return "transition-" + "-to-".join(str(stage) for stage in stages)


def todays_recorded_spend_cents(now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    total = 0.0
    for summary_json in ALIGNMENT_RUNS_ROOT.glob("*/summary.json"):
        try:
            summary = json.loads(summary_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        started_at = str(summary.get("started_at", ""))
        if started_at.startswith(now.strftime("%Y-%m-%d")):
            total += float(summary.get("cost_spent_cents", 0))
    return round(total, 4)


def estimate_moment_cost_cents(config: dict[str, Any], moment: dict[str, Any]) -> float:
    configured = config.get("cost_caps", {}).get("estimated_judge_cost_cents")
    if configured is not None:
        return float(configured)
    state = mme.seed_state(moment)
    return mme.estimate_judge_cost_cents(moment, mme.default_ai_response(state))


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def write_summary(run_dir: Path, summary: dict[str, Any]) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# MWF Alignment Loop Summary",
        "",
        f"Started: `{summary['started_at']}`",
        f"Mode: `{'dry-run' if summary['dry_run'] else 'live'}`",
        f"Verdict: `{summary['verdict']}`",
        f"Cost spent: `{summary['cost_spent_cents']}` cents",
        "",
        "## Moments",
    ]
    for item in summary["moments"]:
        lines.append(
            f"- `{item['id']}`: {item['status']} score={item.get('score')} "
            f"threshold={item.get('threshold')} cost={item.get('estimated_cost_cents')}c"
        )
        if item.get("run_dir"):
            lines.append(f"  - Run artifacts: `{item['run_dir']}`")
        if item.get("improvement_plan"):
            lines.append(f"  - Improvement plan: `{item['improvement_plan']}`")
        if item.get("pr"):
            lines.append(f"  - PR: `{item['pr'].get('url') or item['pr'].get('title')}`")
        if item.get("error"):
            lines.append(f"  - Error: {item['error']}")
    if summary.get("aborted_reason"):
        lines.extend(["", "## Abort", "", summary["aborted_reason"]])
    (run_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def read_score(run_dir: Path) -> dict[str, Any]:
    return json.loads((run_dir / "score.json").read_text(encoding="utf-8"))


def create_alignment_pr(request: PrRequest, *, dry_run: bool = False) -> dict[str, Any]:
    if dry_run:
        return {
            "dry_run": True,
            "branch": request.branch_name,
            "title": request.title,
            "label": request.label,
            "draft": request.borderline,
            "body": request.body,
        }

    branch = git_current_branch()
    if branch in {"main", "master"}:
        raise AlignmentLoopError("Refusing to open loop PR from a protected branch")

    created_branch = False
    try:
        checkout = run_command(["git", "switch", "-c", request.branch_name])
        if checkout.returncode != 0:
            raise AlignmentLoopError(checkout.stderr.strip() or checkout.stdout.strip())
        created_branch = True
        paths = [str(path.relative_to(REPO_ROOT)) for path in request.artifact_paths if path.exists()]
        if not paths:
            raise AlignmentLoopError("No alignment artifacts exist to commit")
        add = run_command(["git", "add", *paths])
        if add.returncode != 0:
            raise AlignmentLoopError(add.stderr.strip() or add.stdout.strip())
        commit = run_command(["git", "commit", "-m", request.title])
        if commit.returncode != 0:
            raise AlignmentLoopError(commit.stderr.strip() or commit.stdout.strip())
        push = run_command(["git", "push", "-u", "origin", request.branch_name])
        if push.returncode != 0:
            raise AlignmentLoopError(push.stderr.strip() or push.stdout.strip())

        body_file = ALIGNMENT_RUNS_ROOT / f"{request.branch_name.replace('/', '-')}-body.md"
        body_file.parent.mkdir(parents=True, exist_ok=True)
        body_file.write_text(request.body, encoding="utf-8")
        pr_cmd = ["gh", "pr", "create", "--title", request.title, "--body-file", str(body_file)]
        if request.borderline:
            pr_cmd.append("--draft")
        create = run_command(pr_cmd)
        if create.returncode != 0:
            raise AlignmentLoopError(create.stderr.strip() or create.stdout.strip())
        url = create.stdout.strip().splitlines()[-1]
        label = run_command(["gh", "pr", "edit", url, "--add-label", request.label])
        if label.returncode != 0:
            raise AlignmentLoopError(label.stderr.strip() or label.stdout.strip())
        return {"url": url, "branch": request.branch_name, "title": request.title, "label": request.label, "draft": request.borderline}
    finally:
        if created_branch:
            run_command(["git", "switch", branch])


def build_pr_body(moment_id: str, run_dir: Path, score: dict[str, Any], improvement_plan: Path | None) -> str:
    plan_text = improvement_plan.read_text(encoding="utf-8") if improvement_plan and improvement_plan.exists() else "No improvement plan was written."
    return "\n".join(
        [
            plan_text,
            "",
            "## Run Artifacts",
            "",
            f"- Run directory: `{display_path(run_dir)}`",
            f"- Score: `{score.get('overall_score')}`",
            f"- Verdict: `{score.get('verdict')}`",
            "",
            "## Score Delta",
            "",
            f"- Moment `{moment_id}` below threshold; candidate revision generated by alignment loop.",
        ]
    )


def pr_ref(pr: dict[str, Any]) -> str:
    return str(pr.get("url") or pr.get("branch") or pr.get("title") or "")


def run_outer_loop_validation(
    *,
    pr: dict[str, Any],
    moment_id: str,
    prompt_version: Path,
    timestamp: str,
    args: argparse.Namespace,
) -> dict[str, Any]:
    run_dir = ALIGNMENT_RUNS_ROOT / timestamp / "outer-loop" / moment_id
    run_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, Any] = {
        "status": "skipped" if args.skip_outer_loop else "running",
        "run_dir": display_path(run_dir),
        "baseline_score": args.outer_loop_baseline_score,
        "regression_threshold": 0.5,
        "prompt_version": display_path(prompt_version),
    }
    (run_dir / "outer-loop.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.skip_outer_loop:
        return result

    if args.mock_outer_loop_score is not None:
        score = {
            "overall_score": float(args.mock_outer_loop_score),
            "verdict": "mock_regression" if args.outer_loop_baseline_score - float(args.mock_outer_loop_score) > 0.5 else "mock_pass",
        }
        (run_dir / "score.json").write_text(json.dumps(score, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        command: list[str] = []
        returncode = 0
        stderr = ""
    else:
        command = [
            sys.executable,
            str(REPO_ROOT / "scripts/mwf_gold_loop.py"),
            "run",
            "--scenario",
            args.outer_loop_scenario,
            "--max-iterations",
            "1",
            "--target-score",
            str(args.outer_loop_target_score),
            "--improvement-mode",
            "proposal",
            "--no-improve-on-final-fail",
        ]
        if args.outer_loop_skip_service_preflight:
            command.append("--skip-service-preflight")
        env = os.environ.copy()
        env["MWF_ALIGNMENT_PROMPT_VERSION"] = str(prompt_version)
        completed = run_command(command, timeout=args.outer_loop_timeout, env=env)
        (run_dir / "stdout.log").write_text(completed.stdout, encoding="utf-8")
        (run_dir / "stderr.log").write_text(completed.stderr, encoding="utf-8")
        command = completed.args if isinstance(completed.args, list) else command
        returncode = completed.returncode
        stderr = completed.stderr
        score = latest_outer_loop_score()
        if score is None:
            score = {"overall_score": 0.0, "verdict": "missing_score"}

    overall = float(score.get("overall_score", 0.0))
    regressed = args.outer_loop_baseline_score - overall > 0.5
    result.update(
        {
            "status": "regressed" if regressed else "passed",
            "command": command,
            "returncode": returncode,
            "stderr": stderr,
            "score": score,
            "regressed": regressed,
        }
    )

    ref = pr_ref(pr)
    if regressed:
        draft = run_command(["gh", "pr", "ready", "--undo", ref])
        comment_text = f"E2E regression detected — see {display_path(run_dir)}."
        comment = run_command(["gh", "pr", "comment", ref, "--body", comment_text])
        result["pr_action"] = {
            "converted_to_draft": draft.returncode == 0,
            "commented": comment.returncode == 0,
            "comment": comment_text,
        }
    else:
        ready = run_command(["gh", "pr", "ready", ref])
        result["pr_action"] = {"marked_ready": ready.returncode == 0}

    (run_dir / "outer-loop.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def latest_outer_loop_score() -> dict[str, Any] | None:
    candidates = sorted(ALIGNMENT_RUNS_ROOT.glob("**/score.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
    return None


def run_alignment_loop(args: argparse.Namespace) -> dict[str, Any]:
    config = load_config(args.config)
    timestamp = args.timestamp or datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_dir = ALIGNMENT_RUNS_ROOT / timestamp
    caps = config.get("cost_caps", {})
    per_run_cap = float(args.per_run_cap_cents if args.per_run_cap_cents is not None else caps.get("per_run_cents", 500))
    per_day_cap = float(args.per_day_cap_cents if args.per_day_cap_cents is not None else caps.get("per_day_cents", 2000))
    day_spend = todays_recorded_spend_cents()
    spent = 0.0
    summary: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "timestamp": timestamp,
        "dry_run": args.dry_run,
        "config": str(args.config.relative_to(REPO_ROOT) if args.config.is_relative_to(REPO_ROOT) else args.config),
        "verdict": "running",
        "cost_spent_cents": 0.0,
        "per_run_cap_cents": per_run_cap,
        "per_day_cap_cents": per_day_cap,
        "day_spend_before_cents": day_spend,
        "moments": [],
    }
    write_summary(run_dir, summary)

    try:
        for item in config.get("moments", []):
            moment_id = item["id"] if isinstance(item, dict) else str(item)
            threshold = float((item or {}).get("threshold", args.target_score) if isinstance(item, dict) else args.target_score)
            moment = mme.load_moment(moment_id)
            estimated_cost = estimate_moment_cost_cents(config, moment)
            if spent + estimated_cost > per_run_cap:
                raise AlignmentLoopError(
                    f"Per-run cost cap would be exceeded before {moment_id}: "
                    f"{spent + estimated_cost:.2f}c > {per_run_cap:.2f}c"
                )
            if day_spend + spent + estimated_cost > per_day_cap:
                raise AlignmentLoopError(
                    f"Per-day cost cap would be exceeded before {moment_id}: "
                    f"{day_spend + spent + estimated_cost:.2f}c > {per_day_cap:.2f}c"
                )
            spent = round(spent + estimated_cost, 4)

            run_args = argparse.Namespace(
                command="run",
                moment=moment_id,
                real=args.real,
                target_score=threshold,
                max_iterations=1,
                mock_judge=args.mock_judge,
                max_judge_cost_cents=max(estimated_cost, 0.01),
                mock_response=args.mock_response,
                no_improve=True,
                improvement_mode="proposal",
                allow_protected_branch_patch=True,
            )
            created = mme.run_loop(run_args)
            moment_run_dir = created[-1]
            score = read_score(moment_run_dir)
            row: dict[str, Any] = {
                "id": moment_id,
                "status": "scored",
                "threshold": threshold,
                "score": score.get("overall_score"),
                "verdict": score.get("verdict"),
                "run_dir": display_path(moment_run_dir),
                "estimated_cost_cents": estimated_cost,
            }
            if args.real:
                baseline_path = mme.ensure_initial_baseline(
                    moment,
                    score,
                    source=f"alignment_loop_initial:{timestamp}",
                )
                if baseline_path is not None:
                    row["baseline_initialized"] = display_path(baseline_path)
            if float(score.get("overall_score", 0)) < threshold:
                row["status"] = "below_threshold"
                if args.dry_run:
                    row["improver"] = "skipped_in_dry_run"
                else:
                    try:
                        version = mme.run_improver(
                            moment_run_dir,
                            moment,
                            score,
                            allow_protected_branch_patch=True,
                            real=args.real,
                            mock_judge=args.mock_judge,
                        )
                        plan = moment_run_dir / "improvement-plan.md"
                        row["improvement_plan"] = display_path(plan)
                        row["prompt_version"] = display_path(version)
                        pr_request = PrRequest(
                            moment_id=moment_id,
                            stage_label=stage_label_for(moment),
                            timestamp=timestamp,
                            delta=float(score.get("delta", {}).get("overall_score", 0.0)),
                            body=build_pr_body(moment_id, moment_run_dir, score, plan),
                            artifact_paths=[version, plan, moment_run_dir / "score.json", moment_run_dir / "run.json"],
                            borderline=threshold - float(score.get("overall_score", 0)) <= 0.5,
                        )
                        row["pr"] = create_alignment_pr(pr_request, dry_run=False)
                        row["outer_loop"] = run_outer_loop_validation(
                            pr=row["pr"],
                            moment_id=moment_id,
                            prompt_version=version,
                            timestamp=timestamp,
                            args=args,
                        )
                        row["status"] = "pr_opened"
                    except Exception as exc:  # keep loop transparent instead of swallowing gate failures
                        row["status"] = "improver_rejected"
                        row["error"] = str(exc)
            summary["moments"].append(row)
            summary["cost_spent_cents"] = spent
            write_summary(run_dir, summary)

        summary["verdict"] = "complete"
        summary["cost_spent_cents"] = spent
        write_summary(run_dir, summary)
        return summary
    except AlignmentLoopError as exc:
        summary["verdict"] = "aborted"
        summary["aborted_reason"] = str(exc)
        summary["cost_spent_cents"] = spent
        write_summary(run_dir, summary)
        raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the autonomous MWF gold-alignment loop.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--dry-run", action="store_true", help="Run scoring and summaries without improver writes or PR creation")
    parser.add_argument("--real", action="store_true", help="Use real backend path for moment scoring")
    judge = parser.add_mutually_exclusive_group()
    judge.add_argument("--mock-judge", dest="mock_judge", action="store_true", default=True, help="Use deterministic local judge scoring")
    judge.add_argument("--real-judge", dest="mock_judge", action="store_false", help="Use the LLM judge path")
    parser.add_argument("--target-score", type=float, default=4.0)
    parser.add_argument("--per-run-cap-cents", type=float)
    parser.add_argument("--per-day-cap-cents", type=float)
    parser.add_argument("--mock-response")
    parser.add_argument("--timestamp", help="Stable timestamp for tests")
    parser.add_argument("--skip-outer-loop", action="store_true", help="Open PRs without running the slow E2E outer loop")
    parser.add_argument("--mock-outer-loop-score", type=float, help="Use a deterministic outer-loop score instead of invoking mwf_gold_loop.py")
    parser.add_argument("--outer-loop-baseline-score", type=float, default=4.0)
    parser.add_argument("--outer-loop-target-score", type=float, default=4.0)
    parser.add_argument("--outer-loop-scenario", default="adam-eve")
    parser.add_argument("--outer-loop-timeout", type=int, default=3600)
    parser.add_argument("--outer-loop-skip-service-preflight", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        summary = run_alignment_loop(args)
        print(ALIGNMENT_RUNS_ROOT.joinpath(summary["timestamp"], "summary.md").relative_to(REPO_ROOT))
        return 0
    except AlignmentLoopError as exc:
        print(f"mwf_alignment_loop: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
