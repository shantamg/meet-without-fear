"""Public command dispatcher for the EC2 bot harness."""

from __future__ import annotations

import os
import sys

from pathlib import Path

from . import activity_journal, agent_runtime, dispatcher, github_check, jobs, queue, run
from .processes import count_running_agents, count_running_workspace_agents
from .shared_state import create_queue_entry


def exec_script(name: str, args: list[str]) -> int:
    scripts_dir = Path(os.environ.get("BOT_SCRIPTS_DIR", Path(__file__).resolve().parents[2]))
    script = scripts_dir / name
    os.execvpe(str(script), [str(script), *args], os.environ.copy())
    return 127


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m bot_harness <run|dispatch|jobs|queue|github-check|command>", file=sys.stderr)
        return 2
    command = sys.argv[1]
    args = sys.argv[2:]
    if command == "run":
        return run.main(args)
    if command == "dispatch":
        return dispatcher.main(args)
    if command == "queue":
        return queue.main(args)
    if command == "jobs":
        return jobs.main(args)
    if command == "github-check":
        return github_check.main(args)
    if command == "activity-write":
        activity_journal.write_entry_from_env()
        return 0
    if command == "activity-render":
        activity_journal.render_from_env()
        return 0
    if command.startswith("agent-"):
        return agent_runtime.main([command.removeprefix("agent-"), *args])
    if command == "count-running":
        active_dir = Path(args[0])
        lock_prefix = args[1] if len(args) > 1 else ""
        print(count_running_agents(active_dir, lock_prefix))
        return 0
    if command == "count-workspace":
        active_dir = Path(args[0])
        workspace = args[1]
        lock_prefix = args[2] if len(args) > 2 else ""
        print(count_running_workspace_agents(active_dir, workspace, lock_prefix))
        return 0
    if command == "create-queue":
        queue_dir = Path(args[0])
        print(create_queue_entry(queue_dir))
        return 0
    print(f"unknown command: {command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
