#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from bot_harness import github_check, run
from bot_harness.activity_journal import render_recent
from bot_harness.agent_runtime import cleanup, setup_agent
from bot_harness.config import BotConfig
from bot_harness.dispatcher import build_prompt, dispatch_labels, scheduled
from bot_harness.json_store import append_jsonl, read_json, write_json
from bot_harness.queue import process_one, select_next, slack_cancelled
from bot_harness.registry import LabelRegistry
from bot_harness.shared_state import create_queue_entry


LEAK_PATTERNS = [
    "LovelyBot",
    "@LvlyBot",
    "lvlybot",
    "LvlyAI/lovely",
    "/opt/lovely-bot",
    "lovely-bot",
    "peter-app",
    "C08SNTYV3AK",
    "C0AM2J47R4L",
]


def write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


class HarnessTests(unittest.TestCase):
    def env(self, tmp: Path) -> dict[str, str]:
        project = tmp / "repo" / "meet-without-fear"
        scripts = project / "scripts/ec2-bot/scripts"
        workspaces = project / "bot-workspaces"
        for path in [
            scripts,
            scripts / "lib",
            workspaces / "bug-fix",
            tmp / "logs",
            tmp / "state",
            tmp / "queue",
            tmp / "active",
        ]:
            path.mkdir(parents=True, exist_ok=True)
        write_json(
            workspaces / "label-registry.json",
            {
                "labels": {
                    "bot:bug-fix": {
                        "trigger": "label",
                        "workspace": "bug-fix/",
                        "entry_stage": "01-triage",
                        "provider": "codex",
                        "fallback_provider": "claude",
                        "model": "gpt-5.3-codex",
                        "effort": "high",
                        "max_concurrent": 1,
                    }
                }
            },
        )
        write_executable(scripts / "check-resources.sh", "#!/bin/bash\nexit 0\n")
        write_executable(scripts / "run-claude.sh", "#!/bin/bash\necho \"$@\" >> \"$BOT_LOG_DIR/run-claude.calls\"\n")
        return {
            "BOT_HOME": str(tmp / "home"),
            "BOT_LOG_DIR": str(tmp / "logs"),
            "BOT_STATE_DIR": str(tmp / "state"),
            "BOT_QUEUE_DIR": str(tmp / "queue"),
            "REPO_ROOT": str(tmp / "repo"),
            "PROJECT_DIR": str(project),
            "WORKSPACES_DIR": str(workspaces),
            "ACTIVE_DIR": str(tmp / "active"),
            "BOT_SCRIPTS_DIR": str(scripts),
            "LOCK_PREFIX": str(tmp / "lock"),
            "SLACK_BOT_TOKEN": "",
            "GITHUB_REPO": "shantamg/meet-without-fear",
            "BOT_HARNESS_SYNC": "1",
            "BOT_HARNESS_NO_GH_MUTATION": "1",
        }

    def test_queue_priority_fifo_and_metadata_dispatch(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            with patch.dict(os.environ, env, clear=False):
                qdir = Path(env["BOT_QUEUE_DIR"])
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                write_json(qdir / "queue-1.json", {"command_slug": "low-one", "priority": "low", "queued_at": now})
                write_json(qdir / "queue-2.json", {"command_slug": "normal-one", "priority": "normal", "prompt": "p", "queued_at": now, "provider": "codex", "fallback_provider": "claude", "review_provider": "codex", "model": "m", "effort": "high", "session_key": "s", "entry_stage": "stage"})
                self.assertEqual(select_next(qdir).name, "queue-2.json")
                self.assertEqual(process_one(BotConfig.from_env()), 0)
                calls = (Path(env["BOT_LOG_DIR"]) / "run-claude.calls").read_text(encoding="utf-8")
                self.assertIn("--session s", calls)
                self.assertFalse((qdir / "queue-2.json").exists())

    def test_queue_updates_slack_reactions_when_dequeued(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            env["SLACK_BOT_TOKEN"] = "fake-token"
            with patch.dict(os.environ, env, clear=False):
                qdir = Path(env["BOT_QUEUE_DIR"])
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                write_json(
                    qdir / "queue-1.json",
                    {
                        "command_slug": "normal-one",
                        "priority": "normal",
                        "prompt": "p",
                        "queued_at": now,
                        "slack_channel": "C1",
                        "slack_ts": "123.456",
                    },
                )
                calls = []
                with (
                    patch("bot_harness.queue.slack_cancelled", return_value=False),
                    patch("bot_harness.queue.slack_post", side_effect=lambda _config, endpoint, payload: calls.append((endpoint, payload))),
                ):
                    process_one(BotConfig.from_env())
                self.assertEqual(
                    [(endpoint, payload["name"]) for endpoint, payload in calls],
                    [
                        ("reactions.remove", "hourglass_flowing_sand"),
                        ("reactions.remove", "zzz"),
                        ("reactions.add", "eyes"),
                    ],
                )

    def test_queue_slack_cancel_checks_thread_replies_endpoint(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            env["SLACK_BOT_TOKEN"] = "fake-token"
            item = {
                "command_slug": "threaded",
                "slack_channel": "C1",
                "slack_ts": "123.456",
                "thread_ts": "111.000",
            }

            class FakeResponse:
                def read(self):
                    return json.dumps(
                        {
                            "messages": [
                                {"ts": "123.456", "reactions": [{"name": "x"}]},
                            ]
                        }
                    ).encode("utf-8")

            urls = []
            with patch.dict(os.environ, env, clear=False):
                config = BotConfig.from_env()
                with (
                    patch("bot_harness.queue.request.urlopen", side_effect=lambda req, timeout=10: urls.append(req.full_url) or FakeResponse()),
                    patch("bot_harness.queue.mark_cancelled"),
                ):
                    self.assertTrue(slack_cancelled(config, item, Path(env["BOT_LOG_DIR"]) / "process-queue.log"))

            self.assertIn("conversations.replies", urls[0])
            self.assertIn("ts=111.000", urls[0])

    def test_queue_ttl_retry_thread_and_workspace_gates(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            with patch.dict(os.environ, env, clear=False):
                qdir = Path(env["BOT_QUEUE_DIR"])
                old = (datetime.now(timezone.utc) - timedelta(minutes=500)).strftime("%Y-%m-%dT%H:%M:%SZ")
                write_json(qdir / "queue-old.json", {"command_slug": "old", "priority": "high", "queued_at": old})
                process_one(BotConfig.from_env())
                self.assertFalse((qdir / "queue-old.json").exists())

                active = Path(env["ACTIVE_DIR"]) / f"agent-{os.getpid()}"
                active.mkdir()
                write_json(active / "meta.json", {"channel": "C1", "messageTs": "111", "workspace": "bug-fix"})
                write_json(qdir / "queue-thread.json", {"command_slug": "thread", "priority": "high", "queued_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "channel": "C1", "thread_ts": "111"})
                process_one(BotConfig.from_env())
                queued = [read_json(p, {}) for p in qdir.glob("queue-*.json")]
                self.assertEqual(queued[0]["retries"], 1)

    def test_dispatcher_prompt_registry_scheduled_and_claim(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            state = Path(env["BOT_STATE_DIR"]) / "github-state.json"
            write_json(
                state,
                {
                    "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "issues": {
                        "42": {
                            "number": 42,
                            "title": "Fix it",
                            "labels": ["bot:bug-fix"],
                            "updatedAt": "2026-05-07T00:00:00Z",
                            "assignees": [],
                        }
                    },
                    "prs": {},
                },
            )
            with patch.dict(os.environ, env, clear=False):
                registry = LabelRegistry(Path(env["WORKSPACES_DIR"]) / "label-registry.json")
                prompt = build_prompt(42, "Fix it", "bot:bug-fix", "bug-fix", "01-triage", "shantamg/meet-without-fear")
                self.assertIn("Issue: #42", prompt)
                self.assertIn("Label: bot:bug-fix", prompt)
                self.assertIn("Entry Stage: 01-triage", prompt)
                scheduled(BotConfig.from_env(), registry, "bug-fix", "scheduled prompt", Path(env["BOT_LOG_DIR"]) / "workspace-dispatcher.log")
                dispatch_labels(BotConfig.from_env(), registry, Path(env["BOT_LOG_DIR"]) / "workspace-dispatcher.log")
                calls = (Path(env["BOT_LOG_DIR"]) / "run-claude.calls").read_text(encoding="utf-8")
                self.assertIn("--workspace bug-fix scheduled prompt", calls)
                self.assertIn("--workspace bug-fix Process GitHub issue #42", calls)
                self.assertFalse((Path(env["BOT_STATE_DIR"]) / "claims" / "claimed-ws-dispatch-42.txt").exists())
                log_text = (Path(env["BOT_LOG_DIR"]) / "workspace-dispatcher.log").read_text(encoding="utf-8")
                self.assertIn("Completed #42 (workspace=bug-fix)", log_text)

    def test_dispatcher_duplicate_check_skips_dispatch(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            state = Path(env["BOT_STATE_DIR"]) / "github-state.json"
            write_json(
                state,
                {
                    "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "issues": {
                        "42": {
                            "number": 42,
                            "title": "Fix it",
                            "labels": ["bot:bug-fix"],
                            "updatedAt": "2026-05-07T00:00:00Z",
                            "assignees": [],
                        }
                    },
                    "prs": {},
                },
            )
            write_executable(Path(env["BOT_SCRIPTS_DIR"]) / "check-duplicates.sh", "#!/bin/bash\nexit 1\n")
            with patch.dict(os.environ, env, clear=False):
                registry = LabelRegistry(Path(env["WORKSPACES_DIR"]) / "label-registry.json")
                dispatch_labels(BotConfig.from_env(), registry, Path(env["BOT_LOG_DIR"]) / "workspace-dispatcher.log")
                self.assertFalse((Path(env["BOT_LOG_DIR"]) / "run-claude.calls").exists())
                log_text = (Path(env["BOT_LOG_DIR"]) / "workspace-dispatcher.log").read_text(encoding="utf-8")
                self.assertIn("duplicate detected by check-duplicates.sh", log_text)

    def test_agent_metadata_cleanup_and_journal_render(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            agent_home = Path(env["ACTIVE_DIR"]) / f"agent-{os.getpid()}"
            env.update(
                {
                    "LIB_DIR": str(Path(env["BOT_SCRIPTS_DIR"]) / "lib"),
                    "AGENT_HOME": str(agent_home),
                    "LOGFILE": str(Path(env["BOT_LOG_DIR"]) / "agent.log"),
                    "COMMAND_SLUG": "fake",
                    "WORKSPACE_NAME": "bug-fix",
                    "MSG_TS": "123",
                    "SESSION_KEY": "thread",
                    "SLAM_BOT_PID": str(os.getpid()),
                    "PROMPT_FILE": "",
                    "WORKTREE_DIR": "",
                    "HEARTBEAT_DIR": str(Path(env["BOT_STATE_DIR"]) / "heartbeats"),
                }
            )
            with patch.dict(os.environ, env, clear=False):
                setup_agent()
                meta = read_json(agent_home / "meta.json", {})
                self.assertEqual(meta["workspace"], "bug-fix")
                self.assertEqual(read_json(agent_home / "route.json", {})["workspace"], "bug-fix")
                unread = agent_home / "inbox/unread/msg.md"
                unread.write_text("hello", encoding="utf-8")
                append_jsonl(Path(env["BOT_STATE_DIR"]) / "activity-journal.jsonl", {"ts": "2026-05-07T00:00:00Z", "workspace": "bug-fix", "channel": "C", "requester": "U", "request": "do it", "branch": "feature/x", "commits": "", "commit_count": 0, "duration": 1})
                self.assertIn("bug-fix", render_recent(Path(env["BOT_STATE_DIR"]) / "activity-journal.jsonl"))
                cleanup()
                self.assertTrue((Path(env["ACTIVE_DIR"]) / "_archived").exists())
                self.assertIn("Unread message", Path(env["LOGFILE"]).read_text(encoding="utf-8"))

    def test_shared_queue_creation_preserves_fields(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            with patch.dict(os.environ, {"COMMAND_SLUG": "cmd", "PROVIDER": "codex", "FALLBACK_PROVIDER": "claude", "WORKSPACE_NAME": "bug-fix", "ISSUE_NUMBER": "9"}, clear=False):
                path = create_queue_entry(tmp)
                data = read_json(path, {})
                self.assertEqual(data["provider"], "codex")
                self.assertEqual(data["fallback_provider"], "claude")
                self.assertEqual(data["workspace"], "bug-fix")
                self.assertEqual(data["issue_number"], "9")

    def test_run_argument_parsing_lock_and_provenance(self):
        args = run.parse_args(["--workspace", "bug/fix", "--session", "thread", "--provider", "codex", "prompt", "file", "123.456"])
        self.assertEqual(args.command_slug, "ws-bug_fix")
        self.assertEqual(args.prompt, "prompt")
        self.assertEqual(args.provider, "codex")
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            with patch.dict(os.environ, env | {"ISSUE_NUMBER": "7", "PROVENANCE_CHANNEL": "C1", "PROVENANCE_REQUESTER": "U1", "PROVENANCE_MESSAGE": "please fix"}, clear=False):
                config = BotConfig.from_env()
                lock_log = run.lock_and_log(config, run.parse_args(["cmd", "prompt"]))
                self.assertIsNotNone(lock_log)
                assert lock_log is not None
                lock, log = lock_log
                self.assertEqual(lock.name, "lock-cmd-issue-7.lock")
                self.assertEqual(log.name, "cmd-issue-7.log")
                self.assertIsNone(run.lock_and_log(config, run.parse_args(["cmd", "prompt"])))
                lock.unlink()
                self.assertIn("Requester: U1", run.provenance_block())

    def test_public_shell_shims_exec_python_modules_with_environment(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            fake_bin = tmp / "bin"
            fake_bin.mkdir()
            capture = tmp / "python.calls"
            write_executable(
                fake_bin / "python3",
                f"""#!/bin/bash
echo "$PYTHONPATH" >> "{capture}"
echo "$BOT_SCRIPTS_DIR" >> "{capture}"
printf '%s\\n' "$@" >> "{capture}"
""",
            )
            env = os.environ.copy()
            env.update({"BOT_HOME": str(tmp / "home"), "PATH": f"{fake_bin}:{env.get('PATH', '')}"})
            scripts = Path(__file__).parents[1]
            self.assertEqual(subprocess.run([str(scripts / "run-claude.sh"), "cmd", "prompt"], env=env, check=False).returncode, 0)
            self.assertEqual(subprocess.run([str(scripts / "check-github.sh")], env=env, check=False).returncode, 0)
            text = capture.read_text(encoding="utf-8")
            self.assertIn(str(scripts / "lib"), text)
            self.assertIn(str(scripts), text)
            self.assertIn("-m\nbot_harness\nrun\ncmd\nprompt", text)
            self.assertIn("-m\nbot_harness\ngithub-check", text)

    def test_slam_harness_has_no_lovely_identity_or_workspace_leaks(self):
        root = Path(__file__).parents[4]
        checked_paths = [
            root / "scripts/ec2-bot/scripts/lib/bot_harness",
            root / "scripts/ec2-bot/scripts/lib/invoke_provider.py",
            root / "scripts/ec2-bot/scripts/run-claude.sh",
            root / "scripts/ec2-bot/scripts/process-queue.sh",
            root / "scripts/ec2-bot/scripts/workspace-dispatcher.sh",
            root / "scripts/ec2-bot/scripts/check-github.sh",
            root / "scripts/ec2-bot/scripts/thread-tracker.sh",
            root / "scripts/ec2-bot/socket-mode/socket-listener.mjs",
            root / "bot-workspaces/label-registry.json",
            root / "bot-workspaces/workspace-builder/shared/conventions.md",
        ]
        leaks: list[str] = []
        for path in checked_paths:
            files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
            for file_path in files:
                if "__pycache__" in file_path.parts or file_path.suffix == ".pyc":
                    continue
                text = file_path.read_text(encoding="utf-8", errors="replace")
                for pattern in LEAK_PATTERNS:
                    if pattern in text:
                        leaks.append(f"{file_path.relative_to(root)} contains {pattern}")
        self.assertEqual(leaks, [])

    def test_run_queues_on_resource_failure_and_propagates_provider_exit(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            with patch.dict(os.environ, env | {"CHANNEL": "C-low"}, clear=False):
                with (
                    patch("bot_harness.run.run_resource_check", return_value=(False, "busy")),
                    patch("bot_harness.run.slack_reaction") as reactions,
                    patch("bot_harness.run.gh_budget"),
                ):
                    self.assertEqual(run.main(["cmd", "prompt", "", "123.456"]), 0)
                queued = list(Path(env["BOT_QUEUE_DIR"]).glob("queue-*.json"))
                self.assertEqual(len(queued), 1)
                self.assertEqual(read_json(queued[0], {})["command_slug"], "cmd")
                self.assertEqual(reactions.call_count, 2)

            with patch.dict(os.environ, env | {"CHANNEL": "D123"}, clear=False):
                with (
                    patch("bot_harness.run.run_resource_check", return_value=(False, "busy")),
                    patch("bot_harness.run.agent_runtime.setup_agent"),
                    patch("bot_harness.run.agent_runtime.setup_worktree", return_value=0),
                    patch("bot_harness.run.agent_runtime.cleanup"),
                    patch("bot_harness.run.providers.main", return_value=7),
                    patch("bot_harness.run.publish"),
                    patch("bot_harness.run.gh_budget"),
                ):
                    self.assertEqual(run.main(["cmd2", "prompt"]), 7)

    def test_github_check_review_request_uses_state_context_and_claims(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            write_json(
                Path(env["BOT_STATE_DIR"]) / "github-state.json",
                {
                    "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "prs": {"42": {"number": 42, "title": "Review me", "head_sha": "abc", "last_bot_review_sha": ""}},
                    "issues": {},
                },
            )
            notification = {
                "id": "n1",
                "reason": "review_requested",
                "updated_at": "2026-05-07T00:00:00Z",
                "repository": {"full_name": "shantamg/meet-without-fear"},
                "subject": {"type": "PullRequest", "title": "Review me", "url": "https://api.github.com/repos/shantamg/meet-without-fear/pulls/42", "latest_comment_url": "repos/shantamg/meet-without-fear/issues/comments/99"},
            }
            calls = []
            with patch.dict(os.environ, env | {"BOT_HARNESS_SYNC": "1"}, clear=False):
                config = BotConfig.from_env()
                with (
                    patch("bot_harness.github_check.add_reaction", return_value="r1"),
                    patch("bot_harness.github_check.remove_reaction"),
                    patch("bot_harness.github_check.mark_read"),
                    patch("bot_harness.github_check.run_agent", side_effect=lambda _c, slug, prompt, extra_env=None: calls.append((slug, prompt, extra_env)) or 0),
                ):
                    github_check.process_notification(config, Path(env["BOT_LOG_DIR"]) / "check-github.log", notification)
            self.assertEqual(calls[0][0], "review-pr-42")
            self.assertIn("/review-pr 42 shantamg/meet-without-fear", calls[0][1])
            context = Path(calls[0][2]["SESSION_CONTEXT"])
            self.assertEqual(context.parent, Path("/tmp/slam-bot"))
            self.assertEqual(read_json(context, {})["source"], "github-state-scanner")
            self.assertTrue(list(Path(env["BOT_STATE_DIR"], "claims").glob("claimed-gh-n1-*.txt")))

    def test_github_check_comment_dispatches_mentions_and_dedupes_claim(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            env = self.env(tmp)
            notification = {
                "id": "n2",
                "reason": "comment",
                "updated_at": "2026-05-07T00:00:00Z",
                "repository": {"full_name": "shantamg/meet-without-fear"},
                "subject": {"type": "Issue", "title": "Help", "url": "https://api.github.com/repos/shantamg/meet-without-fear/issues/9", "latest_comment_url": "repos/shantamg/meet-without-fear/issues/comments/10"},
            }
            gh_payloads = {
                "repos/shantamg/meet-without-fear/issues/comments/10": {"id": 10, "body": "@slam-paws please help", "user": {"login": "human"}, "created_at": "2026-05-07T00:00:00Z"},
                "repos/shantamg/meet-without-fear/issues/9/comments?per_page=10&direction=desc": [],
            }

            def fake_gh(args, jq=None):
                key = args[1] if args[:1] == ["api"] and len(args) > 1 else ""
                return 0, json.dumps(gh_payloads.get(key, []))

            calls = []
            with patch.dict(os.environ, env, clear=False):
                config = BotConfig.from_env()
                with (
                    patch("bot_harness.github_check.gh", side_effect=fake_gh),
                    patch("bot_harness.github_check.add_reaction", return_value="r2"),
                    patch("bot_harness.github_check.remove_reaction"),
                    patch("bot_harness.github_check.run_agent", side_effect=lambda *_args, **_kwargs: calls.append(_args) or 0),
                ):
                    github_check.process_notification(config, Path(env["BOT_LOG_DIR"]) / "check-github.log", notification)
                    github_check.process_notification(config, Path(env["BOT_LOG_DIR"]) / "check-github.log", notification)
            self.assertEqual(len(calls), 1)
            self.assertIn("@slam-paws please help", calls[0][2])
            self.assertEqual(len(list(Path(env["BOT_STATE_DIR"], "claims").glob("claimed-gh-n2-*.txt"))), 1)


if __name__ == "__main__":
    unittest.main()
