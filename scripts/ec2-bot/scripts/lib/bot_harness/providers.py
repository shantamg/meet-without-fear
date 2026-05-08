#!/usr/bin/env python3
"""Provider adapter layer for the Slam Paws EC2 bot harness."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .activity_journal import render_recent
from .json_store import iter_jsonl, read_json, write_json
from .logging import append


VALID_PROVIDERS = {"claude", "codex"}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class RunnerContext:
    lib_dir: Path
    agent_home: Path
    log_file: Path
    meta_file: Path
    raw_stream: Path
    stream_log: Path
    project_dir: Path
    repo_root: Path
    workspaces_dir: Path
    registry_file: Path
    bot_state_dir: Path
    workspace_name: str
    trigger_label: str
    entry_stage: str
    session_key: str
    prompt: str
    prompt_file: str
    provenance_block: str
    provider_env: str
    explicit_provider: bool
    fallback_provider_env: str
    model: str
    effort: str

    @classmethod
    def from_env(cls) -> "RunnerContext":
        agent_home = Path(os.environ["AGENT_HOME"])
        return cls(
            lib_dir=Path(os.environ["LIB_DIR"]),
            agent_home=agent_home,
            log_file=Path(os.environ["LOGFILE"]),
            meta_file=agent_home / "meta.json",
            raw_stream=agent_home / "raw-stream.jsonl",
            stream_log=agent_home / "stream.log",
            project_dir=Path(os.environ["PROJECT_DIR"]),
            repo_root=Path(os.environ["REPO_ROOT"]),
            workspaces_dir=Path(os.environ["WORKSPACES_DIR"]),
            registry_file=Path(os.environ["REGISTRY_FILE"]),
            bot_state_dir=Path(os.environ["BOT_STATE_DIR"]),
            workspace_name=os.environ.get("WORKSPACE_NAME", ""),
            trigger_label=os.environ.get("TRIGGER_LABEL", ""),
            entry_stage=os.environ.get("ENTRY_STAGE", ""),
            session_key=os.environ.get("SESSION_KEY", ""),
            prompt=os.environ.get("PROMPT", ""),
            prompt_file=os.environ.get("PROMPT_FILE", ""),
            provenance_block=os.environ.get("PROVENANCE_BLOCK", ""),
            provider_env=os.environ.get("PROVIDER", ""),
            explicit_provider=os.environ.get("EXPLICIT_PROVIDER", "0") == "1",
            fallback_provider_env=os.environ.get("FALLBACK_PROVIDER", ""),
            model=os.environ.get("MODEL", ""),
            effort=os.environ.get("EFFORT", ""),
        )

    def log(self, message: str) -> None:
        append(self.log_file, f"[{datetime.now().ctime()}] {message}\n")

    def update_meta(self, **fields: Any) -> None:
        meta = read_json(self.meta_file, {})
        meta.update(fields)
        write_json(self.meta_file, meta)


class InvokeProvider:
    name = ""

    def __init__(self, ctx: RunnerContext):
        self.ctx = ctx
        self.session_id = ""
        self.session_mode = "stateless"

    def prepare_session(self) -> None:
        raise NotImplementedError

    def command(self) -> list[str]:
        raise NotImplementedError

    def text_from_event(self, event: dict[str, Any]) -> str:
        raise NotImplementedError

    def usage_from_event(self, event: dict[str, Any]) -> dict[str, Any] | None:
        return None

    def finalize_session(self, raw_stream: Path) -> None:
        pass

    def event_failure_reason(self, event: dict[str, Any]) -> str | None:
        event_type = event.get("type")
        if event_type in {"error", "turn.failed"}:
            message = event.get("message") or event.get("error") or event
            if isinstance(message, dict):
                message = message.get("message") or message.get("error") or message.get("type") or message
            return str(message)[:500]
        return None

    def raw_stream_failure_reason(self, raw_stream: Path) -> str | None:
        if not raw_stream.exists():
            return None
        for event in iter_jsonl(raw_stream):
            reason = self.event_failure_reason(event)
            if reason:
                return reason
        return None

    def stderr_failure_reason(self, stderr: str) -> str | None:
        patterns = [
            r"login|sign in|authenticate|expired|unauthorized|APIError.*401|401",
            r"rate limit|too many requests|quota|overloaded|timeout|timed out",
            r"model.*not found|invalid model|not supported",
            r"^Error:",
        ]
        for pattern in patterns:
            match = re.search(pattern, stderr, re.IGNORECASE | re.MULTILINE)
            if match:
                line = next((ln for ln in stderr.splitlines() if re.search(pattern, ln, re.IGNORECASE)), match.group(0))
                return line[:500]
        return None

    def failure_reason(self, stderr: str, raw_stream: Path) -> str | None:
        if shutil.which(self.command()[0]) is None:
            return f"missing_binary: {self.command()[0]}"
        return self.stderr_failure_reason(stderr) or self.raw_stream_failure_reason(raw_stream)

    def run(self, input_file: Path, raw_stream: Path, stream_log: Path, stderr_file: Path) -> tuple[bool, str]:
        self.prepare_session()
        cmd = self.command()
        if shutil.which(cmd[0]) is None:
            return False, f"missing_binary: {cmd[0]}"
        self.ctx.log(f"Provider={self.name} session_mode={self.session_mode}{(' session_id=' + self.session_id) if self.session_id else ''}")
        raw_stream.write_text("", encoding="utf-8")
        stream_log.write_text("", encoding="utf-8")
        stderr_file.write_text("", encoding="utf-8")

        with input_file.open("rb") as stdin, raw_stream.open("ab") as raw_out, stream_log.open("a", encoding="utf-8") as stream_out, stderr_file.open("wb") as stderr_out:
            proc = subprocess.Popen(cmd, stdin=stdin, stdout=subprocess.PIPE, stderr=stderr_out)
            if proc.stdout is None:
                return False, "provider produced no stdout pipe"
            for raw_line in proc.stdout:
                raw_out.write(raw_line)
                raw_out.flush()
                try:
                    event = json.loads(raw_line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                text = self.text_from_event(event)
                if text:
                    stream_out.write(text + "\n")
                    stream_out.flush()
                    append(self.ctx.log_file, text + "\n")
            exit_code = proc.wait()

        stderr = stderr_file.read_text(encoding="utf-8", errors="replace")
        if stderr:
            append(self.ctx.log_file, stderr)

        reason = self.failure_reason(stderr, raw_stream)
        if exit_code != 0:
            detail = reason or stderr or f"exit_code={exit_code}"
            return False, f"exit_code={exit_code}\n{detail}".strip()
        if reason:
            return False, reason

        self.finalize_session(raw_stream)
        for event in iter_jsonl(raw_stream):
            usage = self.usage_from_event(event)
            if usage:
                self.ctx.update_meta(providerUsage=usage)
                break
        return True, ""


class ClaudeProvider(InvokeProvider):
    name = "claude"

    @property
    def settings_file(self) -> Path:
        return self.ctx.agent_home / "claude-settings.json"

    def prepare_session(self) -> None:
        self.session_id = ""
        self.session_mode = "stateless"
        if self.ctx.session_key:
            self.session_id = str(uuid.uuid5(uuid.NAMESPACE_URL, self.ctx.session_key))
            exists = any(Path.home().glob(f".claude/projects/**/{self.session_id}.jsonl"))
            self.session_mode = "resume" if exists else "new"
        hook = self.ctx.lib_dir.parent / "check-pending-messages.sh"
        write_json(
            self.settings_file,
            {
                "hooks": {
                    "PostToolUse": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": str(hook),
                                }
                            ]
                        }
                    ]
                }
            },
        )

    def command(self) -> list[str]:
        cmd = ["claude"]
        if self.ctx.model:
            cmd += ["--model", self.ctx.model]
        if self.ctx.effort:
            cmd += ["--effort", self.ctx.effort]
        if self.session_id:
            cmd += ["--resume" if self.session_mode == "resume" else "--session-id", self.session_id]
        cmd += ["--settings", str(self.settings_file)]
        cmd += ["--dangerously-skip-permissions", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"]
        return cmd

    def stream_user_message(self, text: str) -> str:
        return json.dumps({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": text}]}}) + "\n"

    def pending_context_after_tool(self, event: dict[str, Any]) -> str:
        tool_result = event.get("message", {}).get("content", []) if event.get("type") == "user" else []
        if not any(isinstance(part, dict) and part.get("type") == "tool_result" for part in tool_result):
            return ""
        hook = self.ctx.lib_dir.parent / "check-pending-messages.sh"
        if not hook.exists():
            return ""
        env = os.environ.copy()
        env["SLAM_BOT_AGENT_HOME"] = str(self.ctx.agent_home)
        proc = subprocess.run(
            [str(hook)],
            input=json.dumps(event),
            text=True,
            capture_output=True,
            check=False,
            env=env,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return ""
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError:
            return ""
        return str(payload.get("hookSpecificOutput", {}).get("additionalContext", ""))

    def run(self, input_file: Path, raw_stream: Path, stream_log: Path, stderr_file: Path) -> tuple[bool, str]:
        self.prepare_session()
        cmd = self.command()
        if shutil.which(cmd[0]) is None:
            return False, f"missing_binary: {cmd[0]}"
        self.ctx.log(f"Provider={self.name} session_mode={self.session_mode}{(' session_id=' + self.session_id) if self.session_id else ''}")
        raw_stream.write_text("", encoding="utf-8")
        stream_log.write_text("", encoding="utf-8")
        stderr_file.write_text("", encoding="utf-8")

        stdin_lock = threading.Lock()
        stdin_open = True
        close_timer: threading.Timer | None = None

        def close_stdin(proc: subprocess.Popen[bytes]) -> None:
            nonlocal stdin_open
            with stdin_lock:
                if not stdin_open or proc.stdin is None:
                    return
                try:
                    proc.stdin.close()
                except OSError:
                    pass
                stdin_open = False

        def schedule_close(proc: subprocess.Popen[bytes]) -> None:
            nonlocal close_timer
            if close_timer is not None:
                close_timer.cancel()
            close_timer = threading.Timer(1.0, close_stdin, args=(proc,))
            close_timer.daemon = True
            close_timer.start()

        def cancel_close() -> None:
            nonlocal close_timer
            if close_timer is not None:
                close_timer.cancel()
                close_timer = None

        with raw_stream.open("ab") as raw_out, stream_log.open("a", encoding="utf-8") as stream_out, stderr_file.open("wb") as stderr_out:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr_out)
            assert proc.stdin is not None
            assert proc.stdout is not None
            initial = input_file.read_text(encoding="utf-8", errors="replace")
            proc.stdin.write(self.stream_user_message(initial).encode("utf-8"))
            proc.stdin.flush()
            for raw_line in proc.stdout:
                raw_out.write(raw_line)
                raw_out.flush()
                try:
                    event = json.loads(raw_line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue

                parts = event.get("message", {}).get("content", []) if isinstance(event.get("message"), dict) else []
                has_tool_use = any(isinstance(part, dict) and part.get("type") == "tool_use" for part in parts)
                has_text = bool(self.text_from_event(event))
                if has_tool_use:
                    cancel_close()

                context = self.pending_context_after_tool(event)
                if context:
                    with stdin_lock:
                        if stdin_open and proc.stdin is not None:
                            proc.stdin.write(self.stream_user_message(context).encode("utf-8"))
                            proc.stdin.flush()

                text = self.text_from_event(event)
                if text:
                    stream_out.write(text + "\n")
                    stream_out.flush()
                    append(self.ctx.log_file, text + "\n")
                if has_text and not has_tool_use:
                    schedule_close(proc)
            if close_timer is not None:
                close_timer.cancel()
            close_stdin(proc)
            exit_code = proc.wait()

        stderr = stderr_file.read_text(encoding="utf-8", errors="replace")
        if stderr:
            append(self.ctx.log_file, stderr)

        reason = self.failure_reason(stderr, raw_stream)
        if exit_code != 0:
            detail = reason or stderr or f"exit_code={exit_code}"
            return False, f"exit_code={exit_code}\n{detail}".strip()
        if reason:
            return False, reason

        self.finalize_session(raw_stream)
        for event in iter_jsonl(raw_stream):
            usage = self.usage_from_event(event)
            if usage:
                self.ctx.update_meta(providerUsage=usage)
                break
        return True, ""

    def text_from_event(self, event: dict[str, Any]) -> str:
        if event.get("type") != "assistant":
            return ""
        parts = event.get("message", {}).get("content", [])
        return "\n".join(part.get("text", "") for part in parts if part.get("type") == "text" and part.get("text"))

    def usage_from_event(self, event: dict[str, Any]) -> dict[str, Any] | None:
        usage = event.get("message", {}).get("usage") or event.get("usage")
        return usage if isinstance(usage, dict) else None

    def finalize_session(self, raw_stream: Path) -> None:
        for event in iter_jsonl(raw_stream):
            sid = event.get("session_id")
            if sid:
                self.ctx.update_meta(claudeSessionId=sid, providerSessionId=sid)
                return


class CodexProvider(InvokeProvider):
    name = "codex"

    @property
    def session_map_file(self) -> Path:
        return self.ctx.bot_state_dir / "codex-session-map.json"

    def prepare_session(self) -> None:
        self.session_id = ""
        self.session_mode = "stateless"
        if self.ctx.session_key:
            session_map = read_json(self.session_map_file, {})
            entry = session_map.get(self.ctx.session_key, {})
            self.session_id = entry.get("thread_id", "") if isinstance(entry, dict) else ""
            self.session_mode = "resume" if self.session_id else "new"

    def command(self) -> list[str]:
        cmd = ["codex", "exec"]
        if self.session_mode == "resume":
            cmd += ["resume", self.session_id]
        cmd += ["--yolo", "--json"]
        if self.ctx.model:
            cmd += ["--model", self.ctx.model]
        cmd += ["-"]
        return cmd

    def text_from_event(self, event: dict[str, Any]) -> str:
        item = event.get("item") if event.get("type") == "item.completed" else None
        if isinstance(item, dict) and item.get("type") == "agent_message":
            return item.get("text", "")
        return ""

    def usage_from_event(self, event: dict[str, Any]) -> dict[str, Any] | None:
        usage = event.get("usage")
        if not usage and isinstance(event.get("item"), dict):
            usage = event["item"].get("usage")
        return usage if isinstance(usage, dict) else None

    def finalize_session(self, raw_stream: Path) -> None:
        thread_id = ""
        for event in iter_jsonl(raw_stream):
            if event.get("type") == "thread.started":
                thread_id = event.get("thread_id") or event.get("thread", {}).get("id", "")
                break
        if not thread_id:
            for event in iter_jsonl(raw_stream):
                thread_id = event.get("thread_id") or event.get("thread", {}).get("id", "")
                if thread_id:
                    break
        if not thread_id:
            return
        if self.ctx.session_key:
            session_map = read_json(self.session_map_file, {})
            session_map[self.ctx.session_key] = {"thread_id": thread_id, "updated_at": utc_now()}
            write_json(self.session_map_file, session_map)
        self.ctx.update_meta(codexThreadId=thread_id, providerSessionId=thread_id)


def provider_class(name: str) -> type[InvokeProvider]:
    if name == "claude":
        return ClaudeProvider
    if name == "codex":
        return CodexProvider
    raise ValueError(f"unsupported provider: {name}")


def registry_field(ctx: RunnerContext, field: str) -> str:
    registry = read_json(ctx.registry_file, {})
    labels = registry.get("labels", {})
    if ctx.trigger_label and isinstance(labels.get(ctx.trigger_label), dict):
        value = labels[ctx.trigger_label].get(field, "")
        if value:
            return str(value)
    if ctx.workspace_name:
        for entry in labels.values():
            if not isinstance(entry, dict):
                continue
            workspace = str(entry.get("workspace", "")).rstrip("/")
            if workspace == ctx.workspace_name.rstrip("/"):
                value = entry.get(field, "")
                if value:
                    return str(value)
    return ""


def resolve_provider(ctx: RunnerContext) -> str:
    if ctx.explicit_provider and ctx.provider_env:
        return ctx.provider_env
    if ctx.provider_env:
        return ctx.provider_env
    return registry_field(ctx, "provider") or "claude"


def resolve_fallback_provider(ctx: RunnerContext) -> str:
    return ctx.fallback_provider_env or registry_field(ctx, "fallback_provider")


def build_journal_context(ctx: RunnerContext) -> str:
    return render_recent(ctx.bot_state_dir / "activity-journal.jsonl").strip()


def slack_channel_from_session_key(session_key: str) -> str:
    match = re.match(r"^slack-([A-Z0-9]+)-\d+\.\d+$", session_key)
    return match.group(1) if match else ""


def slack_reply_channel(ctx: RunnerContext) -> str:
    return slack_channel_from_session_key(ctx.session_key) or os.environ.get("CHANNEL", "")


def codex_final_agent_text(raw_stream: Path) -> str:
    final_text = ""
    for event in iter_jsonl(raw_stream):
        item = event.get("item") if event.get("type") == "item.completed" else None
        if isinstance(item, dict) and item.get("type") == "agent_message":
            text = str(item.get("text", "")).strip()
            if text:
                final_text = text
    return final_text


def slack_reply_sent_text(text: str) -> str:
    stripped = text.strip()
    match = re.fullmatch(r'Reply sent:\s+"([^"\n]+)"\.?', stripped)
    return match.group(1) if match else ""


def claude_final_agent_text(raw_stream: Path) -> str:
    final_text = ""
    for event in iter_jsonl(raw_stream):
        if event.get("type") != "assistant":
            continue
        parts = event.get("message", {}).get("content", [])
        if not isinstance(parts, list):
            continue
        text = "\n".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and part.get("type") == "text" and part.get("text")
        ).strip()
        if text:
            final_text = text
    return final_text


def claude_already_sent_slack_reply(raw_stream: Path) -> bool:
    return bool(slack_reply_sent_text(claude_final_agent_text(raw_stream)))


def final_slack_reply_text(ctx: RunnerContext, provider: str) -> str:
    if provider == "codex":
        return codex_final_agent_text(ctx.raw_stream)
    if provider == "claude":
        text = claude_final_agent_text(ctx.raw_stream)
        return "" if slack_reply_sent_text(text) else text
    return ctx.stream_log.read_text(encoding="utf-8", errors="replace").strip()


def post_codex_slack_reply(ctx: RunnerContext, provider: str) -> tuple[bool, str]:
    channel = slack_reply_channel(ctx)
    should_post = provider == "codex" or (provider == "claude" and channel.startswith("D"))
    if not should_post:
        return True, ""
    if not channel:
        return True, ""
    text = final_slack_reply_text(ctx, provider)
    if not text:
        if provider == "claude" and claude_already_sent_slack_reply(ctx.raw_stream):
            ctx.log("Claude already posted Slack reply; skipping harness post")
            return True, ""
        return False, f"{provider} produced no Slack reply text"

    script = Path(os.environ.get("BOT_SCRIPTS_DIR", "/opt/slam-bot/scripts")) / "slack-post.sh"
    result = subprocess.run(
        [str(script), "--channel", channel, "--text", text],
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or f"exit_code={result.returncode}").strip()
        return False, f"failed to post Codex Slack reply: {detail[:500]}"
    ts = result.stdout.strip()
    ctx.log(f"Posted {provider} Slack reply to {channel}{(' ts=' + ts) if ts else ''}")
    ctx.update_meta(providerSlackReplyTs=ts, **({f"{provider}SlackReplyTs": ts} if ts else {}))
    return True, ""


def build_codex_agents_context(ctx: RunnerContext, output: Path) -> None:
    candidates = [
        ctx.repo_root / "AGENTS.md",
        ctx.project_dir / "CLAUDE.md",
        ctx.workspaces_dir / "CLAUDE.md",
    ]
    if ctx.workspace_name:
        workspace_dir = ctx.workspaces_dir / ctx.workspace_name
        candidates += [workspace_dir / "CLAUDE.md", workspace_dir / "CONTEXT.md"]
        route = read_json(ctx.agent_home / "route.json", {})
        stage = ctx.entry_stage or route.get("stage", "")
        if stage:
            candidates.append(workspace_dir / "stages" / stage / "CONTEXT.md")

    chunks = [
        "# Slam Paws Runtime Context\n\n",
        "This AGENTS.md was generated for this single bot dispatch. Follow it together with the repository files included below.\n",
        "Branch/worktree checks apply before making code edits. For read-only, smoke-test, or response-only prompts, answer the prompt directly without stopping solely because the checkout is detached or no feature branch is active.\n",
        "\n## Codex Slack Replies\n\n",
        "For Slack dispatches, the harness posts your final response text to Slack after Codex exits successfully.\n",
        "If the prompt asks you to reply in Slack or mentions a Slack MCP tool, write only the reply text you want posted.\n",
        "Do not claim that you already posted the Slack reply, and do not run Slack posting commands yourself unless the prompt explicitly asks you to perform a separate manual post.\n",
        "\n## Direct Message Replies\n\n",
        "For Slack DM dispatches, the harness posts your final response text to Slack after the provider exits successfully.\n",
        "Write only the reply text you want posted. Do not claim that you already sent the DM.\n",
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                label = candidate.relative_to(ctx.project_dir)
            except ValueError:
                label = candidate
            chunks.append(f"\n## {label}\n\n")
            chunks.append(candidate.read_text(encoding="utf-8", errors="replace"))
            chunks.append("\n")
    output.write_text("".join(chunks), encoding="utf-8")


def assemble_input(ctx: RunnerContext, provider: str, input_file: Path) -> None:
    parts: list[str] = []
    if provider == "codex":
        agents_file = ctx.agent_home / "AGENTS.md"
        build_codex_agents_context(ctx, agents_file)
        parts.append("[CODEX RUNTIME CONTEXT]\n")
        parts.append(f"An ephemeral AGENTS.md for this dispatch is available at: {agents_file}\n")
        parts.append("Treat it as the dispatch-time equivalent of the Claude instruction files.\n")
        parts.append("[END CODEX RUNTIME CONTEXT]\n\n")

    journal = build_journal_context(ctx)
    if journal:
        parts.append(journal + "\n\n")
    if ctx.provenance_block:
        parts.append(ctx.provenance_block + "\n")
    if ctx.prompt_file and Path(ctx.prompt_file).exists():
        parts.append(Path(ctx.prompt_file).read_text(encoding="utf-8", errors="replace"))
    else:
        parts.append(ctx.prompt)
    input_file.write_text("".join(parts), encoding="utf-8")


def main() -> int:
    ctx = RunnerContext.from_env()
    primary = resolve_provider(ctx)
    fallback = resolve_fallback_provider(ctx)
    if primary not in VALID_PROVIDERS:
        ctx.log(f"Error: unsupported provider '{primary}'")
        return 1
    if fallback and fallback not in VALID_PROVIDERS:
        ctx.log(f"Error: unsupported fallback provider '{fallback}'")
        return 1

    input_file = ctx.agent_home / "input.txt"
    ctx.update_meta(provider=primary, fallbackProvider=fallback, model=ctx.model, effort=ctx.effort)
    assemble_input(ctx, primary, input_file)

    provider = provider_class(primary)(ctx)
    ok, reason = provider.run(input_file, ctx.raw_stream, ctx.stream_log, ctx.agent_home / "provider.stderr")
    if ok:
        ok, reason = post_codex_slack_reply(ctx, primary)
        if not ok:
            failure_file = ctx.agent_home / "provider-failure.txt"
            failure_file.write_text(reason + "\n", encoding="utf-8")
            ctx.log(f"Provider {primary} failed after completion: {reason}")
            return 1
        append(ctx.log_file, "\n")
        return 0

    failure_file = ctx.agent_home / "provider-failure.txt"
    failure_file.write_text(reason + "\n", encoding="utf-8")
    ctx.log(f"Provider {primary} failed: {reason}")

    if fallback and fallback != primary:
        failed_raw = ctx.agent_home / f"raw-stream.{primary}.failed.jsonl"
        failed_stream = ctx.agent_home / f"stream.{primary}.failed.log"
        if ctx.raw_stream.exists():
            ctx.raw_stream.replace(failed_raw)
        if ctx.stream_log.exists():
            ctx.stream_log.replace(failed_stream)
        ctx.update_meta(primaryProviderFailure=reason, provider=fallback, fallbackProvider="")
        assemble_input(ctx, fallback, input_file)
        fallback_provider = provider_class(fallback)(ctx)
        ok, fallback_reason = fallback_provider.run(input_file, ctx.raw_stream, ctx.stream_log, ctx.agent_home / "provider-fallback.stderr")
        if ok:
            ok, post_reason = post_codex_slack_reply(ctx, fallback)
            if not ok:
                failure_file.write_text(post_reason + "\n", encoding="utf-8")
                ctx.update_meta(fallbackProviderFailure=post_reason)
                ctx.log(f"Error: fallback provider {fallback} failed after completion: {post_reason}")
                return 1
            ctx.log(f"Fallback provider {fallback} succeeded after {primary} failure")
            append(ctx.log_file, "\n")
            return 0
        failure_file.write_text(fallback_reason + "\n", encoding="utf-8")
        ctx.update_meta(primaryProviderFailure=reason, fallbackProviderFailure=fallback_reason)
        ctx.log(f"Error: provider {primary} failed ({reason}); fallback {fallback} failed ({fallback_reason})")
        return 1

    return 1


if __name__ == "__main__":
    sys.exit(main())
