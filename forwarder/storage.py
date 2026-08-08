from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

from forwarder import crypto

# psycopg2 connections are relatively expensive to open, and Storage() is
# constructed fresh on every Streamlit rerun and on every job-runner thread.
# Share one small pool per database_url across all Storage instances instead
# of opening a pool per instance (which would exhaust Postgres connections).
_POOLS: dict[str, pg_pool.ThreadedConnectionPool] = {}
_POOLS_LOCK = threading.Lock()

# _init_db()'s DDL (CREATE TABLE/INDEX IF NOT EXISTS, ALTER TABLE ADD COLUMN
# IF NOT EXISTS) takes a real lock even when it ends up a no-op. Storage() is
# constructed on every Streamlit rerun and every background job thread, so
# without this guard, concurrent Storage() calls race on the same DDL and can
# deadlock in Postgres (seen in production: psycopg2.errors.DeadlockDetected
# on AccessExclusiveLock during _init_db). Run it once per process instead.
_SCHEMA_READY: set[str] = set()
_SCHEMA_LOCK = threading.Lock()


def _get_pool(database_url: str) -> pg_pool.ThreadedConnectionPool:
    if database_url not in _POOLS:
        with _POOLS_LOCK:
            if database_url not in _POOLS:
                _POOLS[database_url] = pg_pool.ThreadedConnectionPool(
                    1, 10, dsn=database_url
                )
    return _POOLS[database_url]


def _jsonval(value: Any) -> Any:
    """psycopg2 auto-parses jsonb columns into Python objects, but be
    defensive in case a driver version ever returns raw text."""
    if isinstance(value, (list, dict)):
        return value
    if value is None:
        return None
    return json.loads(value)


@dataclass
class UserRow:
    id: int
    email: str
    password_hash: str
    role: str
    is_active: bool
    must_change_password: bool
    created_at: str


@dataclass
class ProfileRow:
    id: int
    user_id: int
    label: str
    telegram_session: str
    telegram_api_id: int | None
    telegram_api_hash: str | None
    draft_message: str
    draft_saved_message_id: int | None
    draft_mode: str
    created_at: str
    updated_at: str


@dataclass
class SendLogRow:
    id: int
    created_at: str
    profile_id: int
    platform: str
    target_id: str
    target_name: str
    status: str
    detail: str


@dataclass
class JobRow:
    id: int
    profile_id: int
    created_at: str
    updated_at: str
    status: str
    message: str
    source_message_id: int | None
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
class TrendPointRow:
    day: str
    sent: int
    errors: int
    total: int


@dataclass
class UserStatsRow:
    total_sent: int
    total_errors: int
    total_attempts: int
    last_activity: str | None
    profiles: list[dict]


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


