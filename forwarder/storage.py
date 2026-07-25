from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


@dataclass
class SendLogRow:
    id: int
    created_at: str
    platform: str
    target_id: str
    target_name: str
    status: str
    detail: str


@dataclass
class JobRow:
    id: int
    created_at: str
    updated_at: str
    status: str
    message: str
    delay_seconds: float
    max_slowmode_wait: int
    include_discord: bool
    total: int
    done: int
    current_name: str
    current_detail: str
    error: str
    pending: list[dict]
    summary: dict


@dataclass
class JobResultRow:
    id: int
    job_id: int
    created_at: str
    platform: str
    target_id: str
    target_name: str
    status: str
    detail: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Storage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=60)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=60000")
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS kv (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS send_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    target_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    delay_seconds REAL NOT NULL,
                    max_slowmode_wait INTEGER NOT NULL,
                    include_discord INTEGER NOT NULL DEFAULT 0,
                    total INTEGER NOT NULL DEFAULT 0,
                    done INTEGER NOT NULL DEFAULT 0,
                    current_name TEXT NOT NULL DEFAULT '',
                    current_detail TEXT NOT NULL DEFAULT '',
                    error TEXT NOT NULL DEFAULT '',
                    pending_json TEXT NOT NULL DEFAULT '[]',
                    summary_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS job_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    target_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY(job_id) REFERENCES jobs(id)
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_job_results_job ON job_results(job_id);
                """
            )

    def get_json(self, key: str, default: Any = None) -> Any:
        with self._conn() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        if row is None:
            return default
        return json.loads(row["value"])

    def set_json(self, key: str, value: Any) -> None:
        payload = json.dumps(value)
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, payload),
            )

    def get_selected_targets(self) -> dict[str, list[str]]:
        data = self.get_json("selected_targets", {"telegram": [], "discord": []})
        return {
            "telegram": list(data.get("telegram", [])),
            "discord": list(data.get("discord", [])),
        }

    def set_selected_targets(self, telegram_ids: list[str], discord_ids: list[str]) -> None:
        self.set_json(
            "selected_targets",
            {"telegram": telegram_ids, "discord": discord_ids},
        )

    def get_draft_message(self) -> str:
        return str(self.get_json("draft_message", "") or "")

    def set_draft_message(self, message: str) -> None:
        self.set_json("draft_message", message)

    def get_telegram_skips(self) -> dict[str, dict]:
        data = self.get_json("telegram_skips", {}) or {}
        return {str(k): dict(v) for k, v in data.items()}

    def add_telegram_skip(
        self, target_id: str, name: str, reason: str, detail: str = ""
    ) -> None:
        skips = self.get_telegram_skips()
        skips[str(target_id)] = {
            "name": name,
            "reason": reason,
            "detail": detail,
            "at": _now(),
        }
        self.set_json("telegram_skips", skips)

    def remove_telegram_skip(self, target_id: str) -> None:
        skips = self.get_telegram_skips()
        skips.pop(str(target_id), None)
        self.set_json("telegram_skips", skips)

    def clear_telegram_skips(self) -> None:
        self.set_json("telegram_skips", {})

    def add_send_log(
        self,
        platform: str,
        target_id: str,
        target_name: str,
        status: str,
        detail: str = "",
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO send_log(created_at, platform, target_id, target_name, status, detail)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (_now(), platform, target_id, target_name, status, detail),
            )

    def list_send_logs(self, limit: int = 100) -> list[SendLogRow]:
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT id, created_at, platform, target_id, target_name, status, detail
                FROM send_log
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [SendLogRow(**dict(row)) for row in rows]

    @staticmethod
    def _job_from_row(row: sqlite3.Row) -> JobRow:
        return JobRow(
            id=row["id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            status=row["status"],
            message=row["message"],
            delay_seconds=float(row["delay_seconds"]),
            max_slowmode_wait=int(row["max_slowmode_wait"]),
            include_discord=bool(row["include_discord"]),
            total=int(row["total"]),
            done=int(row["done"]),
            current_name=row["current_name"] or "",
            current_detail=row["current_detail"] or "",
            error=row["error"] or "",
            pending=json.loads(row["pending_json"] or "[]"),
            summary=json.loads(row["summary_json"] or "{}"),
        )

    def create_job(
        self,
        message: str,
        delay_seconds: float,
        max_slowmode_wait: int,
        include_discord: bool,
    ) -> int:
        now = _now()
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO jobs(
                    created_at, updated_at, status, message, delay_seconds,
                    max_slowmode_wait, include_discord, total, done,
                    current_name, current_detail, error, pending_json, summary_json
                ) VALUES (?, ?, 'queued', ?, ?, ?, ?, 0, 0, '', 'Queued', '', '[]', '{}')
                """,
                (
                    now,
                    now,
                    message,
                    delay_seconds,
                    max_slowmode_wait,
                    1 if include_discord else 0,
                ),
            )
            return int(cur.lastrowid)

    def get_job(self, job_id: int) -> JobRow | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._job_from_row(row) if row else None

    def get_active_job(self) -> JobRow | None:
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT * FROM jobs
                WHERE status IN ('queued', 'running')
                ORDER BY id DESC
                LIMIT 1
                """
            ).fetchone()
        return self._job_from_row(row) if row else None

    def get_latest_job(self) -> JobRow | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM jobs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return self._job_from_row(row) if row else None

    def list_resumable_jobs(self) -> list[JobRow]:
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM jobs
                WHERE status IN ('interrupted', 'queued', 'running')
                ORDER BY id ASC
                """
            ).fetchall()
        return [self._job_from_row(r) for r in rows]

    def update_job(self, job_id: int, **fields: Any) -> None:
        if not fields:
            return
        allowed = {
            "status",
            "total",
            "done",
            "current_name",
            "current_detail",
            "error",
            "pending",
            "summary",
            "message",
            "delay_seconds",
            "max_slowmode_wait",
            "include_discord",
        }
        cols: list[str] = []
        vals: list[Any] = []
        for key, value in fields.items():
            if key not in allowed:
                continue
            if key == "pending":
                cols.append("pending_json = ?")
                vals.append(json.dumps(value))
            elif key == "summary":
                cols.append("summary_json = ?")
                vals.append(json.dumps(value))
            elif key == "include_discord":
                cols.append("include_discord = ?")
                vals.append(1 if value else 0)
            else:
                cols.append(f"{key} = ?")
                vals.append(value)
        cols.append("updated_at = ?")
        vals.append(_now())
        vals.append(job_id)
        with self._conn() as conn:
            conn.execute(
                f"UPDATE jobs SET {', '.join(cols)} WHERE id = ?",
                vals,
            )

    def add_job_result(
        self,
        job_id: int,
        platform: str,
        target_id: str,
        target_name: str,
        status: str,
        detail: str = "",
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO job_results(
                    job_id, created_at, platform, target_id, target_name, status, detail
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, _now(), platform, target_id, target_name, status, detail),
            )

    def list_job_results(self, job_id: int, limit: int = 500) -> list[JobResultRow]:
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT id, job_id, created_at, platform, target_id, target_name, status, detail
                FROM job_results
                WHERE job_id = ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (job_id, limit),
            ).fetchall()
        return [JobResultRow(**dict(row)) for row in rows]

    def mark_orphaned_jobs_interrupted(self) -> list[int]:
        """Mark queued/running jobs as interrupted after process restart."""
        ids: list[int] = []
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id FROM jobs WHERE status IN ('queued', 'running')"
            ).fetchall()
            for row in rows:
                ids.append(int(row["id"]))
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = 'interrupted',
                        current_detail = 'Process restarted — waiting to resume',
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (_now(), row["id"]),
                )
        return ids
