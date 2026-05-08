#!/usr/bin/env python3
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from invoke_provider import (
    ClaudeProvider,
    CodexProvider,
    RunnerContext,
    build_codex_agents_context,
    claude_final_agent_text,
    codex_final_agent_text,
    final_slack_reply_text,
    post_codex_slack_reply,
    resolve_fallback_provider,
    resolve_provider,
    slack_channel_from_session_key,
    slack_reply_channel,
    slack_reply_sent_text,
    write_json,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures"


def fixture_events(name):
    return [
        json.loads(line)
        for line in (FIXTURE_DIR / name).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


class ProviderParsingTests(unittest.TestCase):
    def context(self, tmp: Path) -> RunnerContext:
        agent_home = tmp / "agent"
        agent_home.mkdir()
        write_json(agent_home / "meta.json", {})
        return RunnerContext(
            lib_dir=Path(__file__).parents[1] / "lib",
            agent_home=agent_home,
            log_file=tmp / "bot.log",
            meta_file=agent_home / "meta.json",
            raw_stream=agent_home / "raw-stream.jsonl",
            stream_log=agent_home / "stream.log",
            project_dir=Path(__file__).parents[4],
            repo_root=Path(__file__).parents[5],
            workspaces_dir=Path(__file__).parents[4] / "bot-workspaces",
            registry_file=Path(__file__).parents[4] / "bot-workspaces" / "label-registry.json",
            bot_state_dir=tmp / "state",
            workspace_name="",
            trigger_label="",
            entry_stage="",
            session_key="",
            prompt="",
            prompt_file="",
            provenance_block="",
            provider_env="",
            explicit_provider=False,
            fallback_provider_env="",
            model="",
            effort="high",
        )

    def test_claude_text_and_usage(self):
        with tempfile.TemporaryDirectory() as td:
            provider = ClaudeProvider(self.context(Path(td)))
            events = fixture_events("claude-stream.jsonl")
            text = "\n".join(filter(None, (provider.text_from_event(e) for e in events)))
            usage = next(filter(None, (provider.usage_from_event(e) for e in events)))
            self.assertEqual(text, "Claude hello")
            self.assertEqual(usage, {"input_tokens": 12, "output_tokens": 3})

    def test_claude_command_uses_bot_hook_settings(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            provider = ClaudeProvider(ctx)
            provider.prepare_session()
            cmd = provider.command()
            self.assertIn("--settings", cmd)
            self.assertIn("--input-format", cmd)
            self.assertEqual(cmd[cmd.index("--input-format") + 1], "stream-json")
            settings_path = Path(cmd[cmd.index("--settings") + 1])
            self.assertEqual(settings_path, ctx.agent_home / "claude-settings.json")
            settings = json.loads(settings_path.read_text(encoding="utf-8"))
            hook = settings["hooks"]["PostToolUse"][0]["hooks"][0]
            self.assertEqual(hook["type"], "command")
            self.assertTrue(hook["command"].endswith("check-pending-messages.sh"))

    def test_claude_stream_user_message_shape(self):
        with tempfile.TemporaryDirectory() as td:
            provider = ClaudeProvider(self.context(Path(td)))
            payload = json.loads(provider.stream_user_message("hello"))
            self.assertEqual(payload["type"], "user")
            self.assertEqual(payload["message"]["role"], "user")
            self.assertEqual(payload["message"]["content"][0]["text"], "hello")

    def test_codex_text_usage_and_session_map(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            ctx.session_key = "thread-key"
            provider = CodexProvider(ctx)
            events = fixture_events("codex-stream.jsonl")
            text = "\n".join(filter(None, (provider.text_from_event(e) for e in events)))
            usage = next(filter(None, (provider.usage_from_event(e) for e in events)))
            self.assertEqual(text, "Codex hello")
            self.assertEqual(usage, {"input_tokens": 10, "output_tokens": 4})

            raw = ctx.agent_home / "raw-stream.jsonl"
            raw.write_text("\n".join(json.dumps(e) for e in events) + "\n", encoding="utf-8")
            provider.finalize_session(raw)
            session_map = json.loads((ctx.bot_state_dir / "codex-session-map.json").read_text(encoding="utf-8"))
            self.assertEqual(session_map["thread-key"]["thread_id"], "thread_abc123")

    def test_missing_binary_is_provider_failure(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            provider = CodexProvider(ctx)
            with patch.dict("os.environ", {"PATH": str(Path(td) / "empty-bin")}):
                ok, reason = provider.run(ctx.agent_home / "input.txt", ctx.raw_stream, ctx.stream_log, ctx.agent_home / "stderr.txt")
            self.assertFalse(ok)
            self.assertIn("missing_binary", reason)

    def test_tool_output_text_is_not_provider_failure(self):
        with tempfile.TemporaryDirectory() as td:
            provider = ClaudeProvider(self.context(Path(td)))
            raw = Path(td) / "raw-stream.jsonl"
            raw.write_text(
                json.dumps(
                    {
                        "type": "user",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_result",
                                    "content": "model not supported appears in inspected source code",
                                    "is_error": False,
                                }
                            ]
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            with patch("bot_harness.providers.shutil.which", return_value="/usr/bin/claude"):
                self.assertIsNone(provider.failure_reason("", raw))

    def test_explicit_provider_error_event_is_failure(self):
        with tempfile.TemporaryDirectory() as td:
            provider = ClaudeProvider(self.context(Path(td)))
            raw = Path(td) / "raw-stream.jsonl"
            raw.write_text(json.dumps({"type": "error", "message": "authentication expired"}) + "\n", encoding="utf-8")
            with patch("bot_harness.providers.shutil.which", return_value="/usr/bin/claude"):
                self.assertEqual(provider.failure_reason("", raw), "authentication expired")

    def test_stderr_text_is_provider_failure(self):
        with tempfile.TemporaryDirectory() as td:
            provider = ClaudeProvider(self.context(Path(td)))
            raw = Path(td) / "raw-stream.jsonl"
            raw.write_text("", encoding="utf-8")
            with patch("bot_harness.providers.shutil.which", return_value="/usr/bin/claude"):
                self.assertIn("APIError", provider.failure_reason("APIError: 401 unauthorized", raw) or "")

    def test_provider_resolution_order(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            ctx.registry_file = Path(td) / "label-registry.json"
            ctx.workspace_name = "bug-fix"
            write_json(
                ctx.registry_file,
                {
                    "labels": {
                        "bot:bug-fix": {
                            "workspace": "bug-fix/",
                            "provider": "codex",
                            "fallback_provider": "claude",
                        }
                    }
                },
            )
            self.assertEqual(resolve_provider(ctx), "codex")
            self.assertEqual(resolve_fallback_provider(ctx), "claude")

            ctx.provider_env = "claude"
            self.assertEqual(resolve_provider(ctx), "claude")

            ctx.explicit_provider = True
            ctx.provider_env = "codex"
            self.assertEqual(resolve_provider(ctx), "codex")

    def test_provider_resolution_defaults_to_claude(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            ctx.registry_file = Path(td) / "missing.json"
            self.assertEqual(resolve_provider(ctx), "claude")

    def test_codex_agents_context_includes_entry_stage(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            ctx.workspace_name = "bug-fix"
            ctx.entry_stage = "01-select"
            output = ctx.agent_home / "AGENTS.md"
            build_codex_agents_context(ctx, output)
            text = output.read_text(encoding="utf-8")
            self.assertIn("bot-workspaces/bug-fix/stages/01-select/CONTEXT.md", text)

    def test_codex_agents_context_instructs_slack_post(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            output = ctx.agent_home / "AGENTS.md"
            build_codex_agents_context(ctx, output)
            text = output.read_text(encoding="utf-8")
            self.assertIn("the harness posts your final response text to Slack", text)
            self.assertIn("write only the reply text you want posted", text)

    def test_slack_channel_from_session_key(self):
        self.assertEqual(slack_channel_from_session_key("slack-D0AL58PMXNX-1778192943.644489"), "D0AL58PMXNX")
        self.assertEqual(slack_channel_from_session_key("github-123"), "")

    def test_slack_reply_channel_falls_back_to_env_channel(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            with patch.dict(os.environ, {"CHANNEL": "D0AL58PMXNX"}):
                self.assertEqual(slack_reply_channel(ctx), "D0AL58PMXNX")

    def test_codex_final_agent_text_uses_last_agent_message(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw-stream.jsonl"
            raw.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "type": "item.completed",
                                "item": {
                                    "type": "agent_message",
                                    "text": "I am checking the Slack destination.",
                                },
                            }
                        ),
                        json.dumps(
                            {
                                "type": "item.completed",
                                "item": {
                                    "type": "agent_message",
                                    "text": "Handled by Codex via CLI",
                                },
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(codex_final_agent_text(raw), "Handled by Codex via CLI")

    def test_claude_final_agent_text_uses_last_assistant_message(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw-stream.jsonl"
            raw.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "type": "assistant",
                                "message": {
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "I need to look up the DM channel.",
                                        }
                                    ]
                                },
                            }
                        ),
                        json.dumps(
                            {
                                "type": "assistant",
                                "message": {
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "Handled by default provider via CLI",
                                        }
                                    ]
                                },
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(claude_final_agent_text(raw), "Handled by default provider via CLI")

    def test_slack_reply_sent_text_extracts_wrapper(self):
        self.assertEqual(slack_reply_sent_text('Reply sent: "Handled by default provider via CLI"'), "Handled by default provider via CLI")

    def test_slack_reply_sent_text_leaves_regular_text_alone(self):
        self.assertEqual(slack_reply_sent_text("Handled by default provider via CLI"), "")

    def test_post_claude_slack_reply_skips_already_sent_wrapper(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            ctx = self.context(tmp)
            ctx.session_key = "slack-D0AL58PMXNX-1778198158.106159"
            raw = Path(td) / "raw-stream.jsonl"
            raw.write_text(
                json.dumps(
                    {
                        "type": "assistant",
                        "message": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": 'Reply sent: "Handled by default provider via CLI"',
                                }
                            ]
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            ctx.raw_stream = raw

            scripts_dir = tmp / "scripts"
            scripts_dir.mkdir()
            capture = tmp / "posted.txt"
            slack_post = scripts_dir / "slack-post.sh"
            slack_post.write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' \"$@\" > \"$CAPTURE\"\n"
                "printf '1778198200.000100\\n'\n",
                encoding="utf-8",
            )
            slack_post.chmod(0o755)

            with patch.dict(os.environ, {"BOT_SCRIPTS_DIR": str(scripts_dir), "CAPTURE": str(capture)}):
                ok, reason = post_codex_slack_reply(ctx, "claude")

            self.assertTrue(ok, reason)
            self.assertFalse(capture.exists())
            self.assertIn("already posted Slack reply", ctx.log_file.read_text(encoding="utf-8"))

    def test_post_codex_slack_reply_posts_final_raw_agent_text(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            ctx = self.context(tmp)
            ctx.session_key = "slack-D0AL58PMXNX-1778192943.644489"
            ctx.stream_log.write_text("I am checking the Slack destination.\nHandled by Codex via CLI\n", encoding="utf-8")
            ctx.raw_stream.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "type": "item.completed",
                                "item": {
                                    "type": "agent_message",
                                    "text": "I am checking the Slack destination.",
                                },
                            }
                        ),
                        json.dumps(
                            {
                                "type": "item.completed",
                                "item": {
                                    "type": "agent_message",
                                    "text": "Handled by Codex via CLI",
                                },
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            scripts_dir = tmp / "scripts"
            scripts_dir.mkdir()
            capture = tmp / "posted.txt"
            slack_post = scripts_dir / "slack-post.sh"
            slack_post.write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' \"$@\" > \"$CAPTURE\"\n"
                "printf '1778193000.000100\\n'\n",
                encoding="utf-8",
            )
            slack_post.chmod(0o755)

            with patch.dict(os.environ, {"BOT_SCRIPTS_DIR": str(scripts_dir), "CAPTURE": str(capture)}):
                ok, reason = post_codex_slack_reply(ctx, "codex")

            self.assertTrue(ok, reason)
            self.assertEqual(
                capture.read_text(encoding="utf-8").splitlines(),
                ["--channel", "D0AL58PMXNX", "--text", "Handled by Codex via CLI"],
            )
            meta = json.loads(ctx.meta_file.read_text(encoding="utf-8"))
            self.assertEqual(meta["codexSlackReplyTs"], "1778193000.000100")
            self.assertEqual(meta["providerSlackReplyTs"], "1778193000.000100")

    def test_post_claude_slack_reply_posts_dm_final_text(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            ctx = self.context(tmp)
            ctx.session_key = "slack-D0AL58PMXNX-1778196374.468569"
            ctx.raw_stream.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "type": "assistant",
                                "message": {
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "I need to look up the DM channel.",
                                        }
                                    ]
                                },
                            }
                        ),
                        json.dumps(
                            {
                                "type": "assistant",
                                "message": {
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "Handled by default provider via CLI",
                                        }
                                    ]
                                },
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            scripts_dir = tmp / "scripts"
            scripts_dir.mkdir()
            capture = tmp / "posted.txt"
            slack_post = scripts_dir / "slack-post.sh"
            slack_post.write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' \"$@\" > \"$CAPTURE\"\n"
                "printf '1778196400.000100\\n'\n",
                encoding="utf-8",
            )
            slack_post.chmod(0o755)

            with patch.dict(os.environ, {"BOT_SCRIPTS_DIR": str(scripts_dir), "CAPTURE": str(capture)}):
                ok, reason = post_codex_slack_reply(ctx, "claude")

            self.assertTrue(ok, reason)
            self.assertEqual(
                capture.read_text(encoding="utf-8").splitlines(),
                ["--channel", "D0AL58PMXNX", "--text", "Handled by default provider via CLI"],
            )
            meta = json.loads(ctx.meta_file.read_text(encoding="utf-8"))
            self.assertEqual(meta["claudeSlackReplyTs"], "1778196400.000100")
            self.assertEqual(meta["providerSlackReplyTs"], "1778196400.000100")

    def test_post_claude_slack_reply_skips_non_dm_channels(self):
        with tempfile.TemporaryDirectory() as td:
            ctx = self.context(Path(td))
            ctx.session_key = "slack--1778196374.468569"
            ctx.raw_stream.write_text("", encoding="utf-8")

            self.assertEqual(final_slack_reply_text(ctx, "claude"), "")
            ok, reason = post_codex_slack_reply(ctx, "claude")

            self.assertTrue(ok, reason)

    def test_post_claude_dm_reply_uses_env_channel_for_legacy_dm_runner(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            ctx = self.context(tmp)
            ctx.session_key = ""
            ctx.raw_stream.write_text(
                json.dumps(
                    {
                        "type": "assistant",
                        "message": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Handled by default provider via CLI",
                                }
                            ]
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            scripts_dir = tmp / "scripts"
            scripts_dir.mkdir()
            capture = tmp / "posted.txt"
            slack_post = scripts_dir / "slack-post.sh"
            slack_post.write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' \"$@\" > \"$CAPTURE\"\n"
                "printf '1778197200.000100\\n'\n",
                encoding="utf-8",
            )
            slack_post.chmod(0o755)

            with patch.dict(
                os.environ,
                {
                    "BOT_SCRIPTS_DIR": str(scripts_dir),
                    "CAPTURE": str(capture),
                    "CHANNEL": "D0AL58PMXNX",
                },
            ):
                ok, reason = post_codex_slack_reply(ctx, "claude")

            self.assertTrue(ok, reason)
            self.assertEqual(
                capture.read_text(encoding="utf-8").splitlines(),
                ["--channel", "D0AL58PMXNX", "--text", "Handled by default provider via CLI"],
            )


if __name__ == "__main__":
    unittest.main()
