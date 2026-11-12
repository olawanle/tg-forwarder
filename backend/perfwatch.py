"""Flight recorder for the two ways this service has gone slow: something
blocking the event loop, or background threads starving it of the GIL.

Logs one health line a minute, and when the loop stops being scheduled for
a second or more, dumps what every thread is executing at that moment --
taken from a separate thread, so it captures the stall while it is still
happening rather than after the fact.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import threading
import time
import traceback

from forwarder.job_runner import get_job_runner
from forwarder.storage import pool_stats

log = logging.getLogger("forwarder.perf")
if not log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False

TICK_SECONDS = 0.25
REPORT_SECONDS = 60.0
STALL_SECONDS = 1.0
STALL_DUMP_MIN_GAP_SECONDS = 30.0

_last_beat = time.monotonic()


def _rss_mb() -> int:
    try:
        with open("/proc/self/statm") as fh:
            return int(fh.read().split()[1]) * os.sysconf("SC_PAGE_SIZE") // 1_000_000
    except (OSError, ValueError, IndexError):
        return 0


# Top-of-stack functions of a thread that is merely parked, not running.
_PARKED = {"wait", "select", "poll", "get", "acquire", "accept", "sleep", "_worker"}
MAX_DUMPED_THREADS = 12


def _thread_dump() -> str:
    """The event-loop thread always; of the rest, only threads caught doing
    something, so a stall report stays readable with dozens of idle workers."""
    names = {t.ident: t.name for t in threading.enumerate()}
    main = threading.main_thread().ident
    me = threading.get_ident()
    parts = []
    for ident, frame in sys._current_frames().items():
        if ident == me:
            continue
        if ident != main and frame.f_code.co_name in _PARKED:
            continue
        if len(parts) >= MAX_DUMPED_THREADS:
            parts.append("--- (more busy threads omitted)\n")
            break
        stack = "".join(traceback.format_stack(frame, limit=5))
        parts.append(f"--- {names.get(ident, ident)}\n{stack}")
    return "".join(parts)


def _stall_watchdog() -> None:
    last_dump = 0.0
    while True:
        time.sleep(STALL_SECONDS / 2)
        try:
            now = time.monotonic()
            stalled_for = now - _last_beat
            if stalled_for >= STALL_SECONDS and now - last_dump >= STALL_DUMP_MIN_GAP_SECONDS:
                last_dump = now
                log.warning(
                    "event loop not scheduled for %.1fs; threads right now:\n%s",
                    stalled_for,
                    _thread_dump(),
                )
        except Exception:
            log.exception("stall watchdog iteration failed")


async def _heartbeat() -> None:
    global _last_beat
    loop = asyncio.get_running_loop()
    worst = 0.0
    next_report = loop.time() + REPORT_SECONDS
    while True:
        before = loop.time()
        await asyncio.sleep(TICK_SECONDS)
        lag = loop.time() - before - TICK_SECONDS
        _last_beat = time.monotonic()
        worst = max(worst, lag)
        if loop.time() >= next_report:
            next_report += REPORT_SECONDS
            pools = " ".join(
                f"db_{name}={s['in_use']}/{s['idle']}/{s['opened_total']}"
                for name, s in sorted(pool_stats().items())
            )
            log.info(
                "perf loop_lag_max_ms=%d rss_mb=%d threads=%d broadcasts=%d %s (db=in_use/idle/opened)",
                worst * 1000,
                _rss_mb(),
                threading.active_count(),
                get_job_runner().active_count(),
                pools,
            )
            worst = 0.0


_task: asyncio.Task | None = None


def start() -> None:
    """Call from the running event loop at startup."""
    global _task, _last_beat
    if _task is not None:
        return
    _last_beat = time.monotonic()
    _task = asyncio.get_running_loop().create_task(_heartbeat())
    threading.Thread(target=_stall_watchdog, name="perf-stall-watchdog", daemon=True).start()
