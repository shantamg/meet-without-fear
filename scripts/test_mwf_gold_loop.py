#!/usr/bin/env python3

import json
import sys
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mwf_gold_loop as loop


class StatusParserTest(unittest.TestCase):
    def test_parses_required_status_footer(self) -> None:
        text = """
Done for now.

MWF_GOLD_STATUS:
```json
{
  "side": "adam",
  "session_id": "session-123",
  "stage": 2,
  "state": "needs_partner",
  "blocked_on": "eve",
  "next_action_needed": "Eve should continue",
  "scratch_log": "docs/product/gold-session-scratch/log.md",
  "current_url": "http://localhost:8082/session/session-123"
}
```
"""
        status = loop.parse_status(text, expected_side="adam", session_id="session-123")
        self.assertEqual(status.side, "adam")
        self.assertEqual(status.stage, 2)
        self.assertEqual(status.state, "needs_partner")
        self.assertEqual(status.blocked_on, "eve")

    def test_rejects_missing_status(self) -> None:
        with self.assertRaises(loop.GoldLoopError):
            loop.parse_status("No JSON here")

    def test_rejects_invalid_state(self) -> None:
        text = json.dumps({"side": "eve", "session_id": "s", "state": "waiting"})
        with self.assertRaises(loop.GoldLoopError):
            loop.parse_status(text)

    def test_rejects_wrong_side(self) -> None:
        text = json.dumps({"side": "eve", "session_id": "s", "state": "completed"})
        with self.assertRaises(loop.GoldLoopError):
            loop.parse_status(text, expected_side="adam")


class SessionIdParserTest(unittest.TestCase):
    def test_finds_codex_session_id_in_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "codex.jsonl"
            path.write_text(
                json.dumps({"event": "started", "session_id": "019df921-3bf9-70f0-af9e-7672c5d6510f"}) + "\n",
                encoding="utf-8",
            )
            self.assertEqual(loop.find_codex_session_id(path), "019df921-3bf9-70f0-af9e-7672c5d6510f")


class ActorSchedulingTest(unittest.TestCase):
    def test_hands_off_to_blocked_partner(self) -> None:
        adam = loop.Actor("Adam", "adam-url")
        eve = loop.Actor("Eve", "eve-url")
        adam.status = loop.ActorStatus(
            side="adam",
            session_id="s",
            stage=1,
            state="needs_partner",
            blocked_on="eve",
        )
        actors = {"adam": adam, "eve": eve}
        self.assertIs(loop.choose_next_actor(actors, last_side="adam", stop_after_stage=2), eve)

    def test_prefers_actor_that_can_continue(self) -> None:
        adam = loop.Actor("Adam", "adam-url")
        eve = loop.Actor("Eve", "eve-url")
        adam.status = loop.ActorStatus(side="adam", session_id="s", stage=1, state="needs_partner", blocked_on="eve")
        eve.status = loop.ActorStatus(side="eve", session_id="s", stage=2, state="can_continue")
        self.assertIs(loop.choose_next_actor({"adam": adam, "eve": eve}, last_side="adam", stop_after_stage=2), eve)

    def test_stops_when_both_reach_stage_limit(self) -> None:
        adam = loop.Actor("Adam", "adam-url")
        eve = loop.Actor("Eve", "eve-url")
        adam.status = loop.ActorStatus(side="adam", session_id="s", stage=2, state="stage_limit_reached")
        eve.status = loop.ActorStatus(side="eve", session_id="s", stage=2, state="stage_limit_reached")
        self.assertIsNone(loop.choose_next_actor({"adam": adam, "eve": eve}, last_side="eve", stop_after_stage=2))

    def test_resumes_stale_waiting_side_after_partner_terminal(self) -> None:
        adam = loop.Actor("Adam", "adam-url")
        eve = loop.Actor("Eve", "eve-url")
        adam.status = loop.ActorStatus(side="adam", session_id="s", stage=2, state="stage_limit_reached")
        eve.status = loop.ActorStatus(side="eve", session_id="s", stage=1, state="needs_partner", blocked_on="adam")
        self.assertIs(loop.choose_next_actor({"adam": adam, "eve": eve}, last_side="adam", stop_after_stage=2), eve)

    def test_stops_when_waiting_side_has_reached_stop_boundary(self) -> None:
        adam = loop.Actor("Adam", "adam-url")
        eve = loop.Actor("Eve", "eve-url")
        adam.status = loop.ActorStatus(side="adam", session_id="s", stage=2, state="stage_limit_reached")
        eve.status = loop.ActorStatus(side="eve", session_id="s", stage=2, state="needs_partner", blocked_on="adam")
        self.assertIsNone(loop.choose_next_actor({"adam": adam, "eve": eve}, last_side="eve", stop_after_stage=2))

    def test_actor_prompt_treats_share_suggestion_as_in_stage_work(self) -> None:
        adam = loop.Actor("Adam", "adam-url")
        eve = loop.Actor("Eve", "eve-url")

        initial_prompt = loop.build_actor_prompt(adam, eve, "session-1", 2, Path("run-dir"))
        resume_prompt = loop.build_resume_prompt(adam, eve, "session-1", 2)

        self.assertIn("visible share suggestion", initial_prompt)
        self.assertIn("before reporting \"stage_limit_reached\"", initial_prompt)
        self.assertIn("visible share suggestion", resume_prompt)
        self.assertIn("before reporting \"stage_limit_reached\"", resume_prompt)


