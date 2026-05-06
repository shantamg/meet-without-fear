#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mwf_eval_loop as el  # noqa: E402


class TestConfigLoading(unittest.TestCase):
    def test_load_config_from_repo(self) -> None:
        config = el.load_config()
        self.assertIn("convergence_target", config)
        self.assertIn("domains", config)
        self.assertIn("scenarios", config)
        self.assertEqual(config["convergence_target"], 95)

    def test_load_config_missing_file_raises(self) -> None:
        with self.assertRaises(el.EvalLoopError):
            el.load_config(Path("/nonexistent/config.yaml"))

    def test_config_has_four_domains(self) -> None:
        config = el.load_config()
        domains = config["domains"]
        for domain_id in el.DOMAIN_IDS:
            self.assertIn(domain_id, domains, f"Missing domain config: {domain_id}")
            self.assertIn("weight", domains[domain_id])
            self.assertIn("threshold", domains[domain_id])

    def test_domain_weights_sum_to_one(self) -> None:
        config = el.load_config()
        total = sum(d["weight"] for d in config["domains"].values())
        self.assertAlmostEqual(total, 1.0, places=2)


class TestDomainScore(unittest.TestCase):
    def test_domain_score_to_dict(self) -> None:
        ds = el.DomainScore(
            domain="character_fidelity",
            score=85.0,
            details="test",
            per_stage={1: 80.0, 2: 90.0},
            issues=[{"type": "drift", "severity": "moderate"}],
        )
        d = ds.to_dict()
        self.assertEqual(d["domain"], "character_fidelity")
        self.assertEqual(d["score"], 85.0)
        self.assertIn("per_stage", d)
        self.assertEqual(len(d["issues"]), 1)

    def test_domain_score_without_per_stage(self) -> None:
        ds = el.DomainScore(domain="technical_bugs", score=100.0, details="clean")
        d = ds.to_dict()
        self.assertNotIn("per_stage", d)


class TestCharacterFidelity(unittest.TestCase):
    def test_perfect_score_no_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            result = el.score_character_fidelity(run_dir, "adam-eve")
            self.assertEqual(result.domain, "character_fidelity")
            self.assertEqual(result.score, 100.0)
            self.assertEqual(len(result.issues), 0)

    def test_actor_side_violation_penalizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {
                "checks": [{
                    "id": "actor_operated_correct_side",
                    "status": "fail",
                    "severity": "hard",
                    "dimension": "actor_fidelity",
                    "details": "Actor operated wrong side",
                    "evidence": ["side mismatch"],
                }],
            }
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            result = el.score_character_fidelity(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "actor_side_violation" for i in result.issues))

    def test_scorer_fidelity_dimension_normalizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            score_data = {
                "dimensions": {
                    "actor_fidelity": {"score": 3.5, "pass": False, "rationale": "Low fidelity"},
                },
                "gold_alignment": {"actor_fidelity": {}},
            }
            (run_dir / "score.json").write_text(json.dumps(score_data))
            result = el.score_character_fidelity(run_dir, "adam-eve")
            # 3.5/5 * 100 = 70
            self.assertEqual(result.score, 70.0)

    def test_character_drift_penalizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            score_data = {
                "dimensions": {"actor_fidelity": {"score": 5.0, "pass": True}},
                "gold_alignment": {
                    "actor_fidelity": {
                        "drift_points": [
                            {"stage": 2, "description": "Adam broke character"},
                            {"stage": 3, "description": "Adam too aggressive"},
                        ],
                    },
                },
            }
            (run_dir / "score.json").write_text(json.dumps(score_data))
            result = el.score_character_fidelity(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "character_drift" for i in result.issues))


class TestAIResponseQuality(unittest.TestCase):
    def test_with_scorer_dimension(self) -> None:
        """Use a fake scenario ID so repo baselines don't interfere."""
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            score_data = {
                "dimensions": {
                    "mwf_handling": {"score": 4.5, "pass": True, "rationale": "Good handling"},
                },
                "gold_alignment": {"mwf_guidance": {}},
            }
            (run_dir / "score.json").write_text(json.dumps(score_data))
            result = el.score_ai_response_quality(run_dir, "no-such-scenario")
            self.assertEqual(result.domain, "ai_response_quality")
            # 4.5/5 * 100 = 90
            self.assertEqual(result.score, 90.0)

    def test_stage_gate_violation_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {
                "checks": [{
                    "id": "felt_heard_gate_after_substantive_witnessing",
                    "status": "fail",
                    "severity": "hard",
                    "dimension": "stage_gates",
                    "details": "Premature gate",
                    "evidence": [],
                }],
            }
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            result = el.score_ai_response_quality(run_dir, "adam-eve")
            self.assertTrue(any(i["type"] == "stage_gate_violation" for i in result.issues))


