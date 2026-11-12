"""Status polls must not drag the full pending-target list along.

Needs a real Postgres:  TEST_DATABASE_URL=postgresql://... python -m unittest discover -s tests
"""
from __future__ import annotations

import os
import unittest
import uuid

from cryptography.fernet import Fernet

os.environ.setdefault("SESSION_ENCRYPTION_KEY", Fernet.generate_key().decode())

from forwarder.storage import Storage  # noqa: E402

DSN = os.getenv("TEST_DATABASE_URL", "")


@unittest.skipUnless(DSN, "TEST_DATABASE_URL not set")
class JobPollingTest(unittest.TestCase):
    def test_polling_reads_omit_pending_but_nothing_else(self) -> None:
        store = Storage(DSN)
        user_id = store.create_user(f"{uuid.uuid4().hex}@example.test", "x", "user", False)
        profile_id = store.create_profile(user_id, "p", "session")
        job_id = store.create_job(profile_id, "hello", 3.0, 300, False)
        pending = [{"id": str(-1001000000000 - i), "name": f"Group {i}", "h": i + 1} for i in range(500)]
        store.update_job(job_id, status="running", pending=pending, total=500)

        full = store.get_active_job(profile_id)
        light = store.get_active_job(profile_id, include_pending=False)
        self.assertEqual(full.pending, pending)
        self.assertEqual(light.pending, [])
        for field in ("id", "status", "total", "done", "message", "delay_seconds", "created_at", "updated_at"):
            self.assertEqual(getattr(light, field), getattr(full, field), field)

        self.assertEqual(store.get_job(job_id, include_pending=False).pending, [])
        self.assertEqual(store.get_latest_job(profile_id, include_pending=False).id, job_id)
        self.assertEqual(store.get_job(job_id).pending, pending)

        store.update_job(job_id, status="completed")


if __name__ == "__main__":
    unittest.main()
