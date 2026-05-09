"""Environment-backed configuration for the EC2 bot harness."""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def configure_github_token(bot_scripts_dir: Path) -> None:
    if os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN"):
        return
    helper = bot_scripts_dir / "lib" / "github-app-token.sh"
    if not helper.exists():
        return
    proc = subprocess.run([str(helper)], text=True, capture_output=True, check=False, env=os.environ.copy())
    token = proc.stdout.strip() if proc.returncode == 0 else ""
    if token:
        os.environ["GH_TOKEN"] = token
        os.environ["GITHUB_TOKEN"] = token


@dataclass(frozen=True)
class BotConfig:
    bot_name: str
    github_repo: str
    bot_home: Path
    bot_log_dir: Path
    bot_state_dir: Path
    bot_queue_dir: Path
    repo_root: Path
    project_dir: Path
    workspaces_dir: Path
    active_dir: Path
    bot_scripts_dir: Path
    lock_prefix: str
    heartbeat_dir: Path
    claims_dir: Path
    registry_file: Path
    max_concurrent: int
    reserved_interactive_slots: int
    max_queue_retries: int
    queue_ttl_minutes: int
    bot_ops_channel_id: str
    slack_bot_token: str

    @classmethod
    def from_env(cls) -> "BotConfig":
        bot_name = os.environ.get("BOT_NAME", "slam-paws")
        bot_home = Path(os.environ.get("BOT_HOME", "/opt/slam-bot"))
        load_env_file(Path(os.environ.get("BOT_ENV_FILE", str(bot_home / ".env"))))
        bot_name = os.environ.get("BOT_NAME", bot_name)
        bot_home = Path(os.environ.get("BOT_HOME", str(bot_home)))
        bot_state_dir = Path(os.environ.get("BOT_STATE_DIR", str(bot_home / "state")))
        repo_root = Path(os.environ.get("REPO_ROOT", str(Path.home() / "meet-without-fear")))
        project_dir = Path(os.environ.get("PROJECT_DIR", str(repo_root)))
        workspaces_dir = Path(os.environ.get("WORKSPACES_DIR", str(project_dir / "bot-workspaces")))
        active_dir = Path(os.environ.get("ACTIVE_DIR", str(workspaces_dir / "_active")))
        bot_scripts_dir = Path(os.environ.get("BOT_SCRIPTS_DIR", str(bot_home / "scripts")))
        configure_github_token(bot_scripts_dir)
        return cls(
            bot_name=bot_name,
            github_repo=os.environ.get("GITHUB_REPO", "shantamg/meet-without-fear"),
            bot_home=bot_home,
            bot_log_dir=Path(os.environ.get("BOT_LOG_DIR", "/var/log/slam-bot")),
            bot_state_dir=bot_state_dir,
            bot_queue_dir=Path(os.environ.get("BOT_QUEUE_DIR", str(bot_home / "queue"))),
            repo_root=repo_root,
            project_dir=project_dir,
            workspaces_dir=workspaces_dir,
            active_dir=active_dir,
            bot_scripts_dir=bot_scripts_dir,
            lock_prefix=os.environ.get("LOCK_PREFIX", "/tmp/slam-bot"),
            heartbeat_dir=Path(os.environ.get("HEARTBEAT_DIR", str(bot_state_dir / "heartbeats"))),
            claims_dir=Path(os.environ.get("CLAIMS_DIR", str(bot_state_dir / "claims"))),
            registry_file=Path(os.environ.get("REGISTRY_FILE", str(workspaces_dir / "label-registry.json"))),
            max_concurrent=env_int("MAX_CONCURRENT", 5),
            reserved_interactive_slots=env_int("RESERVED_INTERACTIVE_SLOTS", 2),
            max_queue_retries=env_int("MAX_QUEUE_RETRIES", 3),
            queue_ttl_minutes=env_int("QUEUE_TTL_MINUTES", 120),
            bot_ops_channel_id=os.environ.get("BOT_OPS_CHANNEL_ID", ""),
            slack_bot_token=os.environ.get("SLACK_BOT_TOKEN", ""),
        )
