#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Match the pattern used by test_mwf_gold_loop.py so the module imports work
# whether the test is launched as `python3 scripts/test_mwf_moment_eval.py` or
# `python3 -m unittest scripts.test_mwf_moment_eval` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mwf_moment_eval as mme  # noqa: E402
import mwf_alignment_loop as loop  # noqa: E402
import mwf_add_gold_example as add_gold  # noqa: E402
import mwf_alignment_status as status  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
MOMENT_ID = "stage-4-no-shared-agreement-closure"
REAL_MOMENT_ID = "stage-1-fact-reflection"
PHASE1_MOMENT_IDS = [
    "stage-1-emotional-pivot",
    "stage-2-empathy-validation",
    "stage-2-refinement-round",
    "stage-3-mutual-reveal",
    "stage-3-validity-gate",
    "stage-4-willingness-selection",
    "stage-4-no-shared-agreement",
    "transition-stage-2-to-3",
]
TRAJECTORY_MOMENT_IDS = [
    "stage-1-trajectory-fact-to-handoff",
    "stage-2-trajectory-empathy-cycle",
    "stage-3-trajectory-needs-flow",
    "stage-4-trajectory-willingness-to-close",
]


class TestYamlParsing(unittest.TestCase):
    def test_yaml_parsing_complete(self) -> None:
        moment = mme.load_moment(MOMENT_ID)

        required = {"id", "stages", "description", "seed", "trigger", "capture", "rubric", "improver"}
        self.assertTrue(required.issubset(moment.keys()))
        self.assertTrue(
            moment["rubric"]["reference_transcript_lines"].endswith("james-catherine.md:1257-1306"),
            moment["rubric"]["reference_transcript_lines"],
        )
        self.assertGreaterEqual(len(moment["rubric"]["dimensions"]), 2)
        self.assertEqual(moment["rubric"]["overall_pass_threshold"], 4.0)
        self.assertTrue(
            any(item["id"] == "no_invented_shared_agreement" for item in moment["rubric"]["hard_invariants"])
        )

    def test_stage1_real_moment_yaml_parsing_complete(self) -> None:
        moment = mme.load_moment(REAL_MOMENT_ID)

        self.assertEqual(moment["id"], REAL_MOMENT_ID)
        self.assertEqual(moment["rubric"]["reference_transcript_lines"], "docs/product/source-material/golden-transcripts/adam-eve.md:43-67")
        self.assertEqual(moment["rubric"]["judge_prompt"], "eval/scorer/judge-prompts/stage-1-fact-reflection.md")
        self.assertTrue(
            {"no_stage_jump_content", "no_advice_or_solutioning", "no_grading_of_user"}.issubset(
                {item["id"] for item in moment["rubric"]["hard_invariants"]}
            )
        )

    def test_phase1_library_moments_are_authored_with_required_shape(self) -> None:
        for moment_id in PHASE1_MOMENT_IDS:
            with self.subTest(moment_id=moment_id):
                moment = mme.load_moment(moment_id)
                self.assertEqual(moment["id"], moment_id)
                self.assertEqual(len(moment["rubric"]["dimensions"]), 3)
                self.assertGreaterEqual(len(moment["rubric"]["hard_invariants"]), 2)
                judge_prompt = REPO_ROOT / moment["rubric"]["judge_prompt"]
                self.assertTrue(judge_prompt.exists(), f"{judge_prompt} missing")
                self.assertIn("expected_response", moment)

    def test_list_moments_includes_phase1_library(self) -> None:
        moment_ids = set(mme.list_moments())
        for moment_id in PHASE1_MOMENT_IDS:
            self.assertIn(moment_id, moment_ids)

    def test_trajectory_moment_schema_validation(self) -> None:
        for moment_id in TRAJECTORY_MOMENT_IDS:
            with self.subTest(moment_id=moment_id):
                moment = mme.load_moment(moment_id)
                self.assertIn("trajectory", moment)
                self.assertGreaterEqual(len(moment["trajectory"]), 3)
                self.assertEqual(len(moment["rubric"]["dimensions"]), 3)

    def test_malformed_trajectory_rejected(self) -> None:
        moment = mme.load_moment("stage-1-trajectory-fact-to-handoff")
        malformed = dict(moment)
        malformed["trajectory"] = [{"user_turn": "missing ai"}]

        with self.assertRaises(mme.MomentEvalError):
            mme.validate_moment(malformed)