class ImproverDecisionTest(unittest.TestCase):
    def test_runs_improver_on_final_failure_by_default(self) -> None:
        args = SimpleNamespace(always_improve=False, target_score=4.0, max_iterations=1, improve_on_final_fail=True)
        self.assertTrue(loop.should_run_improver(args, iteration=1, overall_score=3.5))

    def test_can_disable_final_failure_improver(self) -> None:
        args = SimpleNamespace(always_improve=False, target_score=4.0, max_iterations=1, improve_on_final_fail=False)
        self.assertFalse(loop.should_run_improver(args, iteration=1, overall_score=3.5))

    def test_does_not_improve_passing_score_unless_forced(self) -> None:
        args = SimpleNamespace(always_improve=False, target_score=4.0, max_iterations=2, improve_on_final_fail=True)
        self.assertFalse(loop.should_run_improver(args, iteration=1, overall_score=4.0))

    def test_always_improve_overrides_passing_score(self) -> None:
        args = SimpleNamespace(always_improve=True, target_score=4.0, max_iterations=2, improve_on_final_fail=True)
        self.assertTrue(loop.should_run_improver(args, iteration=1, overall_score=4.0))


class TranscriptArtifactTest(unittest.TestCase):
    def test_splits_extractor_output_into_stable_side_stage_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            transcript_dir = run_dir / "transcripts"
            transcript_dir.mkdir()
            adam_source = transcript_dir / "transcript_Adam_session123.md"
            eve_source = transcript_dir / "transcript_Eve_session123.md"
            adam_source.write_text(
                """# Chat Transcript: Adam

**Session ID:** session123

**[2026-05-05 10:00:00] Adam:**
I want stability.

## Stage 1

**[2026-05-05 10:01:00] AI:**
That panic makes sense.
""",
                encoding="utf-8",
            )
            eve_source.write_text(
                """# Chat Transcript: Eve

**Session ID:** session123

**[2026-05-05 10:00:30] Eve:**
I need more.

## Stage 1

**[2026-05-05 10:01:30] AI:**
You want room without deciding everything today.
""",
                encoding="utf-8",
            )

            written = loop.write_stage_transcript_artifacts(
                [adam_source, eve_source],
                transcript_dir,
                "adam-eve",
                1,
            )

            self.assertEqual(
                sorted(Path(path).name for path in written),
                ["adam-stage0.md", "adam-stage1.md", "eve-stage0.md", "eve-stage1.md"],
            )
            adam_stage1 = (transcript_dir / "adam-stage1.md").read_text(encoding="utf-8")
            self.assertIn("- side: `adam`", adam_stage1)
            self.assertIn("- stage: `1`", adam_stage1)
            self.assertIn("That panic makes sense.", adam_stage1)
            self.assertNotIn("I want stability.", adam_stage1)

    def test_writes_mock_stage_transcripts_for_all_sides(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            written = loop.write_mock_transcripts(run_dir, "adam-eve", 1)

            self.assertEqual(
                sorted(Path(path).name for path in written),
                ["adam-stage0.md", "adam-stage1.md", "eve-stage0.md", "eve-stage1.md"],
            )
            for path in written:
                text = Path(path).read_text(encoding="utf-8")
                self.assertIn("## Events", text)
                self.assertIn("- privacy:", text)


class ScoreValidationTest(unittest.TestCase):
    def valid_score(self) -> dict:
        return {
            "overall_score": 3.5,
            "verdict": "eval_warn",
            "dimensions": {
                "actor_fidelity": {
                    "score": 3.5,
                    "pass": False,
                    "owner": "actor_skill",
                    "recommended_action": "patch_skill",
                },
                "mwf_handling": {
                    "score": 3,
                    "pass": False,
                    "owner": "mwf_prompts",
                    "recommended_action": "patch_prompt",
                },
            },
            "gold_alignment": {
                "actor_fidelity": {"adam": {"stage1": {"persona_alignment": 3}}},
                "mwf_guidance": {"adam": {"stage1": {"guidance_alignment": 3}}},
            },
            "improvement_targets": [
                {"owner": "actor_skill", "dimension": "actor_fidelity", "recommended_action": "patch_skill"},
                {"owner": "mwf_prompts", "dimension": "mwf_handling", "recommended_action": "patch_prompt"},
            ],
        }

    def test_accepts_complete_score_schema(self) -> None:
        self.assertEqual(loop.validate_score_schema(self.valid_score(), target_score=4.0), [])

    def test_rejects_missing_gold_alignment(self) -> None:
        score = self.valid_score()
        del score["gold_alignment"]

        errors = loop.validate_score_schema(score, target_score=4.0)

        self.assertIn("missing or invalid gold_alignment", errors)

    def test_rejects_missing_owner_action_routing(self) -> None:
        score = self.valid_score()
        del score["dimensions"]["actor_fidelity"]["owner"]
        del score["dimensions"]["actor_fidelity"]["recommended_action"]
        score["improvement_targets"] = []

        errors = loop.validate_score_schema(score, target_score=4.0)

        self.assertIn("missing dimensions.actor_fidelity.owner", errors)
        self.assertIn("missing dimensions.actor_fidelity.recommended_action", errors)
        self.assertIn("missing owner/action routing for weak dimension actor_fidelity", errors)

    def test_malformed_score_falls_back_to_eval_needs_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            (run_dir / "score.json").write_text("{not json", encoding="utf-8")

            score = loop.accept_or_repair_score(
                run_dir,
                "adam-eve",
                target_score=4.0,
                timeout=1,
                allow_repair=False,
            )

            self.assertEqual(score["verdict"], "eval_needs_review")
            self.assertEqual(score["improvement_targets"][0]["owner"], "eval_harness")
            self.assertIn("malformed score JSON", score["improvement_targets"][0]["evidence"][0])
            validation = json.loads((run_dir / "score-validation.json").read_text(encoding="utf-8"))
            self.assertEqual(validation["attempts"][0]["attempt"], "initial")
            self.assertFalse(validation["attempts"][0]["valid"])


class InvariantCheckTest(unittest.TestCase):
    def write_transcripts(self, run_dir: Path, bad_tag: bool = False) -> list[str]:
        written = loop.write_mock_transcripts(run_dir, "adam-eve", 1)
        if bad_tag:
            adam_stage1 = run_dir / "transcripts" / "adam-stage1.md"
            adam_stage1.write_text(
                adam_stage1.read_text(encoding="utf-8") + "\n<thinking>internal plan</thinking>\n",
                encoding="utf-8",
            )
        return written

    def run_data(self, transcripts: list[str]) -> dict:
        return {
            "scenario": "adam-eve",
            "stop_after_stage": 1,
            "transcripts": transcripts,
            "status_history": [
                {
                    "side": "adam",
                    "turn": 3,
                    "status": {"side": "adam", "state": "stage_limit_reached", "stage": 1},
                },
                {
                    "side": "eve",
                    "turn": 3,
                    "status": {"side": "eve", "state": "stage_limit_reached", "stage": 1},
                },
            ],
        }

    def test_clean_mock_run_passes_invariants(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            data = self.run_data(self.write_transcripts(run_dir))

            invariants = loop.run_invariant_checks(run_dir, data, "adam-eve", 1)

            self.assertEqual(invariants["status"], "pass")
            self.assertTrue((run_dir / "invariants.json").exists())

    def test_visible_control_tag_fails_hard(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            data = self.run_data(self.write_transcripts(run_dir, bad_tag=True))

            invariants = loop.run_invariant_checks(run_dir, data, "adam-eve", 1)

            self.assertEqual(invariants["status"], "fail")
            failed_ids = {failure["id"] for failure in invariants["hard_failures"]}
            self.assertIn("no_visible_internal_control_tags", failed_ids)

    def test_wrong_actor_side_fails_hard(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            data = self.run_data(self.write_transcripts(run_dir))
            data["status_history"][0]["status"]["side"] = "eve"

            invariants = loop.run_invariant_checks(run_dir, data, "adam-eve", 1)

            failed_ids = {failure["id"] for failure in invariants["hard_failures"]}
            self.assertIn("actor_operated_correct_side", failed_ids)

    def test_waiting_at_stop_stage_satisfies_stage_limit_invariant(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            data = self.run_data(self.write_transcripts(run_dir))
            data["status_history"][1]["status"] = {
                "side": "eve",
                "state": "needs_partner",
                "stage": 1,
                "blocked_on": "adam",
            }

            invariants = loop.run_invariant_checks(run_dir, data, "adam-eve", 1)

            failed_ids = {failure["id"] for failure in invariants["hard_failures"]}
            self.assertNotIn("stage_limit_reached_correctly", failed_ids)

    def test_hard_invariant_forces_eval_fail_score(self) -> None:
        score = {
            "verdict": "eval_pass",
            "overall_score": 4.5,
            "improvement_targets": [],
        }
        invariants = {
            "hard_failures": [
                {
                    "id": "no_visible_internal_control_tags",
                    "owner": "product_code",
                    "dimension": "visible_text",
                    "details": "tag leak",
                    "evidence": ["adam-stage1.md: <thinking>"],
                    "severity": "hard",
                    "status": "fail",
                }
            ]
        }

        updated = loop.apply_invariants_to_score(score, invariants, target_score=4.0)

        self.assertEqual(updated["verdict"], "eval_fail")
        self.assertLess(updated["overall_score"], 4.0)
        self.assertEqual(updated["hard_invariants"][0]["id"], "no_visible_internal_control_tags")
        self.assertEqual(updated["improvement_targets"][0]["owner"], "product_code")


class PatchVerificationTest(unittest.TestCase):
    def patch_summary(self, command: str) -> str:
        return f"""# Patch Summary

## Files Changed

- scripts/mwf_gold_loop.py

## Owner Addressed

- eval_harness

## Score Dimension Addressed

- patch_verification

## Tests To Run

- `{command}`

## Expected Next-Run Score Movement

- verification should pass

## Rollback/Regression Risk

- low
"""

    def test_extracts_test_commands_from_patch_summary(self) -> None:
        text = self.patch_summary("python3 -m py_compile scripts/mwf_gold_loop.py")

        self.assertEqual(
            loop.extract_test_commands_from_patch_summary(text),
            ["python3 -m py_compile scripts/mwf_gold_loop.py"],
        )

    def test_missing_patch_summary_fails_verification(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            verification = loop.verify_patch_mode(Path(tmp), timeout=1)

            self.assertEqual(verification["status"], "fail")
            self.assertIn("missing patch summary", verification["failures"][0])

    def test_patch_verification_runs_listed_commands(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            (run_dir / "patch-summary.md").write_text(
                self.patch_summary("python3 -c 'print(123)'"),
                encoding="utf-8",
            )

            verification = loop.verify_patch_mode(run_dir, timeout=5)

            self.assertEqual(verification["status"], "pass")
            self.assertEqual(verification["results"][0]["returncode"], 0)
            self.assertTrue((run_dir / "verification.json").exists())

    def test_patch_verification_records_failing_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            (run_dir / "patch-summary.md").write_text(
                self.patch_summary("python3 -c 'import sys; sys.exit(7)'"),
                encoding="utf-8",
            )

            verification = loop.verify_patch_mode(run_dir, timeout=5)

            self.assertEqual(verification["status"], "fail")
            self.assertEqual(verification["results"][0]["returncode"], 7)
            self.assertIn("verification command failed", verification["failures"][0])


class RegressionContextTest(unittest.TestCase):
    def test_builds_previous_run_context_from_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            (run_dir / "score.json").write_text(
                json.dumps(
                    {
                        "overall_score": 3.25,
                        "verdict": "eval_warn",
                        "gold_alignment": {"actor_fidelity": {"adam": {}}, "mwf_guidance": {"adam": {}}},
                        "improvement_targets": [
                            {"owner": "mwf_prompts", "dimension": "mwf_handling", "recommended_action": "patch_prompt"}
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (run_dir / "run.json").write_text(
                json.dumps({"prompt_skill_versions": {"actor_skill_hash": "abc"}, "verification": {"status": "pass"}}),
                encoding="utf-8",
            )
            (run_dir / "patch-summary.md").write_text("# Patch Summary\n\nChanged prompts.\n", encoding="utf-8")

            context = loop.build_regression_context(run_dir)

            self.assertEqual(context["status"], "available")
            self.assertEqual(context["previous_score"], 3.25)
            self.assertEqual(context["previous_verdict"], "eval_warn")
            self.assertEqual(context["previous_improvement_targets"][0]["owner"], "mwf_prompts")
            self.assertEqual(context["previous_prompt_skill_versions"]["actor_skill_hash"], "abc")
            self.assertIn("Changed prompts", context["previous_patch_summary"])

    def test_score_movement_classifies_regression(self) -> None:
        movement = loop.score_movement(4.0, 3.5)

        self.assertEqual(movement["classification"], "regression")
        self.assertEqual(movement["delta"], -0.5)

    def test_score_movement_handles_missing_previous_score(self) -> None:
        movement = loop.score_movement(None, 3.5)

        self.assertEqual(movement["classification"], "incomparable")
        self.assertIsNone(movement["delta"])


class VersionTrackingTest(unittest.TestCase):
    def test_file_fingerprint_records_sha256(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.txt"
            path.write_text("abc", encoding="utf-8")

            fingerprint = loop.file_fingerprint(path)

            self.assertTrue(fingerprint["exists"])
            self.assertEqual(fingerprint["sha256"], "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
            self.assertEqual(fingerprint["bytes"], 3)

    def test_file_fingerprint_handles_missing_file(self) -> None:
        fingerprint = loop.file_fingerprint(Path("/tmp/definitely-missing-mwf-file"))

        self.assertFalse(fingerprint["exists"])
        self.assertNotIn("sha256", fingerprint)

    def test_collects_prompt_skill_version_shape(self) -> None:
        versions = loop.collect_prompt_skill_versions("adam-eve")

        self.assertIn("actor_skill_runtime", versions)
        self.assertIn("scorer_skill_runtime", versions)
        self.assertIn("improver_skill_runtime", versions)
        self.assertIn("mwf_stage_prompts", versions)
        self.assertTrue(versions["mwf_stage_prompts"]["exists"])
        self.assertIn("sha256", versions["mwf_stage_prompts"])
        self.assertIsInstance(versions["prompt_proposals"], list)

    def test_compares_prompt_skill_version_changes(self) -> None:
        previous = {
            "actor_skill_runtime": {
                "path": "/tmp/actor.md",
                "exists": True,
                "sha256": "old",
            },
            "prompt_proposals": [
                {
                    "path": "/tmp/v01.md",
                    "exists": True,
                    "sha256": "same",
                }
            ],
        }
        current = {
            "actor_skill_runtime": {
                "path": "/tmp/actor.md",
                "exists": True,
                "sha256": "new",
            },
            "prompt_proposals": [
                {
                    "path": "/tmp/v01.md",
                    "exists": True,
                    "sha256": "same",
                },
                {
                    "path": "/tmp/v02.md",
                    "exists": True,
                    "sha256": "added",
                },
            ],
        }

        diff = loop.compare_prompt_skill_versions(previous, current)

        self.assertEqual(diff["status"], "changed")
        changes = {change["path"]: change for change in diff["changes"]}
        self.assertEqual(changes["/tmp/actor.md"]["status"], "changed")
        self.assertEqual(changes["/tmp/v02.md"]["status"], "added")

    def test_compares_prompt_skill_versions_as_unchanged(self) -> None:
        versions = {"mwf_stage_prompts": {"path": "/tmp/stage.ts", "exists": True, "sha256": "same"}}

        diff = loop.compare_prompt_skill_versions(versions, versions)

        self.assertEqual(diff["status"], "unchanged")
        self.assertEqual(diff["changes"], [])


class StartPointTest(unittest.TestCase):
    def test_seeded_target_stage_rejects_single_participant_stage_for_main_loop(self) -> None:
        with self.assertRaises(loop.GoldLoopError):
            loop.seeded_session_from_target_stage("adam-eve", "CREATED", "http://api", "http://app")

    def test_seeded_target_stage_maps_e2e_response_to_actor_urls(self) -> None:
        original_post_json = loop.post_json

        def fake_post_json(url: str, payload: dict, timeout: float = 10.0) -> dict:
            return {
                "success": True,
                "data": {
                    "session": {"id": "session-1"},
                    "userA": {"id": "adam-id", "email": "adam@e2e.test"},
                    "userB": {"id": "eve-id", "email": "eve@e2e.test"},
                    "pageUrls": {
                        "userA": "http://localhost:8081/session/session-1?e2e-user-id=adam-id",
                        "userB": "http://localhost:8081/session/session-1?e2e-user-id=eve-id",
                    },
                },
            }

        try:
            loop.post_json = fake_post_json
            session = loop.seeded_session_from_target_stage(
                "adam-eve",
                "EMPATHY_REVEALED",
                "http://localhost:3000",
                "http://localhost:8082",
            )
        finally:
            loop.post_json = original_post_json

        self.assertEqual(session["SESSION_ID"], "session-1")
        self.assertEqual(session["ASSIGNED_CHARACTER"], "Adam")
        self.assertEqual(session["PARTNER_CHARACTER"], "Eve")
        self.assertTrue(session["ASSIGNED_URL"].startswith("http://localhost:8082/session/session-1"))
        self.assertEqual(session["TARGET_STAGE"], "EMPATHY_REVEALED")

    def test_parser_accepts_snapshot_and_target_stage_start_options(self) -> None:
        parser = loop.build_parser()

        args = parser.parse_args(
            [
                "run",
                "--seed-target-stage",
                "EMPATHY_REVEALED",
                "--from-snapshot",
                "snapshot-name",
                "--snapshot-session-id",
                "session-1",
            ]
        )

        self.assertEqual(args.seed_target_stage, "EMPATHY_REVEALED")
        self.assertEqual(args.from_snapshot, "snapshot-name")
        self.assertEqual(args.snapshot_session_id, "session-1")


class ServiceManagementTest(unittest.TestCase):
    def test_parser_accepts_start_services(self) -> None:
        parser = loop.build_parser()

        args = parser.parse_args(["run", "--start-services"])

        self.assertTrue(args.start_services)

    def test_service_record_is_json_safe(self) -> None:
        service = loop.ManagedService(
            name="backend",
            command=["npm", "run", "dev:api"],
            cwd=Path("/tmp"),
            log_path=Path("/tmp/backend.log"),
            started=True,
            pid=123,
        )

        record = loop.service_record(service)

        self.assertEqual(record["name"], "backend")
        self.assertEqual(record["pid"], 123)
        self.assertEqual(record["cwd"], "/tmp")

    def test_stop_managed_services_ignores_existing_services(self) -> None:
        service = loop.ManagedService(
            name="web",
            command=[],
            cwd=Path("/tmp"),
            log_path=Path("/tmp/web.log"),
            started=False,
            pid=None,
        )

        result = loop.stop_managed_services([service])

        self.assertFalse(result["web"]["started"])
        self.assertFalse(result["web"]["stopped"])

    def test_start_services_failure_writes_logs_and_cleans_started_processes(self) -> None:
        class FakeProcess:
            def __init__(self) -> None:
                self.terminated = False

            def terminate(self) -> None:
                self.terminated = True

            def wait(self, timeout: int) -> int:
                del timeout
                return 143

        process = FakeProcess()
        original_http_ok = loop.http_ok
        original_wait_for_http = loop.wait_for_http
        original_start_background_command = loop.start_background_command

        def fake_http_ok(url: str, *args, **kwargs) -> bool:
            del args, kwargs
            return not url.endswith("/health")

        def fake_wait_for_http(url: str, timeout: int = 90) -> bool:
            del url, timeout
            return False

        def fake_start_background_command(name, cmd, cwd, env, log_path):
            del cmd, env
            return loop.ManagedService(
                name=name,
                command=["fake", name],
                cwd=cwd,
                log_path=log_path,
                started=True,
                pid=456,
                process=process,
            )

        with tempfile.TemporaryDirectory() as tmp:
            args = SimpleNamespace(api_url="http://localhost:3000", app_url="http://localhost:8082")
            try:
                loop.http_ok = fake_http_ok
                loop.wait_for_http = fake_wait_for_http
                loop.start_background_command = fake_start_background_command

                with self.assertRaises(loop.GoldLoopError):
                    loop.start_loop_services(args, Path(tmp))
            finally:
                loop.http_ok = original_http_ok
                loop.wait_for_http = original_wait_for_http
                loop.start_background_command = original_start_background_command

            services = json.loads((Path(tmp) / "services.json").read_text(encoding="utf-8"))
            cleanup = json.loads((Path(tmp) / "cleanup.json").read_text(encoding="utf-8"))

        self.assertTrue(process.terminated)
        self.assertEqual(services["status"], "fail")
        self.assertIn("Backend did not become healthy", services["failure"])
        self.assertEqual(services["services"][0]["name"], "backend")
        self.assertTrue(cleanup["backend"]["stopped"])


class LoopSummaryTest(unittest.TestCase):
    def test_normalizes_dimension_owners_and_targets(self) -> None:
        score = {
            "overall_score": 3.5,
            "dimensions": {
                "actor_fidelity": {"score": 3, "pass": False, "rationale": "too agreeable", "evidence": ["a"]},
                "mwf_handling": {"score": 4, "pass": True, "rationale": "ok", "evidence": ["m"]},
            },
        }
        normalized = loop.normalize_score_routing(score, target_score=4.0)
        self.assertEqual(normalized["dimensions"]["actor_fidelity"]["owner"], "actor_skill")
        self.assertEqual(normalized["dimensions"]["actor_fidelity"]["recommended_action"], "patch_skill")
        self.assertEqual(normalized["dimensions"]["mwf_handling"]["owner"], "mwf_prompts")
        self.assertEqual(normalized["dimensions"]["mwf_handling"]["recommended_action"], "none")
        self.assertEqual(normalized["improvement_targets"][0]["owner"], "actor_skill")
        self.assertEqual(normalized["gold_alignment"]["status"], "missing")
        self.assertTrue(any(target["owner"] == "eval_harness" for target in normalized["improvement_targets"]))

    def test_preserves_existing_gold_alignment(self) -> None:
        score = {
            "overall_score": 4,
            "dimensions": {},
            "gold_alignment": {
                "actor_fidelity": {"adam": {"stage1": {"persona_alignment": 4}}},
                "mwf_guidance": {"adam": {"stage1": {"guidance_alignment": 4}}},
            },
        }
        normalized = loop.normalize_score_routing(score, target_score=4.0)
        self.assertNotIn("status", normalized["gold_alignment"])
        self.assertEqual(normalized["gold_alignment"]["actor_fidelity"]["adam"]["stage1"]["persona_alignment"], 4)

    def test_writes_summary_with_next_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            score = {
                "overall_score": 3.5,
                "verdict": "eval_fail",
                "dimensions": {"mwf_handling": {"score": 3, "pass": False}},
                "improvement_targets": [
                    {"owner": "mwf_prompts", "dimension": "mwf_handling", "recommended_action": "patch_prompt"}
                ],
                "gold_alignment": {
                    "actor_fidelity": {"adam": {"stage1": {"persona_alignment": 4}}},
                    "mwf_guidance": {"adam": {"stage1": {"guidance_alignment": 3}}},
                },
                "hard_invariants": [],
                "human_review": {"required": True, "status": "needs_human_review", "notes": "thin artifacts"},
            }
            run_data = {
                "scenario": "adam-eve",
                "iteration": 1,
                "session_id": "s",
                "stop_after_stage": 1,
                "target_score": 4.0,
                "status_history": [
                    {
                        "side": "adam",
                        "turn": 1,
                        "status": {"state": "stage_limit_reached", "stage": 1, "blocked_on": None},
                    }
                ],
                "transcripts": [],
                "scratch_logs": ["scratch.md"],
            }
            loop.write_loop_summary(run_dir, run_data, score, improved=True)
            text = (run_dir / "loop-summary.md").read_text(encoding="utf-8")
            self.assertIn("Target not reached. Improver ran", text)
            self.assertIn("`mwf_handling`: `3` pass=`False`", text)
            self.assertIn("owner=`mwf_prompts`, dimension=`mwf_handling`, action=`patch_prompt`", text)
            self.assertIn("Gold alignment: `present` actor_sides=`1` mwf_sides=`1`", text)
            self.assertIn("Human review: `needs_human_review`", text)

    def test_writes_top_level_summary_across_iterations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run1 = root / "iter-01"
            run2 = root / "iter-02"
            run1.mkdir()
            run2.mkdir()
            (run1 / "run.json").write_text(
                json.dumps(
                    {
                        "start": {"mode": "target_stage", "target_stage": "EMPATHY_REVEALED"},
                        "score_movement": {"classification": "incomparable"},
                        "prompt_skill_version_changes": {"status": "incomparable", "changes": []},
                        "services": {
                            "services": [
                                {"name": "backend", "started": False, "pid": None, "log_path": "/tmp/backend.log"}
                            ]
                        },
                    }
                ),
                encoding="utf-8",
            )
            (run2 / "run.json").write_text(
                json.dumps(
                    {
                        "start": {"mode": "snapshot", "snapshot": "snap-1", "session_id": "session-1"},
                        "score_movement": {"classification": "improvement"},
                        "prompt_skill_version_changes": {
                            "status": "changed",
                            "changes": [
                                {
                                    "path": "/tmp/v02.md",
                                    "status": "added",
                                    "before_sha256": None,
                                    "after_sha256": "abc",
                                }
                            ],
                        },
                    }
                ),
                encoding="utf-8",
            )
            (run1 / "score.json").write_text(
                json.dumps(
                    {
                        "overall_score": 2.5,
                        "verdict": "eval_fail",
                        "improvement_targets": [
                            {
                                "owner": "mwf_prompts",
                                "dimension": "mwf_handling",
                                "recommended_action": "patch_prompt",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (run2 / "score.json").write_text(
                json.dumps(
                    {
                        "overall_score": 3.5,
                        "verdict": "eval_warn",
                        "improvement_targets": [
                            {
                                "owner": "actor_skill",
                                "dimension": "actor_fidelity",
                                "recommended_action": "patch_skill",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (run2 / "improvement-plan.md").write_text("# Plan\n", encoding="utf-8")
            (run2 / "patch-summary.md").write_text("# Patch\n", encoding="utf-8")
            (run2 / "verification.json").write_text(
                json.dumps({"commands": ["python3 scripts/test_mwf_gold_loop.py"], "status": "pass"}),
                encoding="utf-8",
            )
            results = [
                loop.IterationResult(run_dir=run1, score=2.5, verdict="eval_fail", improved=True),
                loop.IterationResult(run_dir=run2, score=3.5, verdict="eval_warn", improved=True),
            ]
            summary = root / "adam-eve-loop-summary.md"

            loop.write_top_level_loop_summary(summary, "adam-eve", 4.0, results)

            text = summary.read_text(encoding="utf-8")
            self.assertIn("Target reached: `False`", text)
            self.assertIn("delta=`+1.00`", text)
            self.assertIn("movement=`improvement`", text)
            self.assertIn("mode=`target_stage` target_stage=`EMPATHY_REVEALED`", text)
            self.assertIn("mode=`snapshot` snapshot=`snap-1` session=`session-1`", text)
            self.assertIn("`backend` started=`False`", text)
            self.assertIn("status=`changed` changes=`1`", text)
            self.assertIn("added: `/tmp/v02.md`", text)
            self.assertIn("`mwf_prompts`: `1` target(s)", text)
            self.assertIn("`actor_skill`: `1` target(s)", text)
            self.assertIn("patch-summary.md", text)
            self.assertIn("python3 scripts/test_mwf_gold_loop.py", text)
            self.assertIn("Improvement ran but target was not reached", text)


if __name__ == "__main__":
    unittest.main()