class TestTechnicalBugs(unittest.TestCase):
    def test_perfect_score_no_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = el.score_technical_bugs(Path(tmp), "adam-eve")
            self.assertEqual(result.score, 100.0)

    def test_actor_error_penalizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            run_data = {
                "status_history": [{
                    "side": "adam",
                    "status": {"state": "error", "next_action_needed": "Browser crashed"},
                }],
            }
            (run_dir / "run.json").write_text(json.dumps(run_data))
            result = el.score_technical_bugs(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "actor_error" for i in result.issues))

    def test_bug_blocked_penalizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            run_data = {
                "status_history": [{
                    "side": "eve",
                    "status": {"state": "bug_blocked", "next_action_needed": "State machine stuck"},
                }],
            }
            (run_dir / "run.json").write_text(json.dumps(run_data))
            result = el.score_technical_bugs(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "bug_blocked" for i in result.issues))

    def test_hard_invariant_failure_penalizes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {
                "hard_failures": [{
                    "id": "no_partner_private_content_leakage",
                    "details": "Privacy leak",
                }],
                "checks": [],
            }
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            result = el.score_technical_bugs(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "invariant_hard_failure" for i in result.issues))

    def test_log_error_scanning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            log = "Starting server...\nError: EADDRINUSE :::3000\nListening on port 3001\n"
            (run_dir / "backend.log").write_text(log)
            result = el.score_technical_bugs(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "service_log_error" for i in result.issues))

    def test_deprecation_warnings_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            log = "DeprecationWarning: something old\nExperimentalWarning: something new\n"
            (run_dir / "backend.log").write_text(log)
            result = el.score_technical_bugs(run_dir, "adam-eve")
            self.assertEqual(result.score, 100.0)


