import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mwf_gold_loop import (
    Actor,
    ActorStatus,
    actor_satisfies_stop_boundary,
    build_actor_prompt,
    check_stage4_score_critical_content,
    check_db_stage_state_matches_stop_gate,
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

    def test_stage2_partner_wait_does_not_satisfy_stop_boundary(self) -> None:
        actor = self.actor(
            "eve",
            ActorStatus(
                side="eve",
                session_id="session-1",
                stage=2,
                state="needs_partner",
                blocked_on="adam",
            ),
        )

        self.assertFalse(actor_satisfies_stop_boundary(actor, 2))

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

    def test_stage2_one_sided_partner_wait_resumes_blocked_partner(self) -> None:
        adam = self.actor(
            "adam",
            ActorStatus(
                side="adam",
                session_id="session-1",
                stage=2,
                state="stage_limit_reached",
            ),
        )
        adam.turns = 1
        eve = self.actor(
            "eve",
            ActorStatus(
                side="eve",
                session_id="session-1",
                stage=2,
                state="needs_partner",
                blocked_on="adam",
            ),
        )
        eve.turns = 1

        next_actor = choose_next_actor(
            {"adam": adam, "eve": eve},
            last_side="eve",
            stop_after_stage=2,
        )

        self.assertIs(next_actor, adam)

    def test_stage2_reciprocal_partner_wait_resumes_last_blocked_partner(self) -> None:
        adam = self.actor(
            "adam",
            ActorStatus(
                side="adam",
                session_id="session-1",
                stage=2,
                state="needs_partner",
                blocked_on="eve",
            ),
        )
        adam.turns = 1
        eve = self.actor(
            "eve",
            ActorStatus(
                side="eve",
                session_id="session-1",
                stage=2,
                state="needs_partner",
                blocked_on="adam",
            ),
        )
        eve.turns = 1

        next_actor = choose_next_actor(
            {"adam": adam, "eve": eve},
            last_side="eve",
            stop_after_stage=2,
        )

        self.assertIs(next_actor, adam)

    def test_actor_prompt_requires_stage2_post_empathy_share_review(self) -> None:
        adam = self.actor("adam")
        eve = self.actor("eve")

        prompt = build_actor_prompt(adam, eve, "session-1", 2, Path("/tmp/run"), "adam-eve")

        self.assertIn('Share this with Eve? Review', prompt)
        self.assertIn("Do not stop merely because an empathy attempt was submitted", prompt)

    def test_actor_prompt_requires_clicking_gate_ctas_not_typed_chat(self) -> None:
        adam = self.actor("adam")
        eve = self.actor("eve")

        prompt = build_actor_prompt(adam, eve, "session-1", 2, Path("/tmp/run"), "adam-eve")

        self.assertIn("click the CTA", prompt)
        self.assertIn("Do not type a chat message to satisfy a product gate", prompt)
        self.assertNotIn("typed confirmation", prompt)
        self.assertNotIn('such as "I feel heard" / "Ready"', prompt)

    def test_db_stage_state_fails_when_messages_never_reach_claimed_stage(self) -> None:
        run_data = {
            "db_stage_state": {
                "users": [
                    {"id": "u-adam", "name": "Adam"},
                    {"id": "u-eve", "name": "Eve"},
                ],
                "stageProgress": [
                    {"userId": "u-adam", "stage": 0, "status": "COMPLETED", "gates": {"compactSigned": True}},
                    {"userId": "u-eve", "stage": 0, "status": "COMPLETED", "gates": {"compactSigned": True}},
                ],
                "empathyAttempts": [],
                "messageStages": [
                    {"role": "USER", "stage": 0, "senderId": "u-adam", "contentPrefix": "Stage 2-looking chat text"},
                    {"role": "AI", "stage": 0, "forUserId": "u-adam", "contentPrefix": "Next step: Walking in Their Shoes"},
                ],
            }
        }

        result = check_db_stage_state_matches_stop_gate(run_data, "adam-eve", 2)

        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["severity"], "hard")
        self.assertTrue(any("missing StageProgress stage 1" in item for item in result["evidence"]))
        self.assertTrue(any("highest Message.stage is 0" in item for item in result["evidence"]))

    def test_db_stage_state_requires_real_stage2_lifecycle_not_actor_status_only(self) -> None:
        run_data = {
            "status_history": [
                {"side": "adam", "status": {"stage": 2, "state": "stage_limit_reached"}},
                {"side": "eve", "status": {"stage": 2, "state": "needs_partner", "blocked_on": "adam"}},
            ],
            "db_stage_state": {
                "users": [
                    {"id": "u-adam", "name": "Adam"},
                    {"id": "u-eve", "name": "Eve"},
                ],
                "stageProgress": [
                    {"userId": "u-adam", "stage": 0, "status": "COMPLETED", "gates": {"compactSigned": True}},
                    {"userId": "u-adam", "stage": 1, "status": "COMPLETED", "gates": {"feelHeardConfirmed": True}},
                    {"userId": "u-adam", "stage": 2, "status": "IN_PROGRESS", "gates": {}},
                    {"userId": "u-eve", "stage": 0, "status": "COMPLETED", "gates": {"compactSigned": True}},
                    {"userId": "u-eve", "stage": 1, "status": "COMPLETED", "gates": {"feelHeardConfirmed": True}},
                    {"userId": "u-eve", "stage": 2, "status": "IN_PROGRESS", "gates": {}},
                ],
                "empathyAttempts": [
                    {"sourceUserId": "u-adam", "status": "HELD"},
                    {"sourceUserId": "u-eve", "status": "AWAITING_SHARING"},
                ],
                "messageStages": [
                    {"role": "USER", "stage": 2, "senderId": "u-adam", "contentPrefix": "I can see Eve's side."},
                    {"role": "USER", "stage": 2, "senderId": "u-eve", "contentPrefix": "I can see Adam's side."},
                ],
            },
        }

        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            actor_result = run_invariant_checks(Path(tmp), run_data, "adam-eve", 2)
            db_result = next(check for check in actor_result["checks"] if check["id"] == "db_stage_state_matches_stop_gate")

        self.assertEqual(db_result["status"], "fail")
        self.assertTrue(any("Stage 2 DB status 'IN_PROGRESS'" in item for item in db_result["evidence"]))
        self.assertTrue(any("EmpathyAttempt status 'HELD'" in item for item in db_result["evidence"]))

    def test_db_stage_state_accepts_stage2_gate_pending_with_ready_attempts(self) -> None:
        run_data = {
            "db_stage_state": {
                "users": [
                    {"id": "u-adam", "name": "Adam"},
                    {"id": "u-eve", "name": "Eve"},
                ],
                "stageProgress": [
                    {"userId": "u-adam", "stage": 0, "status": "COMPLETED", "gates": {"compactSigned": True}},
                    {"userId": "u-adam", "stage": 1, "status": "COMPLETED", "gates": {"feelHeardConfirmed": True}},
                    {"userId": "u-adam", "stage": 2, "status": "GATE_PENDING", "gates": {}},
                    {"userId": "u-eve", "stage": 0, "status": "COMPLETED", "gates": {"compactSigned": True}},
                    {"userId": "u-eve", "stage": 1, "status": "COMPLETED", "gates": {"feelHeardConfirmed": True}},
                    {"userId": "u-eve", "stage": 2, "status": "GATE_PENDING", "gates": {}},
                ],
                "empathyAttempts": [
                    {"sourceUserId": "u-adam", "status": "READY"},
                    {"sourceUserId": "u-eve", "status": "READY"},
                ],
                "messageStages": [
                    {"role": "USER", "stage": 2, "senderId": "u-adam", "contentPrefix": "I can see Eve's side."},
                    {"role": "USER", "stage": 2, "senderId": "u-eve", "contentPrefix": "I can see Adam's side."},
                ],
            }
        }

        result = check_db_stage_state_matches_stop_gate(run_data, "adam-eve", 2)

        self.assertEqual(result["status"], "pass")

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
                "db_stage_state": {
                    "users": [
                        {"id": "u-adam", "name": "Adam"},
                        {"id": "u-eve", "name": "Eve"},
                    ],
                    "stageProgress": [
                        {"userId": "u-adam", "stage": 4, "status": "COMPLETED", "gates": {}},
                        {"userId": "u-eve", "stage": 4, "status": "COMPLETED", "gates": {}},
                    ],
                    "empathyAttempts": [],
                    "messageStages": [
                        {"role": "USER", "stage": 4, "senderId": "u-adam", "contentPrefix": "Stage 4"},
                        {"role": "USER", "stage": 4, "senderId": "u-eve", "contentPrefix": "Stage 4"},
                    ],
                },
                "status_history": [
                    {"side": "adam", "status": {"side": "adam", "stage": 4, "state": "completed"}},
                    {"side": "eve", "status": {"side": "eve", "stage": 4, "state": "completed"}},
                ],
            }

            result = run_invariant_checks(run_dir, run_data, "adam-eve", 4)

        self.assertEqual(result["status"], "pass")


if __name__ == "__main__":
    unittest.main()