class Storage:
    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set")
        self._pool = _get_pool(database_url)
        if database_url not in _SCHEMA_READY:
            with _SCHEMA_LOCK:
                if database_url not in _SCHEMA_READY:
                    self._init_db()
                    _SCHEMA_READY.add(database_url)

    @contextmanager
    def _conn(self) -> Iterator[psycopg2.extensions.connection]:
        conn = self._pool.getconn()
        conn.cursor_factory = psycopg2.extras.RealDictCursor
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._pool.putconn(conn)

    def _init_db(self) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS profiles (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    label TEXT NOT NULL,
                    telegram_session_enc BYTEA NOT NULL,
                    telegram_api_id INTEGER,
                    telegram_api_hash TEXT,
                    draft_message TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

                CREATE TABLE IF NOT EXISTS jobs (
                    id SERIAL PRIMARY KEY,
                    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    delay_seconds DOUBLE PRECISION NOT NULL,
                    max_slowmode_wait INTEGER NOT NULL,
                    include_discord BOOLEAN NOT NULL DEFAULT FALSE,
                    total INTEGER NOT NULL DEFAULT 0,
                    done INTEGER NOT NULL DEFAULT 0,
                    current_name TEXT NOT NULL DEFAULT '',
                    current_detail TEXT NOT NULL DEFAULT '',
                    error TEXT NOT NULL DEFAULT '',
                    pending_json JSONB NOT NULL DEFAULT '[]',
                    summary_json JSONB NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_profile_status ON jobs(profile_id, status);

                CREATE TABLE IF NOT EXISTS job_results (
                    id SERIAL PRIMARY KEY,
                    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    platform TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    target_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_job_results_job ON job_results(job_id);

                CREATE TABLE IF NOT EXISTS send_log (
                    id SERIAL PRIMARY KEY,
                    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    platform TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    target_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_send_log_profile ON send_log(profile_id, id DESC);

                CREATE TABLE IF NOT EXISTS telegram_skips (
                    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    target_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (profile_id, target_id)
                );

                CREATE TABLE IF NOT EXISTS discord_selected_channels (
                    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    channel_id TEXT NOT NULL,
                    PRIMARY KEY (profile_id, channel_id)
                );
                """
            )
            # Added after the initial deploy — ALTER ... IF NOT EXISTS keeps
            # this idempotent for both fresh and already-provisioned databases.
            cur.execute(
                """
                ALTER TABLE profiles ADD COLUMN IF NOT EXISTS draft_saved_message_id BIGINT;
                ALTER TABLE profiles ADD COLUMN IF NOT EXISTS draft_mode TEXT NOT NULL DEFAULT 'text';
                ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_message_id BIGINT;
                """
            )

    # ---------------------------------------------------------------- users

    def create_user(
        self,
        email: str,
        password_hash: str,
        role: str = "user",
        must_change_password: bool = True,
    ) -> int:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users(email, password_hash, role, must_change_password)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (email.strip().lower(), password_hash, role, must_change_password),
            )
            return int(cur.fetchone()["id"])

    @staticmethod
    def _user_from_row(row: Any) -> UserRow:
        return UserRow(
            id=row["id"],
            email=row["email"],
            password_hash=row["password_hash"],
            role=row["role"],
            is_active=bool(row["is_active"]),
            must_change_password=bool(row["must_change_password"]),
            created_at=str(row["created_at"]),
        )

    def get_user_by_email(self, email: str) -> UserRow | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM users WHERE email = %s", (email.strip().lower(),)
            )
            row = cur.fetchone()
        return self._user_from_row(row) if row else None

    def get_user_by_id(self, user_id: int) -> UserRow | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
        return self._user_from_row(row) if row else None

    def list_users(self) -> list[UserRow]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM users ORDER BY created_at ASC")
            rows = cur.fetchall()
        return [self._user_from_row(r) for r in rows]

    def get_user_stats(self, user_id: int) -> UserStatsRow:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE sl.status = 'ok') AS total_sent,
                    COUNT(*) FILTER (WHERE sl.status = 'error') AS total_errors,
                    COUNT(sl.id) AS total_attempts,
                    MAX(sl.created_at) AS last_activity
                FROM profiles p
                LEFT JOIN send_log sl ON sl.profile_id = p.id
                WHERE p.user_id = %s
                """,
                (user_id,),
            )
            agg = cur.fetchone()

            cur.execute(
                """
                SELECT
                    p.id, p.label,
                    COUNT(sl.id) FILTER (WHERE sl.status = 'ok') AS sent,
                    COUNT(sl.id) FILTER (WHERE sl.status = 'error') AS errors,
                    COUNT(sl.id) AS attempts,
                    MAX(sl.created_at) AS last_activity
                FROM profiles p
                LEFT JOIN send_log sl ON sl.profile_id = p.id
                WHERE p.user_id = %s
                GROUP BY p.id, p.label
                ORDER BY p.id ASC
                """,
                (user_id,),
            )
            profile_rows = cur.fetchall()

        return UserStatsRow(
            total_sent=int(agg["total_sent"] or 0),
            total_errors=int(agg["total_errors"] or 0),
            total_attempts=int(agg["total_attempts"] or 0),
            last_activity=str(agg["last_activity"]) if agg["last_activity"] else None,
            profiles=[
                {
                    "id": r["id"],
                    "label": r["label"],
                    "sent": int(r["sent"] or 0),
                    "errors": int(r["errors"] or 0),
                    "attempts": int(r["attempts"] or 0),
                    "last_activity": str(r["last_activity"]) if r["last_activity"] else None,
                }
                for r in profile_rows
            ],
        )

    def count_admins(self) -> int:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
            return int(cur.fetchone()["n"])

    def set_user_active(self, user_id: int, active: bool) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET is_active = %s WHERE id = %s", (active, user_id)
            )

    def set_user_password(
        self, user_id: int, password_hash: str, must_change_password: bool = False
    ) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s, must_change_password = %s WHERE id = %s",
                (password_hash, must_change_password, user_id),
            )

    # ------------------------------------------------------------- profiles

    def create_profile(
        self,
        user_id: int,
        label: str,
        telegram_session: str,
        telegram_api_id: int | None = None,
        telegram_api_hash: str | None = None,
    ) -> int:
        enc = crypto.encrypt(telegram_session)
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO profiles(
                    user_id, label, telegram_session_enc, telegram_api_id, telegram_api_hash
                ) VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, label, psycopg2.Binary(enc), telegram_api_id, telegram_api_hash),
            )
            return int(cur.fetchone()["id"])

    @staticmethod
    def _profile_from_row(row: Any) -> ProfileRow:
        return ProfileRow(
            id=row["id"],
            user_id=row["user_id"],
            label=row["label"],
            telegram_session=crypto.decrypt(row["telegram_session_enc"]),
            telegram_api_id=row["telegram_api_id"],
            telegram_api_hash=row["telegram_api_hash"],
            draft_message=row["draft_message"] or "",
            draft_saved_message_id=row["draft_saved_message_id"],
            draft_mode=row["draft_mode"] or "text",
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    def get_profile(self, profile_id: int) -> ProfileRow | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM profiles WHERE id = %s", (profile_id,))
            row = cur.fetchone()
        return self._profile_from_row(row) if row else None

    def list_profiles_for_user(self, user_id: int) -> list[ProfileRow]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM profiles WHERE user_id = %s ORDER BY created_at ASC",
                (user_id,),
            )
            rows = cur.fetchall()
        return [self._profile_from_row(r) for r in rows]

    def update_profile_session(self, profile_id: int, telegram_session: str) -> None:
        enc = crypto.encrypt(telegram_session)
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE profiles
                SET telegram_session_enc = %s, updated_at = now()
                WHERE id = %s
                """,
                (psycopg2.Binary(enc), profile_id),
            )

    def set_draft_message(self, profile_id: int, message: str) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE profiles
                SET draft_message = %s, draft_mode = 'text', updated_at = now()
                WHERE id = %s
                """,
                (message, profile_id),
            )

    def set_draft_saved_message(self, profile_id: int, saved_message_id: int) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE profiles
                SET draft_saved_message_id = %s, draft_mode = 'saved', updated_at = now()
                WHERE id = %s
                """,
                (saved_message_id, profile_id),
            )

    # --------------------------------------------------------- skip / block

    def get_telegram_skips(self, profile_id: int) -> dict[str, dict]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM telegram_skips WHERE profile_id = %s", (profile_id,)
            )
            rows = cur.fetchall()
        return {
            row["target_id"]: {
                "name": row["name"],
                "reason": row["reason"],
                "detail": row["detail"],
                "at": str(row["at"]),
            }
            for row in rows
        }

    def add_telegram_skip(
        self, profile_id: int, target_id: str, name: str, reason: str, detail: str = ""
    ) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO telegram_skips(profile_id, target_id, name, reason, detail, at)
                VALUES (%s, %s, %s, %s, %s, now())
                ON CONFLICT (profile_id, target_id)
                DO UPDATE SET name = excluded.name, reason = excluded.reason,
                              detail = excluded.detail, at = excluded.at
                """,
                (profile_id, str(target_id), name, reason, detail),
            )

    def remove_telegram_skip(self, profile_id: int, target_id: str) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM telegram_skips WHERE profile_id = %s AND target_id = %s",
                (profile_id, str(target_id)),
            )

    def clear_telegram_skips(self, profile_id: int) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM telegram_skips WHERE profile_id = %s", (profile_id,)
            )

    # --------------------------------------------------------------- discord

    def get_selected_discord_channels(self, profile_id: int) -> list[str]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT channel_id FROM discord_selected_channels WHERE profile_id = %s",
                (profile_id,),
            )
            rows = cur.fetchall()
        return [r["channel_id"] for r in rows]

    def set_selected_discord_channels(
        self, profile_id: int, channel_ids: list[str]
    ) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM discord_selected_channels WHERE profile_id = %s",
                (profile_id,),
            )
            for cid in channel_ids:
                cur.execute(
                    """
                    INSERT INTO discord_selected_channels(profile_id, channel_id)
                    VALUES (%s, %s) ON CONFLICT DO NOTHING
                    """,
                    (profile_id, str(cid)),
                )

    # ------------------------------------------------------------- send log

    def add_send_log(
        self,
        profile_id: int,
        platform: str,
        target_id: str,
        target_name: str,
        status: str,
        detail: str = "",
    ) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO send_log(profile_id, platform, target_id, target_name, status, detail)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (profile_id, platform, target_id, target_name, status, detail),
            )

    def list_send_logs(self, profile_id: int, limit: int = 100) -> list[SendLogRow]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, created_at, profile_id, platform, target_id, target_name, status, detail
                FROM send_log
                WHERE profile_id = %s
                ORDER BY id DESC
                LIMIT %s
                """,
                (profile_id, limit),
            )
            rows = cur.fetchall()
        return [
            SendLogRow(
                id=r["id"],
                created_at=str(r["created_at"]),
                profile_id=r["profile_id"],
                platform=r["platform"],
                target_id=r["target_id"],
                target_name=r["target_name"],
                status=r["status"],
                detail=r["detail"],
            )
            for r in rows
        ]

    def get_send_trend(self, profile_id: int, days: int = 30) -> list[TrendPointRow]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    date_trunc('day', created_at)::date AS day,
                    COUNT(*) FILTER (WHERE status = 'ok') AS sent,
                    COUNT(*) FILTER (WHERE status = 'error') AS errors,
                    COUNT(*) AS total
                FROM send_log
                WHERE profile_id = %s
                  AND created_at >= now() - (%s || ' days')::interval
                GROUP BY day
                ORDER BY day ASC
                """,
                (profile_id, days),
            )
            rows = cur.fetchall()
        return [
            TrendPointRow(
                day=str(r["day"]), sent=int(r["sent"]), errors=int(r["errors"]), total=int(r["total"])
            )
            for r in rows
        ]

    # ----------------------------------------------------------------- jobs

    @staticmethod
    def _job_from_row(row: Any) -> JobRow:
        return JobRow(
            id=row["id"],
            profile_id=row["profile_id"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            status=row["status"],
            message=row["message"],
            source_message_id=row["source_message_id"],
            delay_seconds=float(row["delay_seconds"]),
            max_slowmode_wait=int(row["max_slowmode_wait"]),
            include_discord=bool(row["include_discord"]),
            total=int(row["total"]),
            done=int(row["done"]),
            current_name=row["current_name"] or "",
            current_detail=row["current_detail"] or "",
            error=row["error"] or "",
            pending=_jsonval(row["pending_json"]) or [],
            summary=_jsonval(row["summary_json"]) or {},
        )

    def create_job(
        self,
        profile_id: int,
        message: str,
        delay_seconds: float,
        max_slowmode_wait: int,
        include_discord: bool,
        source_message_id: int | None = None,
    ) -> int:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs(
                    profile_id, status, message, source_message_id, delay_seconds,
                    max_slowmode_wait, include_discord, total, done,
                    current_name, current_detail, error, pending_json, summary_json
                ) VALUES (%s, 'queued', %s, %s, %s, %s, %s, 0, 0, '', 'Queued', '', '[]', '{}')
                RETURNING id
                """,
                (
                    profile_id,
                    message,
                    source_message_id,
                    delay_seconds,
                    max_slowmode_wait,
                    include_discord,
                ),
            )
            return int(cur.fetchone()["id"])

    def get_job(self, job_id: int) -> JobRow | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM jobs WHERE id = %s", (job_id,))
            row = cur.fetchone()
        return self._job_from_row(row) if row else None

    def get_active_job(self, profile_id: int) -> JobRow | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM jobs
                WHERE profile_id = %s AND status IN ('queued', 'running')
                ORDER BY id DESC
                LIMIT 1
                """,
                (profile_id,),
            )
            row = cur.fetchone()
        return self._job_from_row(row) if row else None

    def get_latest_job(self, profile_id: int) -> JobRow | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM jobs WHERE profile_id = %s ORDER BY id DESC LIMIT 1",
                (profile_id,),
            )
            row = cur.fetchone()
        return self._job_from_row(row) if row else None

    def list_resumable_jobs(self) -> list[JobRow]:
        """Unscoped across all profiles — used on boot to resume every
        profile's own interrupted/queued job."""
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM jobs
                WHERE status IN ('interrupted', 'queued', 'running')
                ORDER BY id ASC
                """
            )
            rows = cur.fetchall()
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
                cols.append("pending_json = %s")
                vals.append(psycopg2.extras.Json(value))
            elif key == "summary":
                cols.append("summary_json = %s")
                vals.append(psycopg2.extras.Json(value))
            else:
                cols.append(f"{key} = %s")
                vals.append(value)
        cols.append("updated_at = now()")
        vals.append(job_id)
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"UPDATE jobs SET {', '.join(cols)} WHERE id = %s",
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
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO job_results(
                    job_id, platform, target_id, target_name, status, detail
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (job_id, platform, target_id, target_name, status, detail),
            )

    def list_job_results(self, job_id: int, limit: int = 20000) -> list[JobResultRow]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, job_id, created_at, platform, target_id, target_name, status, detail
                FROM job_results
                WHERE job_id = %s
                ORDER BY id ASC
                LIMIT %s
                """,
                (job_id, limit),
            )
            rows = cur.fetchall()
        return [
            JobResultRow(
                id=r["id"],
                job_id=r["job_id"],
                created_at=str(r["created_at"]),
                platform=r["platform"],
                target_id=r["target_id"],
                target_name=r["target_name"],
                status=r["status"],
                detail=r["detail"],
            )
            for r in rows
        ]

    def mark_orphaned_jobs_interrupted(self) -> list[int]:
        """Mark queued/running jobs as interrupted after process restart."""
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM jobs WHERE status IN ('queued', 'running')"
            )
            ids = [int(row["id"]) for row in cur.fetchall()]
            if ids:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'interrupted',
                        current_detail = 'Process restarted — waiting to resume',
                        updated_at = now()
                    WHERE id = ANY(%s)
                    """,
                    (ids,),
                )
        return ids