class TestUXQuality(unittest.TestCase):
    def test_all_invariants_pass(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {
                "checks": [
                    {"id": "no_visible_internal_control_tags", "status": "pass", "dimension": "visible_text"},
                    {"id": "transcript_side_stage_complete", "status": "pass", "dimension": "transcript_extraction"},
                    {"id": "no_partner_private_content_leakage", "status": "pass", "dimension": "privacy"},
                ],
            }
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            transcripts = run_dir / "transcripts"
            transcripts.mkdir()
            for side in ["adam", "eve"]:
                for stage in range(5):
                    (transcripts / f"{side}-stage{stage}.md").write_text(f"# {side} stage {stage}")
            result = el.score_ux_quality(run_dir, "adam-eve")
            self.assertEqual(result.score, 100.0)

    def test_control_tags_penalize(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {
                "checks": [{
                    "id": "no_visible_internal_control_tags",
                    "status": "fail",
                    "dimension": "visible_text",
                    "evidence": ["<thinking> tag found"],
                }],
            }
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            result = el.score_ux_quality(run_dir, "adam-eve")
            self.assertLess(result.score, 100)
            self.assertTrue(any(i["type"] == "visible_control_tags" for i in result.issues))

    def test_privacy_leakage_severe_penalty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {
                "checks": [{
                    "id": "no_partner_private_content_leakage",
                    "status": "fail",
                    "dimension": "privacy",
                    "evidence": ["PRIVATE_LEAK found"],
                }],
            }
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            result = el.score_ux_quality(run_dir, "adam-eve")
            self.assertLessEqual(result.score, 70)

    def test_few_transcripts_penalize(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            invariants = {"checks": []}
            (run_dir / "invariants.json").write_text(json.dumps(invariants))
            transcripts = run_dir / "transcripts"
            transcripts.mkdir()
            (transcripts / "adam-stage0.md").write_text("# Adam stage 0")
            result = el.score_ux_quality(run_dir, "adam-eve")
            self.assertLess(result.score, 100)


class TestLeadAgentReview(unittest.TestCase):
    def _make_report(self, scores: dict[str, float], target: float = 95) -> el.EvalReport:
        domains = [
            el.DomainScore(domain=domain, score=score, details="test")
            for domain, score in scores.items()
        ]
        overall = sum(scores.values()) / len(scores)
        converged = all(s >= target for s in scores.values())
        return el.EvalReport(
            scenario_id="adam-eve",
            iteration=1,
            timestamp="2026-01-01T00:00:00Z",
            domains=domains,
            overall_score=overall,
            converged=converged,
            convergence_target=target,
        )

    def test_all_passing_no_tasks(self) -> None:
        report = self._make_report({
            "character_fidelity": 98,
            "ai_response_quality": 96,
            "technical_bugs": 100,
            "ux_quality": 97,
        })
        review = el.lead_agent_review(report)
        self.assertTrue(review.all_passing)
        self.assertEqual(len(review.tasks), 0)

    def test_failing_domains_create_tasks(self) -> None:
        report = self._make_report({
            "character_fidelity": 70,
            "ai_response_quality": 80,
            "technical_bugs": 100,
            "ux_quality": 100,
        })
        review = el.lead_agent_review(report)
        self.assertFalse(review.all_passing)
        self.assertGreater(len(review.tasks), 0)
        # Lowest domain should have highest priority tasks
        domains_in_tasks = [t.domain for t in review.tasks]
        self.assertIn("character_fidelity", domains_in_tasks)

    def test_score_history_tracked(self) -> None:
        report = self._make_report({
            "character_fidelity": 90,
            "ai_response_quality": 85,
            "technical_bugs": 95,
            "ux_quality": 95,
        })
        prev_history = [{"character_fidelity": 80, "ai_response_quality": 75, "technical_bugs": 90, "ux_quality": 90, "overall": 83.75}]
        review = el.lead_agent_review(report, score_history=prev_history)
        self.assertEqual(len(review.score_history), 2)
        latest = review.score_history[-1]
        self.assertEqual(latest["character_fidelity"], 90)

    def test_summary_shows_improvements(self) -> None:
        report = self._make_report({
            "character_fidelity": 90,
            "ai_response_quality": 85,
            "technical_bugs": 95,
            "ux_quality": 95,
        })
        prev_history = [{"character_fidelity": 80, "ai_response_quality": 80, "technical_bugs": 95, "ux_quality": 95, "overall": 87.5}]
        review = el.lead_agent_review(report, score_history=prev_history)
        self.assertIn("Improvements", review.summary)

    def test_review_summary_contains_domain_scores(self) -> None:
        report = self._make_report({
            "character_fidelity": 90,
            "ai_response_quality": 85,
            "technical_bugs": 100,
            "ux_quality": 97,
        })
        review = el.lead_agent_review(report)
        for domain in el.DOMAIN_IDS:
            self.assertIn(domain, review.summary)


class TestImprovementTaskCreation(unittest.TestCase):
    def test_character_drift_creates_actor_skill_task(self) -> None:
        domain = el.DomainScore(
            domain="character_fidelity",
            score=75,
            details="test",
            issues=[{"type": "character_drift", "details": "2 drift point(s) detected"}],
        )
        tasks = el._create_improvement_tasks(domain, 0, 20)
        self.assertTrue(any(t.owner == "actor_skill" for t in tasks))

    def test_actor_error_creates_product_code_task(self) -> None:
        domain = el.DomainScore(
            domain="technical_bugs",
            score=75,
            details="test",
            issues=[{"type": "actor_error", "side": "adam", "details": "Browser crashed"}],
        )
        tasks = el._create_improvement_tasks(domain, 0, 20)
        self.assertTrue(any(t.owner == "product_code" for t in tasks))

    def test_privacy_leakage_highest_priority(self) -> None:
        domain = el.DomainScore(
            domain="ux_quality",
            score=70,
            details="test",
            issues=[{"type": "privacy_leakage"}],
        )
        tasks = el._create_improvement_tasks(domain, 5, 25)
        privacy_tasks = [t for t in tasks if "private" in t.title.lower() or "privacy" in t.title.lower()]
        self.assertTrue(privacy_tasks)
        self.assertEqual(privacy_tasks[0].priority, 0)

    def test_generic_fallback_task_when_no_specific_issues(self) -> None:
        domain = el.DomainScore(
            domain="ux_quality",
            score=80,
            details="test",
            issues=[],
        )
        tasks = el._create_improvement_tasks(domain, 0, 15)
        self.assertEqual(len(tasks), 1)
        self.assertIn("Improve", tasks[0].title)


class TestScoreRun(unittest.TestCase):
    def test_score_run_with_mock_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            el._write_mock_run_artifacts(run_dir, "adam-eve")
            report = el.score_run(run_dir, "adam-eve")
            self.assertEqual(report.scenario_id, "adam-eve")
            self.assertEqual(len(report.domains), 4)
            for d in report.domains:
                self.assertIn(d.domain, el.DOMAIN_IDS)
                self.assertGreaterEqual(d.score, 0)
                self.assertLessEqual(d.score, 100)

    def test_weighted_overall_score(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            el._write_mock_run_artifacts(run_dir, "adam-eve")
            report = el.score_run(run_dir, "adam-eve")
            self.assertGreater(report.overall_score, 0)
            self.assertLessEqual(report.overall_score, 100)


class TestEvalReport(unittest.TestCase):
    def test_report_to_dict(self) -> None:
        domains = [
            el.DomainScore(domain="character_fidelity", score=90, details="ok"),
            el.DomainScore(domain="ai_response_quality", score=85, details="ok"),
            el.DomainScore(domain="technical_bugs", score=100, details="clean"),
            el.DomainScore(domain="ux_quality", score=95, details="good"),
        ]
        report = el.EvalReport(
            scenario_id="adam-eve",
            iteration=1,
            timestamp="2026-01-01T00:00:00Z",
            domains=domains,
            overall_score=92.5,
            converged=False,
            convergence_target=95,
        )
        d = report.to_dict()
        self.assertEqual(d["scenario_id"], "adam-eve")
        self.assertIn("character_fidelity", d["domains"])
        self.assertEqual(d["overall_score"], 92.5)

    def test_report_serializable(self) -> None:
        domains = [
            el.DomainScore(domain="character_fidelity", score=95, details="ok"),
        ]
        report = el.EvalReport(
            scenario_id="test",
            iteration=1,
            timestamp="now",
            domains=domains,
            overall_score=95,
            converged=True,
            convergence_target=95,
        )
        serialized = json.dumps(report.to_dict())
        self.assertIn("character_fidelity", serialized)


class TestWriteArtifacts(unittest.TestCase):
    def test_write_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            domains = [
                el.DomainScore(domain="character_fidelity", score=90, details="ok"),
            ]
            report = el.EvalReport(
                scenario_id="test", iteration=1, timestamp="now",
                domains=domains, overall_score=90, converged=False, convergence_target=95,
            )
            path = el.write_report(run_dir, report)
            self.assertTrue(path.exists())
            loaded = json.loads(path.read_text())
            self.assertEqual(loaded["scenario_id"], "test")

    def test_write_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            review = el.LeadAgentReview(
                scenario_id="test", iteration=1, timestamp="now",
                summary="Test summary", all_passing=True,
                tasks=[], score_history=[],
            )
            path = el.write_review(run_dir, review)
            self.assertTrue(path.exists())
            md_path = run_dir / "lead-review.md"
            self.assertTrue(md_path.exists())
            md_text = md_path.read_text()
            self.assertIn("Lead Agent Review", md_text)


class TestDryRunLoop(unittest.TestCase):
    def test_dry_run_completes(self) -> None:
        report, review = el.run_eval_loop(
            scenario_id="adam-eve",
            dry_run=True,
            max_iterations=1,
        )
        self.assertEqual(report.scenario_id, "adam-eve")
        self.assertEqual(report.iteration, 1)
        self.assertIsNotNone(review.summary)

    def test_dry_run_creates_artifacts(self) -> None:
        report, review = el.run_eval_loop(
            scenario_id="adam-eve",
            dry_run=True,
            max_iterations=1,
        )
        # The loop dir should exist under eval/runs/
        loop_dirs = list(el.RUNS_ROOT.glob("*-adam-eve-eval-loop"))
        self.assertGreater(len(loop_dirs), 0)
        latest = sorted(loop_dirs)[-1]
        self.assertTrue((latest / "loop-summary.json").exists())
        iter_dir = latest / "iter-01" / "run"
        self.assertTrue((iter_dir / "eval-report.json").exists())
        self.assertTrue((iter_dir / "lead-review.json").exists())
        self.assertTrue((iter_dir / "lead-review.md").exists())


class TestHelpers(unittest.TestCase):
    def test_average_or_default_with_values(self) -> None:
        self.assertEqual(el._average_or_default([80, 90, 100], 50), 90.0)

    def test_average_or_default_empty(self) -> None:
        self.assertEqual(el._average_or_default([], 50), 50.0)

    def test_scan_log_for_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "test.log"
            log_path.write_text(
                "Starting...\n"
                "Error: something failed\n"
                "Warning: something warned\n"
                "DeprecationWarning: old thing\n"
                "All good\n"
            )
            errors = el._scan_log_for_errors(log_path)
            # Should find Error and Warning but not DeprecationWarning
            self.assertEqual(len(errors), 2)
            self.assertEqual(errors[0]["severity"], "error")
            self.assertEqual(errors[1]["severity"], "warning")

    def test_scan_log_nonexistent(self) -> None:
        errors = el._scan_log_for_errors(Path("/nonexistent/log.txt"))
        self.assertEqual(errors, [])


class TestImprovementTask(unittest.TestCase):
    def test_task_to_dict(self) -> None:
        task = el.ImprovementTask(
            domain="technical_bugs",
            priority=0,
            title="Fix crash",
            description="Browser crashes during simulation",
            owner="product_code",
            estimated_complexity="medium",
            acceptance_criteria=["No crashes"],
            related_files=["scripts/mwf_gold_loop.py"],
        )
        d = task.to_dict()
        self.assertEqual(d["domain"], "technical_bugs")
        self.assertEqual(d["priority"], 0)
        self.assertIn("Fix crash", d["title"])


if __name__ == "__main__":
    unittest.main()
