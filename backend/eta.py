"""Live estimate for the job endpoints.

The timings an estimate is built from only change when another group
finishes, so they are read once per finished group and shared by every poll
(and every open tab) until the next one -- a status poll costs no extra
query most of the time.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from forwarder.eta import WINDOW, Eta, estimate
from forwarder.storage import JobRow, Storage

_LOCK = threading.Lock()
# job id -> (job.done when read, result times newest first)
_TIMES: dict[int, tuple[int, list[datetime]]] = {}
_MAX_JOBS = 512


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


def eta_for(job: JobRow, store: Storage) -> Eta | None:
    if job.status != "running" or job.total <= 0 or job.done >= job.total:
        return None

    with _LOCK:
        cached = _TIMES.get(job.id)
    if cached and cached[0] == job.done:
        times = cached[1]
    else:
        times = store.list_recent_result_times(job.id, WINDOW + 1) if job.done else []
        with _LOCK:
            if len(_TIMES) >= _MAX_JOBS:
                _TIMES.clear()
            _TIMES[job.id] = (job.done, times)

    return estimate(
        now=datetime.now(timezone.utc),
        total=job.total,
        done=job.done,
        delay_seconds=job.delay_seconds,
        max_slowmode_wait=job.max_slowmode_wait,
        result_times=times,
        sending_since=parse_time(job.updated_at),
    )
