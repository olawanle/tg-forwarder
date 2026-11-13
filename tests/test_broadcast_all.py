""""Broadcast all profiles" must reuse each profile's own previous settings
and skip, not fail, the profiles that can't go.

Needs a real Postgres:  TEST_DATABASE_URL=postgresql://... python -m unittest discover -s tests
"""
from __future__ import annotations

import os
import unittest
import uuid
from unittest import mock

from cryptography.fernet import Fernet

os.environ.setdefault("SESSION_ENCRYPTION_KEY", Fernet.generate_key().decode())

from backend import broadcast_all  # noqa: E402
from forwarder.storage import Storage  # noqa: E402

DSN = os.getenv("TEST_DATABASE_URL", "")


class _Runner:
    def __init__(self) -> None:
        self.started: list[dict] = []

    def is_worker_alive(self, profile_id: int) -> bool:
        return False

    def start_broadcast(self, **kwargs) -> int:
        self.started.append(kwargs)
        return 1000 + len(self.started)


@unittest.skipUnless(DSN, "TEST_DATABASE_URL not set")
class BroadcastAllTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Storage(DSN)
        uid = self.store.create_user(f"{uuid.uuid4().hex}@example.test", "x", "user", False)
        self.user = self.store.get_user_by_id(uid)
        s = self.store
        # Sent before: text draft with two variants, last run at 7s with Discord.
        self.texty = s.create_profile(uid, "Texty", "sess-a")
        s.set_draft_messages(self.texty, ["hello", "hi there"])
        j = s.create_job(self.texty, "hello", 7.0, 600, True)
        s.update_job(j, status="completed")
        # A later broadcast scheduled for the future is not "previous settings".
        s.create_job(self.texty, "future", 30.0, 60, False, scheduled_at="2099-01-01T00:00:00+00:00", status="scheduled")
        # Saved-message draft, never broadcast: account default delay.
        self.saved = s.create_profile(uid, "Saved", "sess-b")
        s.set_draft_saved_messages(self.saved, [11, 12])
        # Running right now.
        self.busy = s.create_profile(uid, "Busy", "sess-c")
        s.set_draft_messages(self.busy, ["x"])
        j = s.create_job(self.busy, "x", 3.0, 300, False)
        s.update_job(j, status="running")
        # No session.
        self.nosess = s.create_profile(uid, "NoSession", "")
        s.set_draft_messages(self.nosess, ["x"])
        # Nothing drafted and never sent.
        self.empty = s.create_profile(uid, "Empty", "sess-d")
        # No draft, but a previous broadcast to fall back on.
        self.fallback = s.create_profile(uid, "Fallback", "sess-e")
        j = s.create_job(self.fallback, "from last time", 4.0, 300, False)
        s.update_job(j, status="cancelled")

        self.runner = _Runner()
        patcher = mock.patch.object(broadcast_all, "get_job_runner", return_value=self.runner)
        patcher.start()
        self.addCleanup(patcher.stop)

    def plans(self) -> dict[int, broadcast_all.ProfilePlan]:
        return {p.profile_id: p for p in broadcast_all.plan_account(self.user, self.store)}

    def test_each_profile_gets_its_own_previous_settings(self) -> None:
        plans = self.plans()
        t = plans[self.texty]
        self.assertTrue(t.ready)
        self.assertEqual((t.mode, t.messages, t.delay_seconds, t.max_slowmode_wait, t.include_discord), ("text", ["hello", "hi there"], 7.0, 600, True))
        self.assertTrue(t.from_last_broadcast)

        s = plans[self.saved]
        self.assertTrue(s.ready)
        self.assertEqual((s.mode, s.source_message_ids), ("saved", [11, 12]))
        self.assertFalse(s.from_last_broadcast)
        self.assertEqual(s.delay_seconds, broadcast_all.default_delay_for(self.user, self.store))

        f = plans[self.fallback]
        self.assertTrue(f.ready)
        self.assertEqual((f.messages, f.delay_seconds), (["from last time"], 4.0))

    def test_profiles_that_cannot_go_are_skipped_with_a_reason(self) -> None:
        plans = self.plans()
        self.assertIn("Already broadcasting", plans[self.busy].reason)
        self.assertIn("No Telegram session", plans[self.nosess].reason)
        self.assertIn("Nothing to send", plans[self.empty].reason)
        for pid in (self.busy, self.nosess, self.empty):
            self.assertFalse(plans[pid].ready)

    def test_start_passes_the_same_arguments_a_compose_start_would(self) -> None:
        profiles = {p.id: p for p in self.store.list_profiles_for_user(self.user.id)}
        plans = self.plans()
        broadcast_all.start_plan(plans[self.texty], profiles[self.texty], self.store)
        broadcast_all.start_plan(plans[self.saved], profiles[self.saved], self.store)
        text_call, saved_call = self.runner.started
        self.assertEqual(text_call["message"], "hello")
        self.assertEqual(text_call["messages"], ["hello", "hi there"])
        self.assertIsNone(text_call["source_message_id"])
        self.assertEqual((text_call["delay_seconds"], text_call["include_discord"]), (7.0, True))
        self.assertEqual(saved_call["source_message_id"], 11)
        self.assertEqual(saved_call["source_message_ids"], [11, 12])
        self.assertIsNone(saved_call["messages"])

    def test_public_view_has_no_message_bodies(self) -> None:
        out = self.plans()[self.texty].public()
        self.assertEqual(out["variants"], 2)
        self.assertNotIn("messages", out)


if __name__ == "__main__":
    unittest.main()
