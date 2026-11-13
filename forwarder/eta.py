"""How much longer a running broadcast has to go, worked out from how long
its groups have really been taking rather than from the configured delay.

The configured delay is only the floor. What a group actually costs also
includes the send itself, the check that the post survived, slowmode and
flood waits that get sat out, and the extra back-off after errors -- and
that mix differs per account and per hour. So the pace is measured: the
average gap between this job's own most recent results.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from statistics import median
from typing import Sequence

# What one group costs on top of the configured delay when nothing goes
# wrong: the send, the 1.5 s wait before checking the post survived, and the
# check. Only matters until the job has timings of its own.
SEND_OVERHEAD_SECONDS = 2.0
# The pace is the average over this many of the job's latest groups: long
# enough that one slowmode wait doesn't swing it, short enough to follow a
# job that Telegram has started throttling.
WINDOW = 120
# How many groups' worth of the configured pace is mixed in, so the first
# few results don't produce a wild number.
PRIOR_WEIGHT = 4.0
# Below this many measured gaps the estimate is still mostly the configured
# pace, and is reported as such.
MEASURED_AFTER = 8


@dataclass(frozen=True)
class Eta:
    seconds_left: float
    pace_seconds: float
    #: False while the estimate still leans on the configured delay.
    measured: bool
    #: The group being sent right now has taken longer than a normal one
    #: (a slowmode or flood wait, usually). The estimate stops shrinking
    #: until it is through, instead of counting down to a time it will miss.
    holding: bool


def estimate(
    *,
    now: datetime,
    total: int,
    done: int,
    delay_seconds: float,
    max_slowmode_wait: int,
    result_times: Sequence[datetime],
    sending_since: datetime | None = None,
) -> Eta | None:
    """``result_times`` is when this job's latest results were recorded,
    newest first. ``sending_since`` is when the group currently in flight
    was started, used only before the first result exists."""
    remaining = total - done
    if total <= 0 or remaining <= 0:
        return None

    configured = max(float(delay_seconds), 0.0) + SEND_OVERHEAD_SECONDS

    # `done` counts groups the send loop has been through. Results recorded
    # before the loop started (Stars-paywalled groups skipped while loading)
    # all carry the same timestamp and are older than any of those, so
    # keeping the newest `done` leaves them out.
    times = list(result_times[: min(done, WINDOW + 1)])
    gaps = [(newer - older).total_seconds() for newer, older in zip(times, times[1:])]
    gaps = [g for g in gaps if g >= 0]
    if gaps:
        # No single group can take longer than its slowmode wait plus the
        # pause before it. A longer gap is the job having been stopped and
        # resumed (a deploy, a lost session) -- downtime, not pace.
        longest_real_gap = max_slowmode_wait + max(float(delay_seconds), 60.0) + 120.0
        typical = median(gaps)
        gaps = [g if g <= longest_real_gap else typical for g in gaps]

    pace = (PRIOR_WEIGHT * configured + sum(gaps)) / (PRIOR_WEIGHT + len(gaps))

    in_flight_since = times[0] if times else sending_since
    in_flight_for = max((now - in_flight_since).total_seconds(), 0.0) if in_flight_since else 0.0
    holding = in_flight_for > max(2.0 * pace, pace + 10.0)

    seconds_left = max(pace - in_flight_for, 0.0) + (remaining - 1) * pace
    return Eta(
        seconds_left=seconds_left,
        pace_seconds=pace,
        measured=len(gaps) >= MEASURED_AFTER,
        holding=holding,
    )
