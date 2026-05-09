"""Workspace dispatcher for label-triggered and scheduled bot work."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .config import BotConfig
from .github_state import GitHubState
from .json_store import append_jsonl, read_json, write_json
from .locks import claim
from .logging import log
from .processes import count_running_agents, count_running_workspace_agents, pid_alive
from .registry import LabelRegistry


def run_json(cmd: list[str]) -> object | None:
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def gh(config: BotConfig, args: list[str], *, mutate: bool = False) -> object | None:
    if mutate and os.environ.get("BOT_HARNESS_NO_GH_MUTATION") == "1":
        return None
    return run_json(["gh", *args])


def clear_gh_cache() -> None:
    shutil.rmtree(Path.home() / ".cache" / "gh", ignore_errors=True)


def gh_cost_trace_start() -> dict:
    raw = run_json(["gh", "api", "rate_limit"])
    resources = raw.get("resources", {}) if isinstance(raw, dict) else {}
    graphql = resources.get("graphql", {}) if isinstance(resources, dict) else {}
    core = resources.get("core", {}) if isinstance(resources, dict) else {}
    return {
        "graphql": int(graphql.get("used") or 0),
        "rest": int(core.get("used") or 0),
        "reset": int(graphql.get("reset") or 0),
        "started": int(datetime.now(timezone.utc).timestamp()),
    }


def gh_cost_trace_end(config: BotConfig, start: dict) -> None:
    if not start:
        return
    raw = run_json(["gh", "api", "rate_limit"])
    resources = raw.get("resources", {}) if isinstance(raw, dict) else {}
    graphql = resources.get("graphql", {}) if isinstance(resources, dict) else {}
    core = resources.get("core", {}) if isinstance(resources, dict) else {}
    if int(graphql.get("reset") or 0) != int(start.get("reset") or 0):
        return
    now = datetime.now(timezone.utc)
    append_jsonl(
        config.bot_state_dir / "api-budget" / f"script-costs-{now.strftime('%Y-%m-%d')}.jsonl",
        {
            "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "caller": "workspace-dispatcher.sh",
            "graphql_cost": int(graphql.get("used") or 0) - int(start.get("graphql") or 0),
            "rest_cost": int(core.get("used") or 0) - int(start.get("rest") or 0),
            "duration_sec": int(now.timestamp()) - int(start.get("started") or int(now.timestamp())),
            "pid": str(os.getpid()),
        },
    )


def state_file(config: BotConfig) -> GitHubState:
    return GitHubState(Path(os.environ.get("GITHUB_STATE_FILE", str(config.bot_state_dir / "github-state.json"))))


def github_state_usable(config: BotConfig) -> bool:
    state = state_file(config)
    return state.path.exists() and state.is_fresh()


def issue_active(config: BotConfig, issue_number: int, label: str, updated_at: str, registry: LabelRegistry) -> bool:
    for agent_dir in config.active_dir.glob("agent-*"):
        suffix = agent_dir.name.removeprefix("agent-")
        if suffix.isdigit() and not pid_alive(int(suffix)):
            continue
        meta = read_json(agent_dir / "meta.json", {}) or {}
        if str(meta.get("issueNumber", "")) == str(issue_number):
            return True
    claim_file = config.claims_dir / f"claimed-ws-dispatch-{issue_number}.txt"
    if claim_file.exists():
        try:
            pid = int(claim_file.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            pid = 0
        if pid and pid_alive(pid):
            return True
        claim_file.unlink(missing_ok=True)
    cooldown_file = config.claims_dir / f"cooldown-{issue_number}.txt"
    if cooldown_file.exists():
        cooldown = registry.int_for_label(label, "cooldown_secs")
        if cooldown is None:
            try:
                cooldown = int(os.environ.get("KEEP_LABEL_COOLDOWN_SECS", "1800"))
            except ValueError:
                cooldown = 1800
        if cooldown > 0:
            lines = cooldown_file.read_text(encoding="utf-8", errors="replace").splitlines()
            stored_updated_at = lines[1] if len(lines) > 1 else ""
            if stored_updated_at and stored_updated_at == updated_at:
                return True
        cooldown_file.unlink(missing_ok=True)
    if (config.claims_dir / f"waiting-human-{issue_number}.txt").exists():
        return True
    return False


def prs_fixing_count(config: BotConfig, issue_number: int) -> int:
    if github_state_usable(config):
        return state_file(config).prs_fixing_issue_count(issue_number)
    result = gh(config, ["pr", "list", "--repo", config.github_repo, "--search", f"Fixes #{issue_number}", "--state", "all", "--json", "number"])
    return len(result) if isinstance(result, list) else 0


def duplicate_check(config: BotConfig, issue_number: int, logfile: Path) -> int:
    script = config.bot_scripts_dir / "check-duplicates.sh"
    if not script.exists():
        return 0
    proc = subprocess.run([str(script), str(issue_number)], check=False)
    if proc.returncode == 0:
        return 0
    if proc.returncode == 1:
        log(logfile, f"Skipping #{issue_number} - duplicate detected by check-duplicates.sh")
        return 1
    log(logfile, f"Duplicate check error for #{issue_number} (exit={proc.returncode}) - proceeding with dispatch")
    return 0


def bot_labeled_items(config: BotConfig, labels: list[str], logfile: Path) -> list[dict]:
    if github_state_usable(config):
        items = state_file(config).items_with_any_label(labels)
        log(logfile, f"Label scan source: github-state file ({len(items)} items)")
        return items
    label_or = ",".join(f'"{label}"' for label in labels)
    result = gh(
        config,
        [
            "api",
            "-X",
            "GET",
            "search/issues",
            "--field",
            f"q=repo:{config.github_repo} is:open label:{label_or}",
            "--field",
            "per_page=100",
        ],
    )
    items = []
    if isinstance(result, dict):
        for item in result.get("items") or []:
            items.append(
                {
                    "number": item.get("number"),
                    "title": item.get("title", ""),
                    "labels": [label.get("name") for label in item.get("labels") or [] if isinstance(label, dict)],
                    "updatedAt": item.get("updated_at", ""),
                    "assignees": [a.get("login") for a in item.get("assignees") or [] if isinstance(a, dict)],
                }
            )
    log(logfile, "Label scan source: gh search/issues fallback (state file unavailable)")
    return items


def build_prompt(issue_number: int, title: str, label: str, workspace: str, entry_stage: str, repo: str) -> str:
    stage_block = f"Entry Stage: {entry_stage}\n" if entry_stage else ""
    followup = (
        f"Then read stages/{entry_stage}/CONTEXT.md for your instructions. You are entering at stage {entry_stage} in STANDALONE mode (no prior stage output). Follow the standalone completion instructions in the CONTEXT.md."
        if entry_stage
        else "Then follow the workspace CONTEXT.md instructions to process it."
    )
    return f"""Process GitHub issue #{issue_number} according to this workspace's instructions.

