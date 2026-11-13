"""The live estimate must follow what a broadcast is actually doing.

Run with:  python -m unittest discover -s tests
(the last class needs TEST_DATABASE_URL, like the other storage tests)
"""
from __future__ import annotations

import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet

os.environ.setdefault("SESSION_ENCRYPTION_KEY", Fernet.generate_key().decode())

from backend import eta as live_eta  # noqa: E402
from forwarder.eta import MEASURED_AFTER, SEND_OVERHEAD_SECONDS, WINDOW, estimate  # noqa: E402
from forwarder.storage import JobRow, Storage  # noqa: E402

NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=timezone.utc)
DSN = os.getenv("TEST_DATABASE_URL", "")


def finished_every(seconds: float, count: int, *, last_ago: float = 0.0) -> list[datetime]:
    """`count` results, one every `seconds`, the newest `last_ago` s before NOW."""
    return [NOW - timedelta(seconds=last_ago + i * seconds) for i in range(count)]


def run(total=300, done=100, delay=3.0, max_slow=300, times=(), since=None):
    return estimate(
        now=NOW,
        total=total,
        done=done,
        delay_seconds=delay,
        max_slowmode_wait=max_slow,
        result_times=list(times),
        sending_since=since,
    )


class EstimateTest(unittest.TestCase):
    def test_nothing_to_estimate_without_a_total_or_anything_left(self) -> None:
        self.assertIsNone(run(total=0, done=0))
        self.assertIsNone(run(total=50, done=50, times=finished_every(5, 50)))

    def test_before_the_first_result_it_is_the_configured_pace_and_says_so(self) -> None:
        eta = run(total=200, done=0, delay=3.0, since=NOW - timedelta(seconds=1))
        per_group = 3.0 + SEND_OVERHEAD_SECONDS
        self.assertAlmostEqual(eta.pace_seconds, per_group)
        self.assertAlmostEqual(eta.seconds_left, (per_group - 1) + 199 * per_group)
        self.assertFalse(eta.measured)
        self.assertFalse(eta.holding)

    def test_steady_job_is_measured_from_its_own_results(self) -> None:
        eta = run(total=300, done=100, delay=3.0, times=finished_every(5.2, 100, last_ago=2.0))
        self.assertAlmostEqual(eta.pace_seconds, 5.2, delta=0.05)
        self.assertAlmostEqual(eta.seconds_left, (5.2 - 2.0) + 199 * 5.2, delta=10)
        self.assertTrue(eta.measured)

    def test_a_throttled_job_is_slower_than_its_configured_delay_says(self) -> None:
        # 3 s configured, but each group is really taking 14 s.
        eta = run(total=300, done=100, delay=3.0, times=finished_every(14.0, 100))
        self.assertGreater(eta.pace_seconds, 13.0)
        self.assertGreater(eta.seconds_left, 199 * 13.0)

    def test_slowmode_waits_that_were_sat_out_count_towards_the_pace(self) -> None:
        times, t = [], NOW
        for i in range(60):  # every tenth group waited out 200 s of slowmode
            times.append(t)
            t -= timedelta(seconds=205.0 if i % 10 == 0 else 5.0)
        eta = run(total=500, done=60, delay=3.0, max_slow=300, times=times)
        self.assertGreater(eta.pace_seconds, 20.0)

    def test_downtime_between_two_results_is_not_pace(self) -> None:
        # 40 groups at 5 s, a 40-minute stop (deploy), 40 more at 5 s.
        after = finished_every(5.0, 40)
        before = [after[-1] - timedelta(minutes=40) - timedelta(seconds=5.0 * i) for i in range(40)]
        eta = run(total=300, done=80, delay=3.0, max_slow=300, times=after + before)
        self.assertAlmostEqual(eta.pace_seconds, 5.0, delta=0.2)

    def test_results_recorded_before_sending_started_are_left_out(self) -> None:
        # 30 Stars-paywalled groups were skipped in one burst while loading,
        # two minutes before the first real send.
        sends = finished_every(5.0, 20)
        burst = [sends[-1] - timedelta(seconds=120)] * 30
        eta = run(total=300, done=20, delay=3.0, times=sends + burst)
        self.assertAlmostEqual(eta.pace_seconds, 5.0, delta=0.01)

    def test_only_the_latest_groups_set_the_pace(self) -> None:
        recent = finished_every(5.0, WINDOW + 1)
        older = [recent[-1] - timedelta(seconds=60.0 * (i + 1)) for i in range(200)]
        eta = run(total=1000, done=WINDOW + 201, delay=3.0, times=recent + older)
        self.assertAlmostEqual(eta.pace_seconds, 5.0, delta=0.05)

    def test_a_group_taking_far_longer_than_usual_holds_the_estimate(self) -> None:
        eta = run(total=300, done=100, delay=3.0, times=finished_every(5.0, 100, last_ago=90.0))
        self.assertTrue(eta.holding)
        # Not counting down past what the remaining groups need.
        self.assertAlmostEqual(eta.seconds_left, 199 * eta.pace_seconds, delta=0.01)

    def test_few_results_lean_on_the_configured_pace(self) -> None:
        # Two quick results must not promise a finish at their pace.
        eta = run(total=300, done=3, delay=10.0, times=finished_every(2.0, 3))
        self.assertGreater(eta.pace_seconds, 8.0)
        self.assertFalse(eta.measured)
        enough = run(total=300, done=MEASURED_AFTER + 1, delay=10.0, times=finished_every(12.0, MEASURED_AFTER + 1))
        self.assertTrue(enough.measured)


