import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mwf_gold_loop import (
    Actor,
    ActorStatus,
    actor_satisfies_stop_boundary,
    check_stage4_score_critical_content,
    check_transcript_shared_context_blocks_labeled,
    check_transcript_side_stage_metadata,
    choose_next_actor,
    normalize_actor_status,
    run_invariant_checks,
)


class GoldLoopActorHandoffTest(unittest.TestCase):
    def actor(self, side: str, status: ActorStatus | None = None) -> Actor:
        actor = Actor(character=side.title(), url=f"http://localhost/{side}")
        actor.status = status
        return actor

    def test_stage_limit_needs_partner_with_partner_block_is_not_terminal(self) -> None:
        actor = self.actor(
            "catherine",
            ActorStatus(
                side="catherine",
                session_id="session-1",
                stage=4,
                state="needs_partner",
                blocked_on="james",
            ),
        )

        self.assertFalse(actor_satisfies_stop_boundary(actor, 4))

    def test_stage_limit_with_blocked_on_is_not_terminal(self) -> None:
        actor = self.actor(
            "eve",
            ActorStatus(
                side="eve",
                session_id="session-1",
                stage=4,
                state="stage_limit_reached",
                blocked_on="adam",
            ),
        )

        self.assertFalse(actor_satisfies_stop_boundary(actor, 4))

    def test_terminal_status_with_blocker_is_normalized_to_partner_wait(self) -> None:
        status = normalize_actor_status(
            ActorStatus(
                side="catherine",
                session_id="session-1",
                stage=4,
                state="stage_limit_reached",
                blocked_on="james",
                next_action_needed="James needs to submit selections.",
            )
        )

        self.assertEqual(status.state, "needs_partner")
        self.assertEqual(status.blocked_on, "james")
        self.assertEqual(status.stage, 4)

    def test_stage4_handoff_resumes_partner_after_selection_wait_changes_sides(self) -> None:
        james = self.actor(
            "james",
            ActorStatus(
                side="james",
                session_id="session-1",
                stage=4,
                state="needs_partner",
                blocked_on="catherine",
            ),
        )
        catherine = self.actor(
            "catherine",
            ActorStatus(
                side="catherine",
                session_id="session-1",
                stage=4,
                state="needs_partner",
                blocked_on="james",
            ),
        )

        next_actor = choose_next_actor(
            {"james": james, "catherine": catherine},
            last_side="james",
            stop_after_stage=4,
        )

        self.assertIs(next_actor, catherine)

    def test_later_partner_block_can_reopen_actor_that_reached_stage_limit(self) -> None:
        adam = self.actor(
            "adam",
            ActorStatus(
                side="adam",
                session_id="session-1",
                stage=4,
                state="stage_limit_reached",
            ),
        )
        adam.turns = 2
        eve = self.actor(
            "eve",
            ActorStatus(
                side="eve",
                session_id="session-1",
                stage=4,
                state="needs_partner",
                blocked_on="adam",
            ),
        )
        eve.turns = 3

        next_actor = choose_next_actor(
            {"adam": adam, "eve": eve},
            last_side="eve",
            stop_after_stage=4,
        )

        self.assertIs(next_actor, adam)

    def test_stage_limit_actor_is_not_reopened_for_stale_partner_block(self) -> None:
        adam = self.actor(
            "adam",
            ActorStatus(
                side="adam",
                session_id="session-1",
                stage=4,
                state="stage_limit_reached",
            ),
        )
        adam.turns = 4
        eve = self.actor(
            "eve",
            ActorStatus(
                side="eve",
                session_id="session-1",
                stage=4,
                state="needs_partner",
                blocked_on="adam",
            ),
        )
        eve.turns = 3

        next_actor = choose_next_actor(
            {"adam": adam, "eve": eve},
            last_side="adam",
            stop_after_stage=4,
        )

        self.assertIs(next_actor, eve)

    def test_stage4_content_invariant_fails_marker_only_transcript(self) -> None:
        transcripts = [
            (
                Path("adam-stage4.md"),
                "\n".join(
                    [
                        "# Adam Stage 4 Transcript",
                        "- side: `adam`",
                        "- stage: `4`",
                        "- visible_cta_state: captured",
                        "",
                        "## Events",
                        "You have both checked the needs lists.",
                        "### ✅ STAGE 4 COMPLETED",
                    ]
                ),
            ),
            (
                Path("eve-stage4.md"),
                "\n".join(
                    [
                        "# Eve Stage 4 Transcript",
                        "- side: `eve`",
                        "- stage: `4`",
                        "- visible_cta_state: captured",
                        "",
                        "## Events",
                        "You have both checked the needs lists.",
                        "### ✅ STAGE 4 COMPLETED",
                    ]
                ),
            ),
        ]

        result = check_stage4_score_critical_content(transcripts, "adam-eve", 4)

        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["severity"], "hard")
        self.assertTrue(any("adam-stage4.md: missing proposal inventory" in item for item in result["evidence"]))
        self.assertTrue(any("eve-stage4.md: missing coverage audit" in item for item in result["evidence"]))

    def test_stage4_content_invariant_accepts_product_artifacts(self) -> None:
        body = "\n".join(
            [
                "# Adam Stage 4 Transcript",
                "- side: `adam`",
                "- stage: `4`",
                "- visible_cta_state: captured",
                "",
                "## Events",
                "### STAGE 4 PRODUCT ARTIFACTS",
                "Selection submitted: yes",
                "Partner selection submitted: yes",
                "#### STAGE 4 PROPOSAL INVENTORY",
                "- shared proposal (you): Weekly check-in",
                "  - Your selection: willing",
                "  - Partner selection: willing",
                "#### STAGE 4 NEEDS COVERAGE AUDIT",
                "- COVERED (you): steadiness",
                "#### STAGE 4 CLOSURE",
                "- Kind: SHARED_AGREEMENT",
            ]
        )
        transcripts = [
            (Path("adam-stage4.md"), body),
            (Path("eve-stage4.md"), body.replace("Adam", "Eve").replace("`adam`", "`eve`")),
        ]

        result = check_stage4_score_critical_content(transcripts, "adam-eve", 4)

        self.assertEqual(result["status"], "pass")

    def test_target_stage_transcript_metadata_requires_only_seeded_stage(self) -> None:
        body = "\n".join(
            [
                "# Adam Stage 4 Transcript",
                "- side: `adam`",
                "- stage: `4`",
                "- visible_cta_state: captured",
            ]
        )
        transcripts = [
            (Path("adam-stage4.md"), body),
            (Path("eve-stage4.md"), body.replace("Adam", "Eve").replace("`adam`", "`eve`")),
        ]

        result = check_transcript_side_stage_metadata(transcripts, "adam-eve", 4, {4})[0]

        self.assertEqual(result["status"], "pass")

    def test_milestone_separator_blocks_do_not_require_shared_context_label(self) -> None:
        transcripts = [
            (
                Path("adam-stage0.md"),
                "\n".join(
                    [
                        "# Adam Stage 0 Transcript",
                        "",
                        "- side: `adam`",
                        "- stage: `0`",
                        "",
                        "---",
                        "### 🎯 STAGE 0 STARTED",
                        "*2026-05-08 20:34:37*",
                        "---",
                        "",
                    ]
                ),
            )
        ]

        result = check_transcript_shared_context_blocks_labeled(transcripts)

        self.assertEqual(result["status"], "pass")

    def test_target_stage_invariants_skip_stage1_felt_heard_requirement(self) -> None:
        import tempfile

        body = "\n".join(
            [
                "# Adam Stage 4 Transcript",
                "- side: `adam`",
                "- stage: `4`",
                "- visible_cta_state: captured",
                "",
                "## Events",
                "### STAGE 4 PRODUCT ARTIFACTS",
                "Selection submitted: yes",
                "Partner selection submitted: yes",
                "#### STAGE 4 PROPOSAL INVENTORY",
                "- shared proposal (you): Weekly check-in",
                "  - Your selection: willing",
                "  - Partner selection: willing",
                "#### STAGE 4 NEEDS COVERAGE AUDIT",
                "- COVERED (you): steadiness",
                "#### STAGE 4 CLOSURE",
                "- Kind: SHARED_AGREEMENT",
            ]
        )

        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            adam_path = run_dir / "adam-stage4.md"
            eve_path = run_dir / "eve-stage4.md"
            adam_path.write_text(body, encoding="utf-8")
            eve_path.write_text(body.replace("Adam", "Eve").replace("`adam`", "`eve`"), encoding="utf-8")
            run_data = {
                "start": {"mode": "target_stage", "target_stage": "NEED_MAPPING_COMPLETE"},
                "transcripts": [str(adam_path), str(eve_path)],
                "status_history": [
                    {"side": "adam", "status": {"side": "adam", "stage": 4, "state": "completed"}},
                    {"side": "eve", "status": {"side": "eve", "stage": 4, "state": "completed"}},
                ],
            }

            result = run_invariant_checks(run_dir, run_data, "adam-eve", 4)

        self.assertEqual(result["status"], "pass")


if __name__ == "__main__":
    unittest.main()
