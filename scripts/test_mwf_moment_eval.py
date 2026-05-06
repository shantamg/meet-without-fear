#!/usr/bin/env python3

from __future__ import annotations

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

REPO_ROOT = Path(__file__).resolve().parents[1]
MOMENT_ID = "stage-4-no-shared-agreement-closure"
REAL_MOMENT_ID = "stage-1-fact-reflection"


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
            "--moment",
            "--target-score",
            "--max-iterations",
            "--mock-judge",
            "--allow-protected-branch-patch",
        ]:
            self.assertIn(needle, result.stdout)


if __name__ == "__main__":
    unittest.main()
