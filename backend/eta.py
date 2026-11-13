"""Live figures for a job that is still sending: when it will finish, and
how its sends have gone so far.

Both only change when another group finishes, so they are read once per
finished group and shared by every poll (and every open tab) until the next
one -- a status poll costs no extra query most of the time.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone

from forwarder.eta import WINDOW, Eta, estimate
from forwarder.storage import JobRow, Storage

_LOCK = threading.Lock()
# job id -> (job.done when read, result times newest first, results per status)
_LIVE: dict[int, tuple[int, list[datetime], dict[str, int]]] = {}
_MAX_JOBS = 512


@dataclass(frozen=True)
class LiveFigures:
    eta: Eta | None
    #: Same shape as the summary a finished job stores, so the UI reads one
    #: thing whether the job is running or done.
    summary: dict[str, int]


def summarize(counts: dict[str, int]) -> dict[str, int]:
    """Results per status -> the tallies shown to the user. Mirrors what
    job_runner stores as a job's summary when it completes."""
    return {
        "ok": counts.get("ok", 0),
        "auto_deleted": counts.get("auto_deleted", 0),
        "skipped_stars": counts.get("skipped_stars", 0),
        "other_skips": sum(
            n for status, n in counts.items() if status.startswith("skipped") and status != "skipped_stars"
        ),
        "errors": counts.get("error", 0),
        "total_results": sum(counts.values()),
    }


def parse_time(value: str | None) -> datetime | None:
    """Job rows carry timestamps as str(datetime)."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def started_at(job: JobRow) -> datetime | None:
    """When the job began running: its creation, or its scheduled time for
    one that was queued up in advance."""
    created = parse_time(job.created_at)
    scheduled = parse_time(job.scheduled_at)
    if created and scheduled:
        return max(created, scheduled)
    return created


def elapsed_seconds(job: JobRow, now: datetime | None = None) -> float | None:
    """How long the job has been running, or ran for once it is over."""
    if job.status == "scheduled":
        return None
    start = started_at(job)
    if not start:
        return None
    if job.status in ("queued", "running"):
        end = now or datetime.now(timezone.utc)
    else:
        end = parse_time(job.updated_at)
    if not end:
        return None
    return max((end - start).total_seconds(), 0.0)


def live_figures(job: JobRow, store: Storage) -> LiveFigures | None:
    """None unless the job is sending right now."""
    if job.status != "running" or job.total <= 0:
        return None

    with _LOCK:
        cached = _LIVE.get(job.id)
    if cached and cached[0] == job.done:
        _, times, counts = cached
    else:
        times = store.list_recent_result_times(job.id, WINDOW + 1) if job.done else []
        counts = store.count_job_results(job.id)
        with _LOCK:
            if len(_LIVE) >= _MAX_JOBS:
                _LIVE.clear()
            _LIVE[job.id] = (job.done, times, counts)

    eta = estimate(
        now=datetime.now(timezone.utc),
        total=job.total,
        done=job.done,
        delay_seconds=job.delay_seconds,
        max_slowmode_wait=job.max_slowmode_wait,
        result_times=times,
        sending_since=parse_time(job.updated_at),
    )
    return LiveFigures(eta=eta, summary=summarize(counts))