class TestSeederIdempotence(unittest.TestCase):
    def test_seeder_idempotence_clean_session_ids(self) -> None:
        moment = mme.load_moment(MOMENT_ID)
        first = mme.seed_state(moment)
        second = mme.seed_state(moment)

        self.assertNotEqual(first.session_id, second.session_id)
        self.assertEqual(first.rows, second.rows)
        self.assertEqual(first.rows["participants"], 2)
        self.assertGreaterEqual(first.rows["stage4Proposals"], 2)
        self.assertTrue(any(s["choice"] == "WILLING" for s in first.selections))
        self.assertTrue(any(s["choice"] == "NOT_WILLING" for s in first.selections))


class TestRunnerHappyPath(unittest.TestCase):
    def test_runner_happy_path_with_mocked_backend(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with mock.patch.object(mme, "RUNS_ROOT", tmp_path):
                args = mme.build_parser().parse_args(
                    ["run", "--moment", MOMENT_ID, "--max-iterations", "1", "--no-improve"]
                )
                created = mme.run_loop(args)

            self.assertEqual(len(created), 1)
            run_dir = created[0]
            for name in [
                "seed-state.json",
                "ai-response.md",
                "state-delta.json",
                "score.json",
                "score-rationale.md",
                "run.json",
            ]:
                self.assertTrue((run_dir / name).exists(), f"{name} missing")


class TestScorer(unittest.TestCase):
    def test_scorer_schema_validation(self) -> None:
        moment = mme.load_moment(MOMENT_ID)
        score = mme.score_response(
            moment,
            "There is no overlap, so no shared agreement. Your individual commitment stands.",
        )

        self.assertIsInstance(score["overall_score"], float)
        self.assertIsInstance(score["dimensions"], dict)
        self.assertIsInstance(score["hard_invariants"], list)
        self.assertIn(score["verdict"], {"eval_pass", "eval_warn", "eval_fail"})
        for item in score["hard_invariants"]:
            self.assertTrue({"id", "pass"}.issubset(item.keys()))

    def test_hard_invariant_failure_overrides_scores(self) -> None:
        moment = mme.load_moment(MOMENT_ID)
        score = mme.score_response(
            moment,
            "You both agreed to the pause agreement. Your shared agreement is in place.",
        )

        invariant = next(
            item for item in score["hard_invariants"] if item["id"] == "no_invented_shared_agreement"
        )
        self.assertFalse(invariant["pass"])
        self.assertEqual(score["verdict"], "eval_fail")

    def test_stage1_hard_invariant_failure_overrides_mock_judge_scores(self) -> None:
        moment = mme.load_moment(REAL_MOMENT_ID)
        score = mme.score_response(
            moment,
            "You should try a strategy and ask Eve what she needs next.",
            real=True,
            mock_judge=True,
        )

        self.assertEqual(score["verdict"], "eval_fail")
        self.assertTrue(any(not item["pass"] for item in score["hard_invariants"]))

    def test_stage1_advice_invariant_catches_what_different_looks_like(self) -> None:
        self.assertFalse(
            mme.evaluate_stage1_hard_invariant(
                "no_advice_or_solutioning",
                'What does "being different" look like in your head?',
            )
        )

    def test_phase1_expected_responses_pass_mock_scoring(self) -> None:
        for moment_id in PHASE1_MOMENT_IDS:
            with self.subTest(moment_id=moment_id):
                moment = mme.load_moment(moment_id)
                state = mme.seed_state(moment)
                score = mme.score_response(moment, mme.default_ai_response(state))
                self.assertEqual(score["verdict"], "eval_pass", score)

    def test_phase1_hard_invariants_have_negative_cases(self) -> None:
        cases = {
            "stage-1-emotional-pivot": "Great. You feel fully heard, so now write an empathy attempt and move to agreement.",
            "stage-2-empathy-validation": "Give a verdict: yes or no, is it accurate or not? Then we can make proposals.",
            "stage-2-refinement-round": "Here is the corrected version I fixed for you. Now name your needs.",
            "stage-3-mutual-reveal": "You both have a shared need and common ground. The overlap is obvious.",
            "stage-3-validity-gate": "The overlap is clear, so we can rush into Stage 4 proposals now.",
            "stage-4-willingness-selection": "You should have picked more. You owe them a shared agreement.",
            "stage-4-no-shared-agreement": "You both agreed to the pause agreement. Your shared agreement is in place.",
            "transition-stage-2-to-3": "What do you need from Eve? You should try an action step next.",
        }
        for moment_id, bad_response in cases.items():
            with self.subTest(moment_id=moment_id):
                moment = mme.load_moment(moment_id)
                score = mme.score_response(moment, bad_response)
                self.assertEqual(score["verdict"], "eval_fail", score)
                self.assertTrue(any(not item["pass"] for item in score["hard_invariants"]))

    def test_trajectory_expected_responses_pass_mock_scoring(self) -> None:
        for moment_id in TRAJECTORY_MOMENT_IDS:
            with self.subTest(moment_id=moment_id):
                moment = mme.load_moment(moment_id)
                state = mme.seed_state(moment)
                score = mme.score_response(moment, mme.default_ai_response(state))
                self.assertEqual(score["verdict"], "eval_pass", score)


class TestImprover(unittest.TestCase):
    def test_improver_invocation_and_version_tracking(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            run_dir = tmp_path / "run"
            run_dir.mkdir()
            with mock.patch.object(mme, "PROMPT_VERSIONS_ROOT", tmp_path / "prompt-versions"):
                moment = mme.load_moment(MOMENT_ID)
                score = mme.score_response(moment, "You both agreed to a shared agreement.")
                version = mme.run_improver(
                    run_dir, moment, score, allow_protected_branch_patch=True
                )

            self.assertTrue(version.exists())
            self.assertEqual(version.parent, tmp_path / "prompt-versions/mwf/stage-4")
            self.assertTrue((run_dir / "improvement-plan.md").exists())
            self.assertTrue((run_dir / "patch-summary.md").exists())

    def test_stage1_improver_writes_stage1_version_not_stage4(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            run_dir = tmp_path / "run"
            run_dir.mkdir()
            with mock.patch.object(mme, "PROMPT_VERSIONS_ROOT", tmp_path / "prompt-versions"):
                moment = mme.load_moment(REAL_MOMENT_ID)
                score = mme.score_response(moment, "Thin reflection.", real=True, mock_judge=True)
                version = mme.run_improver(run_dir, moment, score, allow_protected_branch_patch=True)

            self.assertEqual(version.parent, tmp_path / "prompt-versions/mwf/stage-1")
            self.assertIn("Stage 4 remains untouched", version.read_text(encoding="utf-8"))

    def test_branch_protection_refuses_main_for_patch_mode(self) -> None:
        with mock.patch.object(mme, "git_branch", return_value="main"):
            with self.assertRaises(mme.MomentEvalError) as ctx:
                mme.ensure_patch_branch(False)
        self.assertIn("Refusing patch mode on protected branch 'main'", str(ctx.exception))

    def test_cross_moment_regularization_keeps_non_regressing_revision(self) -> None:
        moment = mme.load_moment("stage-2-empathy-validation")
        result = mme.evaluate_cross_moment_regularization(moment)

        self.assertTrue(result["pass"], result)
        self.assertGreaterEqual(result["same_stage_moment_count"], 1)

    def test_cross_moment_regularization_rejects_score_regression(self) -> None:
        moment = mme.load_moment("stage-2-empathy-validation")
        result = mme.evaluate_cross_moment_regularization(
            moment,
            {"stage-2-refinement-round": "Generic response that misses the required refinement details."},
        )

        self.assertFalse(result["pass"])
        failed = [item for item in result["results"] if item["moment"] == "stage-2-refinement-round"][0]
        self.assertIn("below threshold", failed["reason"])

    def test_cross_moment_regularization_rejects_hard_invariant_regression(self) -> None:
        moment = mme.load_moment("stage-3-validity-gate")
        result = mme.evaluate_cross_moment_regularization(
            moment,
            {"stage-3-mutual-reveal": "You both have common ground and overlap, so skip noticing."},
        )

        self.assertFalse(result["pass"])
        failed = [item for item in result["results"] if item["moment"] == "stage-3-mutual-reveal"][0]
        self.assertIn("hard invariant failed", failed["reason"])

    def test_cross_moment_regularization_uses_real_judge_when_requested(self) -> None:
        moment = mme.load_moment("stage-2-empathy-validation")
        judged = (
            {
                "dimensions": {
                    "integrates_feedback": {"score": 4.5, "rationale": "ok"},
                    "keeps_thread": {"score": 4.5, "rationale": "ok"},
                    "non_corrective_tone": {"score": 4.5, "rationale": "ok"},
                    "honors_empathy_completion": {"score": 4.5, "rationale": "ok"},
                    "orients_next_stage": {"score": 4.5, "rationale": "ok"},
                    "no_premature_needs_extraction": {"score": 4.5, "rationale": "ok"},
                    "review_invited": {"score": 4.5, "rationale": "ok"},
                    "feedback_integrated": {"score": 4.5, "rationale": "ok"},
                    "validation_honored": {"score": 4.5, "rationale": "ok"},
                }
            },
            {"model": "mock"},
        )
        with mock.patch.object(mme, "score_with_real_judge", return_value=judged) as real_judge:
            result = mme.evaluate_cross_moment_regularization(moment, real=True, mock_judge=False)

        self.assertTrue(result["pass"], result)
        self.assertGreaterEqual(real_judge.call_count, 1)

    def test_improvement_plan_logs_cross_moment_evaluation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            run_dir = tmp_path / "run"
            run_dir.mkdir()
            with mock.patch.object(mme, "PROMPT_VERSIONS_ROOT", tmp_path / "prompt-versions"):
                moment = mme.load_moment("stage-2-empathy-validation")
                score = mme.score_response(moment, "Thin response.")
                mme.run_improver(run_dir, moment, score, allow_protected_branch_patch=True)

            plan = (run_dir / "improvement-plan.md").read_text(encoding="utf-8")
            self.assertIn("## Cross-Moment Regularization", plan)
            self.assertIn("stage-2-refinement-round", plan)


class TestRealModePlumbing(unittest.TestCase):
    def test_real_seed_uses_helper_boundary(self) -> None:
        fake_seed = {"sessionId": "cmomentreal123", "rows": {"Session": 1}, "messages": [], "stageProgress": []}
        with mock.patch.object(mme, "run_real_helper", return_value=fake_seed) as helper:
            result = mme.real_seed_state(mme.load_moment(REAL_MOMENT_ID))

        self.assertEqual(result["sessionId"], "cmomentreal123")
        helper.assert_called_once_with("seed")

    def test_cost_guard_refuses_before_real_judge(self) -> None:
        moment = mme.load_moment(REAL_MOMENT_ID)
        args = mme.build_parser().parse_args(
            [
                "run",
                "--moment",
                REAL_MOMENT_ID,
                "--real",
                "--mock-response",
                "A local response that should never reach the judge.",
                "--max-judge-cost-cents",
                "0",
            ]
        )
        args.mock_judge = False

        with mock.patch.object(mme, "real_seed_state", return_value={"sessionId": "cmomentreal123"}), \
             mock.patch.object(mme, "score_with_real_judge") as judge:
            with self.assertRaises(mme.MomentEvalError) as ctx:
                mme.run_real_iteration(moment, args, None, None)

        self.assertIn("Judge cost guard refused call", str(ctx.exception))
        judge.assert_not_called()

    def test_real_mode_flag_defaults_to_real_judge(self) -> None:
        args = mme.build_parser().parse_args(["run", "--moment", REAL_MOMENT_ID, "--real", "--max-iterations", "1"])
        if args.mock_judge is None:
            args.mock_judge = not args.real
        self.assertFalse(args.mock_judge)

    def test_real_trajectory_uses_trajectory_helper_boundary(self) -> None:
        moment = mme.load_moment("stage-1-trajectory-fact-to-handoff")
        args = mme.build_parser().parse_args(
            ["run", "--moment", moment["id"], "--real", "--mock-judge", "--max-iterations", "1"]
        )
        fake = {
            "seed": {"sessionId": "cmomenttrajectory"},
            "aiResponse": "Trajectory response with solid fear without deciding",
            "stateDelta": {"trajectory_steps": [{"turn": 1}]},
        }
        with mock.patch.object(mme, "run_real_helper", return_value=fake) as helper:
            state, response, state_delta, _score, _raw = mme.run_real_iteration(moment, args, None, None)

        self.assertEqual(state["sessionId"], "cmomenttrajectory")
        self.assertIn("Trajectory response", response)
        self.assertIn("trajectory_steps", state_delta)
        helper.assert_called_once()
        self.assertEqual(helper.call_args.args[0], "run-trajectory")

    def test_flat_real_judge_result_is_normalized(self) -> None:
        moment = mme.load_moment("stage-2-empathy-validation")
        flat = {
            "parsed": {
                "confirm_or_refine_invitation": 9,
                "non_forcing_posture": 8,
                "protects_consent": 7,
                "rationale": "Flat result",
            },
            "raw": "{}",
        }
        with mock.patch.object(mme, "run_real_helper", return_value=flat):
            parsed, _raw = mme.score_with_real_judge(moment, "What landed? What felt off?")

        self.assertEqual(parsed["dimensions"]["confirm_or_refine_invitation"]["score"], 4.5)
        self.assertEqual(parsed["dimensions"]["non_forcing_posture"]["score"], 4.0)

    def test_root_dimension_real_judge_result_is_normalized(self) -> None:
        moment = mme.load_moment("stage-1-emotional-pivot")
        root_dimensions = {
            "parsed": {
                "emotional_reflection": {"score": 8, "rationale": "Good"},
                "listening_mode": {"score": 9, "rationale": "Good"},
                "no_premature_gate": {"score": 10, "rationale": "Good"},
            },
            "raw": "{}",
        }
        with mock.patch.object(mme, "run_real_helper", return_value=root_dimensions):
            parsed, _raw = mme.score_with_real_judge(moment, "What is she saying about you?")

        self.assertEqual(parsed["dimensions"]["emotional_reflection"]["score"], 4.0)
        self.assertEqual(parsed["dimensions"]["no_premature_gate"]["score"], 5.0)


class TestAlignmentLoop(unittest.TestCase):
    def write_loop_config(self, path: Path, moment_ids: list[str], estimated_cost_cents: float = 2.0) -> Path:
        path.write_text(
            json.dumps(
                {
                    "cost_caps": {
                        "per_run_cents": 500,
                        "per_day_cents": 2000,
                        "estimated_judge_cost_cents": estimated_cost_cents,
                    },
                    "moments": [{"id": moment_id, "threshold": 4.0} for moment_id in moment_ids],
                }
            ),
            encoding="utf-8",
        )
        return path

    def test_alignment_loop_dry_run_writes_summary_without_prs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            config = self.write_loop_config(
                tmp_path / "config.json",
                ["stage-1-emotional-pivot", "stage-2-empathy-validation"],
            )
            with mock.patch.object(loop, "ALIGNMENT_RUNS_ROOT", tmp_path / "alignment-runs"), \
                 mock.patch.object(loop.mme, "RUNS_ROOT", tmp_path / "runs"):
                args = loop.build_parser().parse_args(
                    ["--config", str(config), "--dry-run", "--timestamp", "phase4-dry-run-test"]
                )
                summary = loop.run_alignment_loop(args)

            self.assertEqual(summary["verdict"], "complete")
            self.assertTrue(summary["dry_run"])
            self.assertEqual(len(summary["moments"]), 2)
            self.assertTrue((tmp_path / "alignment-runs/phase4-dry-run-test/summary.json").exists())
            self.assertTrue(all("pr" not in item for item in summary["moments"]))

    def test_alignment_loop_cost_cap_aborts_after_partial_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            config = self.write_loop_config(
                tmp_path / "config.json",
                ["stage-1-emotional-pivot", "stage-2-empathy-validation", "stage-3-mutual-reveal"],
            )
            with mock.patch.object(loop, "ALIGNMENT_RUNS_ROOT", tmp_path / "alignment-runs"), \
                 mock.patch.object(loop.mme, "RUNS_ROOT", tmp_path / "runs"):
                args = loop.build_parser().parse_args(
                    [
                        "--config",
                        str(config),
                        "--dry-run",
                        "--per-run-cap-cents",
                        "5",
                        "--timestamp",
                        "phase4-cap-test",
                    ]
                )
                with self.assertRaises(loop.AlignmentLoopError):
                    loop.run_alignment_loop(args)

            summary = json.loads((tmp_path / "alignment-runs/phase4-cap-test/summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["verdict"], "aborted")
            self.assertIn("Per-run cost cap", summary["aborted_reason"])
            self.assertEqual(len(summary["moments"]), 2)

    def test_alignment_pr_creation_uses_expected_metadata_and_label(self) -> None:
        def completed(cmd: list[str], stdout: str = "") -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(cmd, 0, stdout=stdout, stderr="")

        commands: list[list[str]] = []

        def fake_run(cmd: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
            commands.append(cmd)
            if cmd[:3] == ["gh", "pr", "create"]:
                return completed(cmd, "https://github.com/example/repo/pull/123\n")
            return completed(cmd)

        with tempfile.TemporaryDirectory() as tmp:
            request = loop.PrRequest(
                moment_id="stage-2-empathy-validation",
                stage_label="stage-2",
                timestamp="20260506-120000",
                delta=0.42,
                body="## Candidate\n\nPrompt revision details.",
                artifact_paths=[REPO_ROOT / "eval/alignment-loop-config.yaml"],
                borderline=True,
            )
            with mock.patch.object(loop, "ALIGNMENT_RUNS_ROOT", Path(tmp)), \
                 mock.patch.object(loop, "git_current_branch", return_value="feat/gold-alignment-system-20260506"), \
                 mock.patch.object(loop, "run_command", side_effect=fake_run):
                result = loop.create_alignment_pr(request)

        self.assertEqual(result["url"], "https://github.com/example/repo/pull/123")
        self.assertEqual(result["branch"], "loop/alignment-stage-2-empathy-validation-20260506-120000")
        self.assertEqual(result["label"], "loop:auto-improvement")
        self.assertTrue(result["draft"])
        self.assertIn(["git", "switch", "-c", request.branch_name], commands)
        self.assertIn(["git", "switch", "feat/gold-alignment-system-20260506"], commands)
        pr_create = [cmd for cmd in commands if cmd[:3] == ["gh", "pr", "create"]][0]
        self.assertIn(request.title, pr_create)
        self.assertIn("--draft", pr_create)
        self.assertIn(["gh", "pr", "edit", result["url"], "--add-label", "loop:auto-improvement"], commands)

    def test_outer_loop_regression_converts_pr_to_draft_and_comments(self) -> None:
        def completed(cmd: list[str], stdout: str = "") -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(cmd, 0, stdout=stdout, stderr="")

        commands: list[list[str]] = []

        def fake_run(cmd: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
            commands.append(cmd)
            return completed(cmd)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            prompt_version = tmp_path / "v01.md"
            prompt_version.write_text("bad revision", encoding="utf-8")
            args = loop.build_parser().parse_args(
                [
                    "--mock-outer-loop-score",
                    "3.0",
                    "--outer-loop-baseline-score",
                    "4.0",
                    "--timestamp",
                    "phase5-outer-loop-test",
                ]
            )
            with mock.patch.object(loop, "ALIGNMENT_RUNS_ROOT", tmp_path / "alignment-runs"), \
                 mock.patch.object(loop, "run_command", side_effect=fake_run):
                result = loop.run_outer_loop_validation(
                    pr={"url": "https://github.com/example/repo/pull/123"},
                    moment_id="stage-2-empathy-validation",
                    prompt_version=prompt_version,
                    timestamp="phase5-outer-loop-test",
                    args=args,
                )

        self.assertEqual(result["status"], "regressed")
        self.assertTrue(result["regressed"])
        self.assertIn(["gh", "pr", "ready", "--undo", "https://github.com/example/repo/pull/123"], commands)
        comment = [cmd for cmd in commands if cmd[:3] == ["gh", "pr", "comment"]][0]
        self.assertIn("E2E regression detected", comment[-1])
        self.assertIn("outer-loop/stage-2-empathy-validation", comment[-1])


class TestGoldExampleOnboarding(unittest.TestCase):
    def test_gold_example_onboarding_copies_scaffolds_indexes_and_runs_tests(self) -> None:
        def completed(cmd: list[str]) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(cmd, 0, stdout="OK\n", stderr="")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            fixture = tmp_path / "New Couple.md"
            fixture.write_text(
                "\n".join(
                    [
                        "# New Couple",
                        "",
                        "## Stage 1",
                        "",
                        "**Alex:** I keep going quiet.",
                        "",
                        "**MWF:** Something in you goes quiet before it gets a chance to be heard.",
                        "",
                        "## Stage 2",
                        "",
                        "**Blair:** That is close, but it misses the fear.",
                        "",
                        "**MWF:** Keep the part that landed and bring the fear into the next version.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            with mock.patch.object(add_gold, "TRANSCRIPTS_ROOT", tmp_path / "golden-transcripts"), \
                 mock.patch.object(add_gold, "MOMENTS_ROOT", tmp_path / "moments"), \
                 mock.patch.object(add_gold, "INDEX_PATH", tmp_path / "moments/README.md"), \
                 mock.patch.object(add_gold, "run_command", side_effect=completed) as run_tests:
                result = add_gold.onboard(fixture)

            self.assertEqual(result["tests"], 0)
            self.assertTrue((tmp_path / "golden-transcripts/new-couple.md").exists())
            self.assertEqual(len(result["drafts"]), 2)
            self.assertTrue((tmp_path / "moments/new-couple-stage-1-moment-01.yaml.draft").exists())
            self.assertIn("new-couple-stage-2-moment-01.yaml.draft", (tmp_path / "moments/README.md").read_text(encoding="utf-8"))
            run_tests.assert_called_once()


class TestAlignmentStatus(unittest.TestCase):
    def test_alignment_status_generation_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            prompts = tmp_path / "stage-prompts.ts"
            prompts.write_text("export const prompt = 'stable';\n", encoding="utf-8")
            versions = tmp_path / "prompt-versions"
            (versions / "mwf/stage-1").mkdir(parents=True)
            (versions / "mwf/stage-1/v01.md").write_text("candidate\n", encoding="utf-8")
            runs = tmp_path / "runs/moment-stage-1-fact-reflection-20260506-000000-iter-01"
            runs.mkdir(parents=True)
            (runs / "run.json").write_text(json.dumps({"moment": "stage-1-fact-reflection"}), encoding="utf-8")
            (runs / "score.json").write_text(json.dumps({"overall_score": 4.2, "verdict": "eval_pass"}), encoding="utf-8")
            align = tmp_path / "alignment-runs/phase5"
            align.mkdir(parents=True)
            (align / "summary.json").write_text(
                json.dumps(
                    {
                        "started_at": "2026-05-06T00:00:00Z",
                        "cost_spent_cents": 2,
                        "moments": [
                            {
                                "id": "stage-1-fact-reflection",
                                "outer_loop": {"status": "passed", "run_dir": "outer-loop/run"},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            transcripts = tmp_path / "golden-transcripts"
            transcripts.mkdir()
            (transcripts / "fixture.md").write_text("# Fixture\n", encoding="utf-8")
            with mock.patch.object(status, "STAGE_PROMPTS", prompts), \
                 mock.patch.object(status, "PROMPT_VERSIONS_ROOT", versions), \
                 mock.patch.object(status, "MOMENT_RUNS_ROOT", tmp_path / "runs"), \
                 mock.patch.object(status, "ALIGNMENT_RUNS_ROOT", tmp_path / "alignment-runs"), \
                 mock.patch.object(status, "TRANSCRIPTS_ROOT", transcripts), \
                 mock.patch.object(status, "git_head", return_value="abc123"), \
                 mock.patch.object(status, "open_loop_prs", return_value=[]):
                first = status.render(limit=5)
                second = status.render(limit=5)

        self.assertEqual(first, second)
        self.assertIn("## Production Prompt", first)
        self.assertIn("## Latest Candidate Revisions", first)
        self.assertIn("## Open Loop PRs", first)
        self.assertIn("## Score Trends", first)
        self.assertIn("## Cost", first)
        self.assertIn("## Last E2E Outer Loop", first)
        self.assertIn("## Gold Examples", first)


class TestCli(unittest.TestCase):
    def test_cli_help_mentions_required_flags(self) -> None:
        result = subprocess.run(
            [sys.executable, "scripts/mwf_moment_eval.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        for needle in [
            "run",
            "run-library",
            "--moment",
            "--target-score",
            "--max-iterations",
            "--mock-judge",
            "--allow-protected-branch-patch",
        ]:
            self.assertIn(needle, result.stdout)

    def test_run_library_creates_one_run_per_moment_with_mock_judge(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with mock.patch.object(mme, "RUNS_ROOT", tmp_path):
                args = mme.build_parser().parse_args(["run-library", "--max-iterations", "1", "--no-improve"])
                if args.mock_judge is None:
                    args.mock_judge = not args.real
                created = mme.run_library(args)
                self.assertGreaterEqual(len(created), len(PHASE1_MOMENT_IDS))
                created_ids = {
                    __import__("json").loads((path / "run.json").read_text(encoding="utf-8"))["moment"]
                    for path in created
                }
        for moment_id in PHASE1_MOMENT_IDS:
            self.assertIn(moment_id, created_ids)

    def test_trajectory_runner_persists_intermediate_ai_responses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with mock.patch.object(mme, "RUNS_ROOT", tmp_path):
                args = mme.build_parser().parse_args(
                    [
                        "run",
                        "--moment",
                        "stage-3-trajectory-needs-flow",
                        "--max-iterations",
                        "1",
                        "--no-improve",
                    ]
                )
                if args.mock_judge is None:
                    args.mock_judge = not args.real
                created = mme.run_loop(args)
                delta = __import__("json").loads((created[0] / "state-delta.json").read_text(encoding="utf-8"))

        self.assertEqual(len(delta["trajectory_steps"]), 4)
        for step in delta["trajectory_steps"]:
            self.assertIn("ai_response_persisted", step)
            self.assertIn("seed_for_next_turn", step)


if __name__ == "__main__":
    unittest.main()