Issue: #{issue_number}
Title: {title}
Label: {label}
Workspace: {workspace}
{stage_block}
IMPORTANT: First read the full issue with: gh issue view {issue_number} --repo {repo}
{followup}"""


def launch(config: BotConfig, args: list[str], env: dict, logfile: Path) -> int:
    lib_path = str(config.bot_scripts_dir / "lib")
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{lib_path}:{existing_pythonpath}" if existing_pythonpath else lib_path
    if os.environ.get("BOT_HARNESS_SYNC") == "1":
        with logfile.open("a", encoding="utf-8") as fh:
            return subprocess.run(args, env=env, stdout=fh, stderr=fh, check=False).returncode
    with logfile.open("a", encoding="utf-8") as fh:
        proc = subprocess.Popen(args, env=env, stdout=fh, stderr=fh)
    return proc.pid


def launch_label_child(config: BotConfig, command: list[str], env: dict, logfile: Path, details: dict) -> int:
    child_file = config.claims_dir / f"dispatch-child-{details['issue_number']}-{os.getpid()}.json"
    payload = {
        "command": command,
        "env": env,
        "logfile": str(logfile),
        "github_repo": config.github_repo,
        "github_state_file": str(state_file(config).path),
        "claims_dir": str(config.claims_dir),
        **details,
    }
    write_json(child_file, payload)
    child_env = os.environ.copy()
    child_env.update(env)
    lib_path = str(config.bot_scripts_dir / "lib")
    existing_pythonpath = os.environ.get("PYTHONPATH", "")
    child_env["PYTHONPATH"] = f"{lib_path}:{existing_pythonpath}" if existing_pythonpath else lib_path
    if os.environ.get("BOT_HARNESS_SYNC") == "1":
        return subprocess.run([sys.executable, "-m", "bot_harness.dispatcher_child", str(child_file)], env=child_env, check=False).returncode
    proc = subprocess.Popen([sys.executable, "-m", "bot_harness.dispatcher_child", str(child_file)], env=child_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc.pid


def scheduled(config: BotConfig, registry: LabelRegistry, workspace: str, prompt: str, logfile: Path) -> int:
    lock = Path(f"{config.lock_prefix}-scheduled-{workspace}.lock")
    if not claim(lock):
        return 0
    precheck = config.bot_scripts_dir / f"{workspace}-precheck.sh"
    if precheck.exists() and os.access(precheck, os.X_OK):
        proc = subprocess.run([str(precheck)], text=True, capture_output=True, check=False)
        if proc.returncode != 0:
            log(logfile, f"Pre-check for {workspace} found nothing to do - skipping Claude")
            lock.unlink(missing_ok=True)
            return 0
        log(logfile, f"Pre-check for {workspace} found work: {proc.stdout.strip()}")
    scheduled_max = config.max_concurrent - config.reserved_interactive_slots
    running = count_running_agents(config.active_dir, config.lock_prefix)
    if running >= scheduled_max:
        log(logfile, f"Skipping scheduled {workspace} - {running} agents already running (scheduled max {scheduled_max})")
        lock.unlink(missing_ok=True)
        return 0
    env = os.environ.copy()
    env.update(
        {
            "MODEL": registry.by_workspace(workspace, "model"),
            "EFFORT": registry.by_workspace(workspace, "effort") or "high",
            "PROVIDER": registry.by_workspace(workspace, "provider"),
            "FALLBACK_PROVIDER": registry.by_workspace(workspace, "fallback_provider"),
            "REVIEW_PROVIDER": registry.by_workspace(workspace, "review_provider"),
            "CLAUDE_PERSONA": registry.by_workspace(workspace, "persona") or "default",
            "PRIORITY": "low",
        }
    )
    args = [str(config.bot_scripts_dir / "run-claude.sh"), "--workspace", workspace, prompt]
    pid = launch(config, args, env, logfile)
    log(logfile, f"Launched scheduled workspace={workspace} (PID {pid}, priority=low)")
    lock.unlink(missing_ok=True)
    return 0


def cleanup_failed_labels(config: BotConfig, logfile: Path) -> None:
    if github_state_usable(config):
        failed = state_file(config).issues_with_label("bot:failed")
    else:
        result = gh(config, ["issue", "list", "--repo", config.github_repo, "--label", "bot:failed", "--state", "open", "--json", "number"])
        failed = [item.get("number") for item in result] if isinstance(result, list) else []
    for issue in failed:
        if issue and prs_fixing_count(config, int(issue)) > 0:
            gh(config, ["issue", "edit", str(issue), "--repo", config.github_repo, "--remove-label", "bot:failed"], mutate=True)
            log(logfile, f"Removed false bot:failed from #{issue} (PR exists)")


def dispatch_labels(config: BotConfig, registry: LabelRegistry, logfile: Path) -> int:
    if not registry.path.exists():
        log(logfile, f"ERROR: Label registry not found: {registry.path}")
        return 1
    clear_gh_cache()
    cleanup_failed_labels(config, logfile)
    labels = registry.trigger_labels()
    if not labels:
        log(logfile, "No label-triggered entries in registry")
        return 0
    log(logfile, "Scanning for bot:* labeled items...")
    items = bot_labeled_items(config, labels, logfile)
    if not items:
        log(logfile, f"Dispatch cycle complete. dispatched=0 running={count_running_agents(config.active_dir, config.lock_prefix)}/{config.max_concurrent}")
        return 0
    log(logfile, f"Found {len(items)} bot:* labeled item(s) across all trigger labels")
    dispatched = 0
    for label in labels:
        if count_running_agents(config.active_dir, config.lock_prefix) >= config.max_concurrent:
            log(logfile, f"Concurrency limit reached ({config.max_concurrent}/{config.max_concurrent}) - stopping dispatch")
            break
        matching = [item for item in items if label in (item.get("labels") or [])]
        if not matching:
            continue
        log(logfile, f"Found {len(matching)} item(s) with label {label}")
        for item in matching:
            issue_number = int(item["number"])
            title = str(item.get("title", ""))
            updated_at = str(item.get("updatedAt", ""))
            if "duplicate" in (item.get("labels") or []):
                log(logfile, f"Skipping #{issue_number} ({title}) - labeled duplicate")
                continue
            if count_running_agents(config.active_dir, config.lock_prefix) >= config.max_concurrent:
                log(logfile, f"Concurrency limit ({config.max_concurrent}/{config.max_concurrent}) - deferring #{issue_number}")
                continue
            if issue_active(config, issue_number, label, updated_at, registry):
                log(logfile, f"Skipping #{issue_number} ({title}) - already active")
                continue
            workspace = registry.for_label(label, "workspace").rstrip("/")
            if not workspace:
                log(logfile, f"ERROR: No workspace mapped for label {label}")
                continue
            if not (config.project_dir / "bot-workspaces" / workspace).is_dir():
                log(logfile, f"ERROR: Workspace directory not found: bot-workspaces/{workspace}")
                continue
            max_ws = registry.int_for_label(label, "max_concurrent")
            if max_ws is not None and count_running_workspace_agents(config.active_dir, workspace, config.lock_prefix) >= max_ws:
                log(logfile, f"Workspace concurrency limit for {workspace} - deferring #{issue_number}")
                continue
            keep_label = registry.bool_for_label(label, "keep_label", False)
            if not keep_label and prs_fixing_count(config, issue_number) > 0:
                log(logfile, f"Skipping #{issue_number} ({title}) - PR already exists, removing stale trigger label")
                gh(config, ["issue", "edit", str(issue_number), "--repo", config.github_repo, "--remove-label", label], mutate=True)
                continue
            if duplicate_check(config, issue_number, logfile) == 1:
                gh(config, ["issue", "edit", str(issue_number), "--repo", config.github_repo, "--remove-label", label], mutate=True)
                continue
            claim_file = config.claims_dir / f"claimed-ws-dispatch-{issue_number}.txt"
            if not claim(claim_file):
                log(logfile, f"Skipping #{issue_number} - claim contention")
                continue
            entry_stage = registry.for_label(label, "entry_stage")
            prompt = build_prompt(issue_number, title, label, workspace, entry_stage, config.github_repo)
            gh(config, ["issue", "edit", str(issue_number), "--repo", config.github_repo, "--add-label", "bot:in-progress"], mutate=True)
            env = os.environ.copy()
            env.update(
                {
                    "MODEL": registry.for_label(label, "model"),
                    "EFFORT": registry.for_label(label, "effort") or "high",
                    "PROVIDER": registry.for_label(label, "provider"),
                    "FALLBACK_PROVIDER": registry.for_label(label, "fallback_provider"),
                    "REVIEW_PROVIDER": registry.for_label(label, "review_provider"),
                    "ENTRY_STAGE": entry_stage,
                    "CLAUDE_PERSONA": registry.for_label(label, "persona") or "default",
                    "ISSUE_NUMBER": str(issue_number),
                    "TRIGGER_LABEL": label,
                    "PRIORITY": "normal",
                }
            )
            args = [str(config.bot_scripts_dir / "run-claude.sh"), "--workspace", workspace]
            if keep_label:
                args += ["--session", f"ws-{workspace}-{issue_number}"]
            args += [prompt]
            log(logfile, f"Dispatching #{issue_number} ({title}) -> workspace={workspace}{' stage=' + entry_stage if entry_stage else ''}")
            details = {
                "issue_number": issue_number,
                "label": label,
                "workspace": workspace,
                "claim_file": str(claim_file),
                "keep_label": keep_label,
            }
            pid = launch_label_child(config, args, env, logfile, details)
            if os.environ.get("BOT_HARNESS_SYNC") != "1":
                claim_file.write_text(f"{pid}\n", encoding="utf-8")
            log(logfile, f"Launched agent for #{issue_number} (PID {pid}, workspace={workspace})")
            dispatched += 1
    log(logfile, f"Dispatch cycle complete. dispatched={dispatched} running={count_running_agents(config.active_dir, config.lock_prefix)}/{config.max_concurrent}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    config = BotConfig.from_env()
    logfile = config.bot_log_dir / "workspace-dispatcher.log"
    config.claims_dir.mkdir(parents=True, exist_ok=True)
    config.bot_log_dir.mkdir(parents=True, exist_ok=True)
    registry = LabelRegistry(config.registry_file)
    trace = gh_cost_trace_start()
    try:
        if args and args[0] == "--scheduled":
            if len(args) < 2:
                print("--scheduled requires a workspace name", file=sys.stderr)
                return 2
            return scheduled(config, registry, args[1], args[2] if len(args) > 2 else "Process this scheduled workspace job.", logfile)
        return dispatch_labels(config, registry, logfile)
    finally:
        gh_cost_trace_end(config, trace)


if __name__ == "__main__":
    raise SystemExit(main())