def job(**overrides) -> JobRow:
    base = dict(
        id=7, profile_id=1, created_at="2026-11-13 11:00:00+00:00", updated_at="2026-11-13 11:30:00+00:00",
        status="running", message="m", source_message_id=None, delay_seconds=3.0, max_slowmode_wait=300,
        include_discord=False, total=300, done=100, current_name="", current_detail="", error="",
        pending=[], summary={}, messages=[], source_message_ids=[], scheduled_at=None,
    )
    base.update(overrides)
    return JobRow(**base)


class _CountingStore:
    def __init__(self) -> None:
        self.reads = 0

    def list_recent_result_times(self, job_id: int, limit: int) -> list[datetime]:
        self.reads += 1
        now = datetime.now(timezone.utc)
        return [now - timedelta(seconds=5.0 * i) for i in range(min(limit, 100))]


class LiveEtaTest(unittest.TestCase):
    def setUp(self) -> None:
        live_eta._TIMES.clear()

    def test_only_a_sending_job_gets_an_estimate(self) -> None:
        store = _CountingStore()
        for status in ("queued", "scheduled", "interrupted", "completed", "cancelled", "failed"):
            self.assertIsNone(live_eta.eta_for(job(status=status), store), status)
        self.assertIsNone(live_eta.eta_for(job(total=0, done=0), store))  # still loading groups
        self.assertIsNone(live_eta.eta_for(job(done=300), store))  # nothing left
        self.assertEqual(store.reads, 0)

    def test_timings_are_read_once_per_finished_group_not_once_per_poll(self) -> None:
        store = _CountingStore()
        for _ in range(25):
            self.assertIsNotNone(live_eta.eta_for(job(done=100), store))
        self.assertEqual(store.reads, 1)
        live_eta.eta_for(job(done=101), store)
        self.assertEqual(store.reads, 2)

    def test_elapsed_runs_from_the_scheduled_time_and_stops_when_the_job_ends(self) -> None:
        at = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(live_eta.elapsed_seconds(job(), now=at), 3600.0)
        scheduled = job(created_at="2026-11-12 09:00:00+00:00", scheduled_at="2026-11-13 11:45:00+00:00")
        self.assertEqual(live_eta.elapsed_seconds(scheduled, now=at), 900.0)
        self.assertEqual(live_eta.elapsed_seconds(job(status="completed"), now=at), 1800.0)
        self.assertIsNone(live_eta.elapsed_seconds(job(status="scheduled"), now=at))


@unittest.skipUnless(DSN, "TEST_DATABASE_URL not set")
class ResultTimesTest(unittest.TestCase):
    def test_newest_first_telegram_only_and_limited(self) -> None:
        store = Storage(DSN)
        user_id = store.create_user(f"{uuid.uuid4().hex}@example.test", "x", "user", False)
        profile_id = store.create_profile(user_id, "p", "session")
        job_id = store.create_job(profile_id, "hello", 3.0, 300, True)
        for i in range(6):
            store.record_send_result(job_id, profile_id, "telegram", str(-100 - i), f"Group {i}", "ok", "sent")
        store.record_send_result(job_id, profile_id, "discord", "9", "general", "ok", "sent")

        times = store.list_recent_result_times(job_id, 4)
        self.assertEqual(len(times), 4)
        self.assertEqual(times, sorted(times, reverse=True))
        self.assertIsNotNone(times[0].tzinfo)
        self.assertEqual(len(store.list_recent_result_times(job_id, 50)), 6)

        store.update_job(job_id, status="running", total=10, done=6)
        live_eta._TIMES.clear()
        eta = live_eta.eta_for(store.get_active_job(profile_id, include_pending=False), store)
        self.assertIsNotNone(eta)
        self.assertGreater(eta.seconds_left, 0)
        store.update_job(job_id, status="completed")


if __name__ == "__main__":
    unittest.main()
