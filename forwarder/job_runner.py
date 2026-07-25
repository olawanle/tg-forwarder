from __future__ import annotations

import asyncio
import logging
import threading
import time

from forwarder.config import get_settings
from forwarder.discord_service import DiscordService
from forwarder.storage import Storage
from forwarder.telegram_service import TelegramService

log = logging.getLogger("forwarder.job_runner")


class JobRunner:
    """Runs broadcasts in a background thread so Streamlit navigation cannot stop them."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._active_job_id: int | None = None
        self._started = False

    def ensure_started(self, store: Storage, telegram_session: str | None = None) -> None:
        """Call on app boot: interrupt orphans from a dead process, then resume."""
        with self._lock:
            if not self._started:
                self._started = True
                store.mark_orphaned_jobs_interrupted()
        if telegram_session:
            self.resume_interrupted(store, telegram_session)

    def is_worker_alive(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def active_job_id(self) -> int | None:
        return self._active_job_id

    def request_cancel(self) -> None:
        self._stop.set()

    def start_broadcast(
        self,
        store: Storage,
        message: str,
        delay_seconds: float,
        max_slowmode_wait: int,
        include_discord: bool,
        telegram_session: str,
    ) -> int:
        with self._lock:
            if self.is_worker_alive():
                raise RuntimeError("A broadcast is already running")
            active = store.get_active_job()
            if active:
                raise RuntimeError(f"Job #{active.id} is already {active.status}")

            job_id = store.create_job(
                message=message,
                delay_seconds=delay_seconds,
                max_slowmode_wait=max_slowmode_wait,
                include_discord=include_discord,
            )
            self._stop.clear()
            self._active_job_id = job_id
            self._thread = threading.Thread(
                target=self._run_job,
                args=(job_id, telegram_session),
                name=f"broadcast-job-{job_id}",
                daemon=True,
            )
            self._thread.start()
            return job_id

    def resume_interrupted(self, store: Storage, telegram_session: str | None = None) -> int | None:
        with self._lock:
            if self.is_worker_alive():
                return self._active_job_id
            jobs = store.list_resumable_jobs()
            # Prefer interrupted with remaining work, else queued
            candidate = None
            for job in reversed(jobs):
                if job.status == "interrupted" and (job.pending or job.done == 0):
                    candidate = job
                    break
            if candidate is None:
                for job in reversed(jobs):
                    if job.status == "queued":
                        candidate = job
                        break
            if candidate is None:
                return None

            session = telegram_session
            if not session:
                session = get_settings().telegram_session
            if not session:
                store.update_job(
                    candidate.id,
                    status="interrupted",
                    current_detail="Waiting for TELEGRAM_SESSION to resume",
                )
                return None

            store.update_job(
                candidate.id,
                status="queued",
                current_detail="Resuming…",
                error="",
            )
            self._stop.clear()
            self._active_job_id = candidate.id
            self._thread = threading.Thread(
                target=self._run_job,
                args=(candidate.id, session),
                name=f"broadcast-job-{candidate.id}",
                daemon=True,
            )
            self._thread.start()
            return candidate.id

    def _run_job(self, job_id: int, telegram_session: str) -> None:
        settings = get_settings()
        store = Storage(settings.db_path)
        tg = TelegramService(
            settings.telegram_api_id,
            settings.telegram_api_hash,
            telegram_session or settings.telegram_session,
        )
        dc = DiscordService(settings.discord_bot_token)

        try:
            store.update_job(
                job_id,
                status="running",
                current_name="",
                current_detail="Loading Telegram groups…",
            )
            job = store.get_job(job_id)
            if not job:
                return

            pending = list(job.pending or [])
            if not pending:
                skips = set(store.get_telegram_skips().keys())
                targets = asyncio.run(tg.list_groups(skip_ids=skips))
                pending = []
                for t in targets:
                    if t.stars_required > 0:
                        self._record(
                            store,
                            job_id,
                            "telegram",
                            t.id,
                            t.name,
                            "skipped_stars",
                            f"requires {t.stars_required} Stars — auto-skipped",
                        )
                    else:
                        pending.append({"id": t.id, "name": t.name})

                store.update_job(
                    job_id,
                    pending=pending,
                    total=len(pending),
                    done=0,
                    current_detail=f"Loaded {len(pending)} groups",
                )

            job = store.get_job(job_id)
            assert job is not None
            delay = float(job.delay_seconds)
            max_slow = int(job.max_slowmode_wait)
            message = job.message

            while True:
                if self._stop.is_set():
                    store.update_job(
                        job_id,
                        status="cancelled",
                        current_detail="Cancelled by user",
                    )
                    return

                job = store.get_job(job_id)
                if not job:
                    return
                pending = list(job.pending or [])
                if not pending:
                    break

                target = pending[0]
                remaining = pending[1:]
                name = target.get("name") or target.get("id")
                store.update_job(
                    job_id,
                    current_name=str(name),
                    current_detail=(
                        f"Sending ({job.done + 1}/{job.total or (len(pending) + job.done)})…"
                    ),
                )

                try:
                    result = asyncio.run(
                        tg.send_to_group(
                            message,
                            str(target["id"]),
                            str(name),
                            max_slowmode_wait=max_slow,
                            verify_seconds=1.5,
                        )
                    )
                except Exception as exc:
                    from forwarder.telegram_service import SendResult

                    result = SendResult(
                        str(target["id"]),
                        str(name),
                        "error",
                        str(exc)[:300],
                    )

                self._record(
                    store,
                    job_id,
                    "telegram",
                    result.target_id,
                    result.target_name,
                    result.status,
                    result.detail,
                )
                job = store.get_job(job_id)
                done = (job.done if job else 0) + 1
                total = job.total if job and job.total else done + len(remaining)
                store.update_job(
                    job_id,
                    done=done,
                    total=total,
                    pending=remaining,
                    current_detail=f"{result.status}: {result.detail}"[:240],
                )

                if remaining and delay > 0 and not self._stop.is_set():
                    end = time.time() + delay
                    while time.time() < end:
                        if self._stop.is_set():
                            store.update_job(
                                job_id,
                                status="cancelled",
                                current_detail="Cancelled by user",
                            )
                            return
                        time.sleep(min(0.5, max(0.0, end - time.time())))

            # Optional Discord after Telegram
            job = store.get_job(job_id)
            if job and job.include_discord and not self._stop.is_set():
                store.update_job(
                    job_id,
                    current_name="Discord",
                    current_detail="Sending Discord channels…",
                )
                channels = store.get_selected_targets().get("discord", [])
                if channels and dc.configured():
                    try:
                        results = asyncio.run(
                            dc.broadcast(
                                message,
                                channels,
                                delay,
                                max(len(channels), 1),
                                None,
                            )
                        )
                        for r in results:
                            self._record(
                                store,
                                job_id,
                                "discord",
                                r.target_id,
                                r.target_name,
                                r.status,
                                r.detail,
                            )
                    except Exception as exc:
                        store.update_job(job_id, error=f"Discord error: {exc}"[:300])

            job = store.get_job(job_id)
            results = store.list_job_results(job_id)
            summary = {
                "ok": sum(1 for r in results if r.status == "ok"),
                "auto_deleted": sum(1 for r in results if r.status == "auto_deleted"),
                "skipped_stars": sum(1 for r in results if r.status == "skipped_stars"),
                "other_skips": sum(
                    1
                    for r in results
                    if r.status.startswith("skipped") and r.status != "skipped_stars"
                ),
                "errors": sum(1 for r in results if r.status == "error"),
                "total_results": len(results),
            }
            store.update_job(
                job_id,
                status="completed",
                current_name="",
                current_detail="Broadcast finished",
                pending=[],
                summary=summary,
            )
        except Exception as exc:
            log.exception("Job %s failed", job_id)
            store.update_job(
                job_id,
                status="failed",
                error=str(exc)[:500],
                current_detail=f"Failed: {exc}"[:240],
            )
        finally:
            with self._lock:
                if self._active_job_id == job_id:
                    self._active_job_id = None

    def _record(
        self,
        store: Storage,
        job_id: int,
        platform: str,
        target_id: str,
        target_name: str,
        status: str,
        detail: str,
    ) -> None:
        store.add_job_result(job_id, platform, target_id, target_name, status, detail)
        store.add_send_log(platform, target_id, target_name, status, detail)
        if status == "auto_deleted":
            store.add_telegram_skip(target_id, target_name, "auto_deleted", detail)
        elif status == "skipped_stars":
            store.add_telegram_skip(target_id, target_name, "stars_required", detail)
        elif status in {"skipped_forbidden", "skipped_banned", "skipped_private"}:
            store.add_telegram_skip(target_id, target_name, status, detail)


_RUNNER = JobRunner()


def get_job_runner() -> JobRunner:
    return _RUNNER
