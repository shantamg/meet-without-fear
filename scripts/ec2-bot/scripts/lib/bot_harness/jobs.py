"""Durable interactive job queue for Slack-triggered bot runs."""

from __future__ import annotations

import argparse
import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib import request
from urllib.parse import urlencode

from .config import BotConfig
from .github_state import GitHubState
from .logging import append


TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
RUNNING_REAP_GRACE_SECONDS = 300


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def db_path(config: BotConfig) -> Path:
    return Path(os.environ.get("BOT_JOBS_DB", str(config.bot_state_dir / "jobs.sqlite")))


def connect(config: BotConfig) -> sqlite3.Connection:
    path = db_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL DEFAULT 'pending',
            priority TEXT NOT NULL DEFAULT 'normal',
            channel TEXT NOT NULL DEFAULT '',
            slack_channel TEXT NOT NULL DEFAULT '',
            slack_ts TEXT NOT NULL DEFAULT '',
            thread_ts TEXT NOT NULL DEFAULT '',
            command_slug TEXT NOT NULL DEFAULT '',
            workspace TEXT NOT NULL DEFAULT '',
            session_key TEXT NOT NULL DEFAULT '',
            prompt TEXT NOT NULL DEFAULT '',
            prompt_file TEXT NOT NULL DEFAULT '',
            msg_ts TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT '',
            fallback_provider TEXT NOT NULL DEFAULT '',
            review_provider TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            effort TEXT NOT NULL DEFAULT '',
            provenance_channel TEXT NOT NULL DEFAULT '',
            provenance_requester TEXT NOT NULL DEFAULT '',
            provenance_message TEXT NOT NULL DEFAULT '',
            log_name TEXT NOT NULL DEFAULT '',
            issue_number TEXT NOT NULL DEFAULT '',
            trigger_label TEXT NOT NULL DEFAULT '',
            entry_stage TEXT NOT NULL DEFAULT '',
            keep_label INTEGER NOT NULL DEFAULT 0,
            claim_file TEXT NOT NULL DEFAULT '',
            review_pr_number TEXT NOT NULL DEFAULT '',
            review_pr_head_sha TEXT NOT NULL DEFAULT '',
            review_pr_provider TEXT NOT NULL DEFAULT '',
            review_pr_context_file TEXT NOT NULL DEFAULT '',
            pid INTEGER,
            exit_code INTEGER,
            failure_reason TEXT NOT NULL DEFAULT '',
            log_path TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            claimed_at TEXT,
            started_at TEXT,
            completed_at TEXT,
            last_heartbeat_at TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status_priority_created
            ON jobs(status, priority, created_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_thread_running
            ON jobs(thread_ts, status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_slack_message
            ON jobs(slack_channel, slack_ts)
            WHERE slack_channel != '' AND slack_ts != '';
        """
    )
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
    columns = {
        "issue_number": "TEXT NOT NULL DEFAULT ''",
        "trigger_label": "TEXT NOT NULL DEFAULT ''",
        "entry_stage": "TEXT NOT NULL DEFAULT ''",
        "keep_label": "INTEGER NOT NULL DEFAULT 0",
        "claim_file": "TEXT NOT NULL DEFAULT ''",
        "review_pr_number": "TEXT NOT NULL DEFAULT ''",
        "review_pr_head_sha": "TEXT NOT NULL DEFAULT ''",
        "review_pr_provider": "TEXT NOT NULL DEFAULT ''",
        "review_pr_context_file": "TEXT NOT NULL DEFAULT ''",
    }
    for name, spec in columns.items():
        if name not in existing:
            try:
                conn.execute(f"ALTER TABLE jobs ADD COLUMN {name} {spec}")
            except sqlite3.OperationalError as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise
    conn.commit()


def priority_rank(priority: str) -> int:
    return {"high": 0, "normal": 1, "low": 2}.get(priority, 1)


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def active_agent_for_thread(config: BotConfig, channel: str, thread_ts: str) -> Path | None:
    if not channel or not thread_ts or not config.active_dir.exists():
        return None
    for agent_dir in sorted(config.active_dir.glob("agent-*")):
        suffix = agent_dir.name.removeprefix("agent-")
        if not suffix.isdigit() or not pid_alive(int(suffix)):
            continue
        try:
            meta = json.loads((agent_dir / "meta.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if meta.get("channel") == channel and meta.get("messageTs") == thread_ts:
            return agent_dir
    return None


def wait_active_agent_for_thread(config: BotConfig, channel: str, thread_ts: str, attempts: int = 10, delay: float = 0.5) -> Path | None:
    for attempt in range(attempts):
        agent_dir = active_agent_for_thread(config, channel, thread_ts)
        if agent_dir is not None:
            return agent_dir
        if attempt < attempts - 1:
            time.sleep(delay)
    return None


def active_message_text(payload: dict) -> str:
    channel = str(payload.get("slack_channel") or payload.get("channel") or "")
    slack_ts = str(payload.get("slack_ts") or payload.get("msg_ts") or "")
    thread_ts = str(payload.get("thread_ts") or "")
    requester = str(payload.get("provenance_requester") or "")
    message = str(payload.get("provenance_message") or "").strip()
    prompt_file = Path(str(payload.get("prompt_file") or ""))
    if not message and prompt_file.exists():
        try:
            message = prompt_file.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            message = ""
    return "\n".join(
        [
            "[Slack thread reply delivered while this run was active]",
            f"Channel: {channel}",
            f"Thread: {thread_ts}",
            f"Message timestamp: {slack_ts}",
            f"Requester: {requester or 'unknown'}",
            "",
            message or "(no text)",
        ]
    )


def deliver_to_active_agent(agent_dir: Path, payload: dict) -> Path:
    inbox = agent_dir / "inbox" / "unread"
    inbox.mkdir(parents=True, exist_ok=True)
    message_id = uuid.uuid4().hex
    path = inbox / f"slack-{message_id}.md"
    path.write_text(active_message_text(payload), encoding="utf-8")
    return path


def parsed_utc_timestamp(value: str | None) -> float:
    if not value:
        return 0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0


def reap_dead_running_jobs(conn: sqlite3.Connection) -> None:
    now = utc_now()
    now_ts = time.time()
    for row in conn.execute("SELECT id, pid, last_heartbeat_at, started_at, claimed_at FROM jobs WHERE status='running'").fetchall():
        pid = int(row["pid"] or 0)
        if pid_alive(pid):
            continue
        heartbeat_ts = parsed_utc_timestamp(str(row["last_heartbeat_at"] or row["started_at"] or row["claimed_at"] or ""))
        if heartbeat_ts and now_ts - heartbeat_ts < RUNNING_REAP_GRACE_SECONDS:
            continue
        conn.execute(
            """
            UPDATE jobs
            SET status='failed',
                completed_at=?,
                last_heartbeat_at=?,
                failure_reason=?
            WHERE id=? AND status='running'
            """,
            (now, now, f"worker recovered dead process pid={pid or 'missing'}", int(row["id"])),
        )


def enqueue(config: BotConfig, payload: dict) -> int:
    now = utc_now()
    fields = {
        "status": "pending",
        "priority": str(payload.get("priority") or "normal"),
        "channel": str(payload.get("channel") or ""),
        "slack_channel": str(payload.get("slack_channel") or payload.get("channel") or ""),
        "slack_ts": str(payload.get("slack_ts") or payload.get("msg_ts") or ""),
        "thread_ts": str(payload.get("thread_ts") or payload.get("slack_ts") or payload.get("msg_ts") or ""),
        "command_slug": str(payload.get("command_slug") or ""),
        "workspace": str(payload.get("workspace") or ""),
        "session_key": str(payload.get("session_key") or ""),
        "prompt": str(payload.get("prompt") or ""),
        "prompt_file": str(payload.get("prompt_file") or ""),
        "msg_ts": str(payload.get("msg_ts") or payload.get("slack_ts") or ""),
        "provider": str(payload.get("provider") or ""),
        "fallback_provider": str(payload.get("fallback_provider") or ""),
        "review_provider": str(payload.get("review_provider") or ""),
        "model": str(payload.get("model") or ""),
        "effort": str(payload.get("effort") or ""),
        "provenance_channel": str(payload.get("provenance_channel") or ""),
        "provenance_requester": str(payload.get("provenance_requester") or ""),
        "provenance_message": str(payload.get("provenance_message") or ""),
        "log_name": str(payload.get("log_name") or ""),
        "issue_number": str(payload.get("issue_number") or ""),
        "trigger_label": str(payload.get("trigger_label") or ""),
        "entry_stage": str(payload.get("entry_stage") or ""),
        "keep_label": 1 if payload.get("keep_label") else 0,
        "claim_file": str(payload.get("claim_file") or ""),
        "review_pr_number": str(payload.get("review_pr_number") or ""),
        "review_pr_head_sha": str(payload.get("review_pr_head_sha") or ""),
        "review_pr_provider": str(payload.get("review_pr_provider") or ""),
        "review_pr_context_file": str(payload.get("review_pr_context_file") or ""),
        "created_at": now,
        "last_heartbeat_at": now,
    }
    with connect(config) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = None
        if fields["slack_channel"] and fields["slack_ts"]:
            row = conn.execute(
                "SELECT id, status, failure_reason FROM jobs WHERE slack_channel=? AND slack_ts=?",
                (fields["slack_channel"], fields["slack_ts"]),
            ).fetchone()
        if row and row["status"] == "succeeded" and str(row["failure_reason"]).startswith("delivered_to_active_agent"):
            conn.commit()
            return int(row["id"])
        if (
            fields["slack_channel"]
            and fields["slack_ts"]
            and fields["thread_ts"]
            and fields["slack_ts"] != fields["thread_ts"]
            and thread_has_running_job(conn, fields["thread_ts"])
        ):
            agent_dir = wait_active_agent_for_thread(config, fields["slack_channel"], fields["thread_ts"])
            if agent_dir is not None:
                delivered_path = deliver_to_active_agent(agent_dir, payload)
                delivered_fields = {
                    **fields,
                    "status": "succeeded",
                    "completed_at": now,
                    "failure_reason": f"delivered_to_active_agent {agent_dir.name} {delivered_path.name}",
                }
                if row:
                    cols = ", ".join(f"{key}=?" for key in delivered_fields if key != "created_at")
                    values = [value for key, value in delivered_fields.items() if key != "created_at"]
                    conn.execute(f"UPDATE jobs SET {cols} WHERE id=?", [*values, int(row["id"])])
                    job_id = int(row["id"])
                else:
                    cols = ", ".join(delivered_fields)
                    placeholders = ", ".join("?" for _ in delivered_fields)
                    cur = conn.execute(f"INSERT INTO jobs ({cols}) VALUES ({placeholders})", list(delivered_fields.values()))
                    job_id = int(cur.lastrowid)
                conn.commit()
                slack_api(config, "reactions.remove", {"channel": fields["slack_channel"], "timestamp": fields["slack_ts"], "name": "hourglass_flowing_sand"})
                slack_api(config, "reactions.add", {"channel": fields["slack_channel"], "timestamp": fields["slack_ts"], "name": "white_check_mark"})
                return job_id
        if row:
            update_fields = {key: value for key, value in fields.items() if key != "created_at"}
            cols = ", ".join(f"{key}=?" for key in update_fields)
            conn.execute(f"UPDATE jobs SET {cols} WHERE id=?", [*update_fields.values(), int(row["id"])])
            job_id = int(row["id"])
        else:
            cols = ", ".join(fields)
            placeholders = ", ".join("?" for _ in fields)
            cur = conn.execute(f"INSERT INTO jobs ({cols}) VALUES ({placeholders})", list(fields.values()))
            job_id = int(cur.lastrowid)
        conn.commit()
        return job_id


def thread_has_running_job(conn: sqlite3.Connection, thread_ts: str) -> bool:
    if not thread_ts:
        return False
    row = conn.execute(
        "SELECT 1 FROM jobs WHERE thread_ts=? AND status='running' LIMIT 1",
        (thread_ts,),
    ).fetchone()
    return row is not None


def claim_next(config: BotConfig) -> sqlite3.Row | None:
    with connect(config) as conn:
        conn.execute("BEGIN IMMEDIATE")
        reap_dead_running_jobs(conn)
        rows = conn.execute("SELECT * FROM jobs WHERE status='pending' ORDER BY created_at ASC").fetchall()
        rows = sorted(rows, key=lambda row: (priority_rank(str(row["priority"])), str(row["created_at"])))
        selected = None
        for row in rows:
            if not thread_has_running_job(conn, str(row["thread_ts"])):
                selected = row
                break
        if selected is None:
            conn.commit()
            return None
        now = utc_now()
        conn.execute(
            "UPDATE jobs SET status='running', claimed_at=?, started_at=?, last_heartbeat_at=? WHERE id=?",
            (now, now, now, int(selected["id"])),
        )
        conn.commit()
        return conn.execute("SELECT * FROM jobs WHERE id=?", (int(selected["id"]),)).fetchone()


def update_job(config: BotConfig, job_id: int, **fields: object) -> None:
    if not fields:
        return
    cols = ", ".join(f"{key}=?" for key in fields)
    values = list(fields.values())
    values.append(job_id)
    with connect(config) as conn:
        conn.execute(f"UPDATE jobs SET {cols} WHERE id=?", values)
        conn.commit()


def get_job(config: BotConfig, job_id: int) -> sqlite3.Row | None:
    with connect(config) as conn:
        return conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()


def issue_has_active_job(config: BotConfig, issue_number: int) -> bool:
    with connect(config) as conn:
        row = conn.execute(
            """
            SELECT 1 FROM jobs
            WHERE issue_number=?
              AND status NOT IN ('succeeded','failed','cancelled')
            LIMIT 1
            """,
            (str(issue_number),),
        ).fetchone()
        return row is not None


def slack_api(config: BotConfig, endpoint: str, payload: dict) -> None:
    if not config.slack_bot_token:
        return
    data = urlencode(payload).encode()
    req = request.Request(
        f"https://slack.com/api/{endpoint}",
        data=data,
        headers={"Authorization": f"Bearer {config.slack_bot_token}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        request.urlopen(req, timeout=10).read()
    except Exception:
        return


def remove_reaction(config: BotConfig, job: sqlite3.Row, name: str) -> None:
    channel = str(job["slack_channel"])
    ts = str(job["slack_ts"])
    if channel and ts:
        slack_api(config, "reactions.remove", {"channel": channel, "timestamp": ts, "name": name})


def add_reaction(config: BotConfig, job: sqlite3.Row, name: str) -> None:
    channel = str(job["slack_channel"])
    ts = str(job["slack_ts"])
    if channel and ts:
        slack_api(config, "reactions.add", {"channel": channel, "timestamp": ts, "name": name})


def build_run_args(job: sqlite3.Row) -> list[str]:
    args: list[str] = []
    workspace = str(job["workspace"] or "")
    session_key = str(job["session_key"] or "")
    provider = str(job["provider"] or "")
    fallback_provider = str(job["fallback_provider"] or "")
    review_provider = str(job["review_provider"] or "")
    if workspace:
        args += ["--workspace", workspace]
    if session_key:
        args += ["--session", session_key]
    if provider:
        args += ["--provider", provider]
    if fallback_provider:
        args += ["--fallback-provider", fallback_provider]
    if review_provider:
        args += ["--review-provider", review_provider]
    if workspace:
        args += [str(job["prompt"] or ""), str(job["prompt_file"] or ""), str(job["msg_ts"] or "")]
    else:
        args += [str(job["command_slug"] or ""), str(job["prompt"] or ""), str(job["prompt_file"] or ""), str(job["msg_ts"] or "")]
    return args


def worker_log(config: BotConfig) -> Path:
    return config.bot_log_dir / "jobs-worker.log"


def run_job(config: BotConfig, job: sqlite3.Row) -> int:
    logfile = worker_log(config)
    append(logfile, f"[{time.ctime()}] START job {job['id']} {job['command_slug']} channel={job['slack_channel']} ts={job['slack_ts']} provider={job['provider'] or 'default'}\n")
    remove_reaction(config, job, "hourglass_flowing_sand")
    remove_reaction(config, job, "zzz")
    add_reaction(config, job, "eyes")

    env = os.environ.copy()
    lib_path = str(config.bot_scripts_dir / "lib")
    env["PYTHONPATH"] = f"{lib_path}:{env.get('PYTHONPATH', '')}".rstrip(":")
    env.update(
        {
            "BOT_SCRIPTS_DIR": str(config.bot_scripts_dir),
            "SLAM_BOT": "1",
            "PRIORITY": str(job["priority"] or "normal"),
            "CHANNEL": str(job["channel"] or job["slack_channel"] or ""),
            "THREAD_TS": str(job["thread_ts"] or ""),
            "PROVENANCE_CHANNEL": str(job["provenance_channel"] or ""),
            "PROVENANCE_REQUESTER": str(job["provenance_requester"] or ""),
            "PROVENANCE_MESSAGE": str(job["provenance_message"] or ""),
            "MODEL": str(job["model"] or ""),
            "EFFORT": str(job["effort"] or ""),
            "PROVIDER": str(job["provider"] or ""),
            "FALLBACK_PROVIDER": str(job["fallback_provider"] or ""),
            "REVIEW_PROVIDER": str(job["review_provider"] or ""),
            "ISSUE_NUMBER": str(job["issue_number"] or ""),
            "TRIGGER_LABEL": str(job["trigger_label"] or ""),
            "ENTRY_STAGE": str(job["entry_stage"] or ""),
            "REVIEW_PR_NUMBER": str(job["review_pr_number"] or ""),
            "REVIEW_PR_HEAD_SHA": str(job["review_pr_head_sha"] or ""),
            "REVIEW_PR_PROVIDER": str(job["review_pr_provider"] or ""),
            "REVIEW_PR_CONTEXT_FILE": str(job["review_pr_context_file"] or ""),
            "SLAM_BOT_JOB_ID": str(job["id"]),
        }
    )

    args = [sys.executable, "-m", "bot_harness", "run", *build_run_args(job)]
    with logfile.open("a", encoding="utf-8") as fh:
        proc = subprocess.Popen(args, cwd=str(config.project_dir), env=env, stdout=fh, stderr=fh, start_new_session=True)
    update_job(config, int(job["id"]), pid=proc.pid, log_path=str(logfile), last_heartbeat_at=utc_now())

    cancelled = False
    while True:
        code = proc.poll()
        if code is not None:
            break
        current = get_job(config, int(job["id"]))
        if current and str(current["status"]) == "cancel_requested":
            cancelled = True
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                code = proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                code = proc.wait()
            break
        update_job(config, int(job["id"]), last_heartbeat_at=utc_now())
        time.sleep(15)

    remove_reaction(config, job, "eyes")
    if cancelled:
        add_reaction(config, job, "x")
        update_job(config, int(job["id"]), status="cancelled", exit_code=code, completed_at=utc_now(), last_heartbeat_at=utc_now(), failure_reason="cancelled")
        append(logfile, f"[{time.ctime()}] CANCELLED job {job['id']} exit={code}\n")
        return int(code or 1)
    finish_github_job(config, job, int(code or 0), logfile)
    if code == 0:
        add_reaction(config, job, "white_check_mark")
        status = "succeeded"
        failure_reason = ""
    elif code in {75, 76}:
        add_reaction(config, job, "zzz")
        status = "failed"
        failure_reason = f"rate_limited exit_code={code}"
    else:
        add_reaction(config, job, "x")
        status = "failed"
        failure_reason = f"exit_code={code}"
    update_job(config, int(job["id"]), status=status, exit_code=code, completed_at=utc_now(), last_heartbeat_at=utc_now(), failure_reason=failure_reason)
    append(logfile, f"[{time.ctime()}] END job {job['id']} status={status} exit={code}\n")
    return int(code or 0)


def gh_json(config: BotConfig, args: list[str], *, mutate: bool = False) -> object | None:
    if mutate and os.environ.get("BOT_HARNESS_NO_GH_MUTATION") == "1":
        return None
    proc = subprocess.run(["gh", *args], text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout) if proc.stdout.strip() else None
    except json.JSONDecodeError:
        return None


def prs_fixing_count(config: BotConfig, issue_number: int) -> int:
    state = GitHubState(Path(os.environ.get("GITHUB_STATE_FILE", str(config.bot_state_dir / "github-state.json"))))
    if state.path.exists() and state.is_fresh():
        return state.prs_fixing_issue_count(issue_number)
    result = gh_json(config, ["pr", "list", "--repo", config.github_repo, "--search", f"Fixes #{issue_number}", "--state", "all", "--json", "number"])
    return len(result) if isinstance(result, list) else 0


def bot_commented(config: BotConfig, issue_number: int) -> bool:
    comments = gh_json(config, ["api", f"repos/{config.github_repo}/issues/{issue_number}/comments?per_page=5&direction=desc"])
    if not isinstance(comments, list):
        return False
    return any(
        ((comment.get("user") or {}).get("login") in {"slam-bot", "slam-bot-app[bot]"})
        for comment in comments
        if isinstance(comment, dict)
    )


def finish_github_job(config: BotConfig, job: sqlite3.Row, exit_code: int, logfile: Path) -> None:
    issue_raw = str(job["issue_number"] or "")
    label = str(job["trigger_label"] or "")
    if not issue_raw or not label:
        return
    try:
        issue = int(issue_raw)
    except ValueError:
        return
    claim_file = Path(str(job["claim_file"] or ""))
    if str(claim_file):
        claim_file.unlink(missing_ok=True)
    gh_json(config, ["issue", "edit", str(issue), "--repo", config.github_repo, "--remove-label", "bot:in-progress"], mutate=True)
    if bool(job["keep_label"]):
        append(logfile, f"[{time.ctime()}] Preserving label {label} on #{issue} (keep_label=true)\n")
        updated = gh_json(config, ["issue", "view", str(issue), "--repo", config.github_repo, "--json", "updatedAt"])
        updated_at = updated.get("updatedAt", "") if isinstance(updated, dict) else ""
        cooldown = config.claims_dir / f"cooldown-{issue}.txt"
        cooldown.parent.mkdir(parents=True, exist_ok=True)
        cooldown.write_text(f"{int(time.time())}\n{updated_at}\n", encoding="utf-8")
    else:
        gh_json(config, ["issue", "edit", str(issue), "--repo", config.github_repo, "--remove-label", label], mutate=True)
    if exit_code == 0:
        append(logfile, f"[{time.ctime()}] Completed GitHub job for #{issue}\n")
        return
    if prs_fixing_count(config, issue) > 0:
        append(logfile, f"[{time.ctime()}] Agent exited {exit_code} but PR exists for #{issue} - treating as success\n")
        return
    if bot_commented(config, issue):
        append(logfile, f"[{time.ctime()}] Agent exited {exit_code} but posted comments on #{issue} - treating as success\n")
        return
    append(logfile, f"[{time.ctime()}] Failed GitHub job for #{issue} (exit={exit_code}) - no PR or comments found\n")
    gh_json(config, ["issue", "edit", str(issue), "--repo", config.github_repo, "--add-label", "bot:failed"], mutate=True)


def request_cancel(config: BotConfig, channel: str, ts: str) -> int:
    with connect(config) as conn:
        row = conn.execute(
            "SELECT * FROM jobs WHERE slack_channel=? AND slack_ts=? AND status NOT IN ('succeeded','failed','cancelled') ORDER BY id DESC LIMIT 1",
            (channel, ts),
        ).fetchone()
        if not row:
            return 0
        status = "cancel_requested" if row["status"] == "running" else "cancelled"
        conn.execute(
            "UPDATE jobs SET status=?, completed_at=COALESCE(completed_at, ?), failure_reason=? WHERE id=?",
            (status, utc_now(), "cancel requested by Slack reaction", int(row["id"])),
        )
        conn.commit()
        if status == "cancelled":
            remove_reaction(config, row, "hourglass_flowing_sand")
        return int(row["id"])


def worker_once(config: BotConfig) -> int:
    job = claim_next(config)
    if job is None:
        return 0
    return run_job(config, job)


def worker_loop(config: BotConfig, idle_sleep: int) -> int:
    while True:
        code = worker_once(config)
        if code == 0:
            time.sleep(idle_sleep)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="bot_harness jobs")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("enqueue")
    sub.add_parser("worker-once")
    worker = sub.add_parser("worker")
    worker.add_argument("--idle-sleep", type=int, default=5)
    cancel = sub.add_parser("cancel")
    cancel.add_argument("channel")
    cancel.add_argument("ts")
    args = parser.parse_args([] if argv is None else argv)
    config = BotConfig.from_env()
    if args.command == "init":
        connect(config).close()
        return 0
    if args.command == "enqueue":
        payload = json.loads(sys.stdin.read() or "{}")
        print(enqueue(config, payload))
        return 0
    if args.command == "worker-once":
        return worker_once(config)
    if args.command == "worker":
        return worker_loop(config, args.idle_sleep)
    if args.command == "cancel":
        print(request_cancel(config, args.channel, args.ts))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
