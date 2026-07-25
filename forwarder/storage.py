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


class Storage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
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
        """id -> {name, reason, detail, at}"""
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
            "at": datetime.now(timezone.utc).isoformat(),
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
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO send_log(created_at, platform, target_id, target_name, status, detail)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (now, platform, target_id, target_name, status, detail),
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
