"""QR login must hand a two-step-password account over to the password
step, refresh expired codes, and always disconnect its client.

Run with:  python -m unittest discover -s tests
"""
from __future__ import annotations

import asyncio
import datetime
import os
import time
import unittest

from cryptography.fernet import Fernet

os.environ.setdefault("SESSION_ENCRYPTION_KEY", Fernet.generate_key().decode())

from telethon.errors import SessionPasswordNeededError  # noqa: E402

from backend import qr_login  # noqa: E402


class FakeQr:
    def __init__(self, outcomes) -> None:
        self.outcomes = list(outcomes)
        self.recreated = 0
        self.url = "tg://login?token=abc"
        self.expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=30)

    async def wait(self, timeout=None):
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    async def recreate(self):
        self.recreated += 1
        self.url = f"tg://login?token=new{self.recreated}"


class FakeClient:
    def __init__(self) -> None:
        self.disconnected = False

        class _S:
            def save(self_inner):
                return "SESSION"

        self.session = _S()

    async def disconnect(self):
        self.disconnected = True


def state():
    return {"user_id": 1, "label": "p", "reconnect_profile_id": None, "created": time.time(), "status": "waiting"}


class QrLoginTest(unittest.TestCase):
    def test_two_step_password_is_handed_over_with_the_session(self) -> None:
        s, client = state(), FakeClient()
        asyncio.run(qr_login._run(s, client, FakeQr([asyncio.TimeoutError(), SessionPasswordNeededError(request=None)])))
        self.assertEqual((s["status"], s["session"]), ("password", "SESSION"))
        self.assertTrue(client.disconnected)
        self.assertIn("new1", s["qr_url"])  # the expired code was replaced on screen

    def test_failures_become_a_message_and_still_disconnect(self) -> None:
        s, client = state(), FakeClient()
        asyncio.run(qr_login._run(s, client, FakeQr([RuntimeError("boom")])))
        self.assertEqual(s["status"], "error")
        self.assertIn("boom", s["error"])
        self.assertTrue(client.disconnected)

    def test_gives_up_after_its_lifetime(self) -> None:
        s, client = state(), FakeClient()
        s["created"] = time.time() - qr_login.LIFETIME - 1
        asyncio.run(qr_login._run(s, client, FakeQr([])))
        self.assertEqual(s["status"], "expired")
        self.assertTrue(client.disconnected)

    def test_public_view_hides_the_code_once_not_waiting(self) -> None:
        s = state()
        s.update(status="done", qr_url="tg://x", qr_image="data:", profile_id=9)
        self.assertEqual(qr_login.public(s), {"status": "done", "qr_image": None, "qr_url": None, "profile_id": 9, "error": None, "share_key": None})

    def test_share_link_shows_only_the_qr_and_dies_with_the_attempt(self) -> None:
        s = state()
        s.update(qr_image="data:img", qr_url="tg://x", qr_expires=time.time() + 20, share_key="k1", session="SECRET")
        qr_login.QR_STORE["tok"] = s
        qr_login.SHARED["k1"] = "tok"
        try:
            out = qr_login.shared("k1")
            self.assertEqual(set(out), {"status", "qr_image", "expires_in"})
            self.assertEqual((out["status"], out["qr_image"]), ("waiting", "data:img"))
            self.assertIsNone(qr_login.shared("nope"))
            s["status"] = "password"  # account details must not leak once it moves on
            self.assertEqual(qr_login.shared("k1"), {"status": "closed", "qr_image": None, "expires_in": None})
        finally:
            qr_login.stop("tok")
        self.assertIsNone(qr_login.shared("k1"))
        self.assertNotIn("k1", qr_login.SHARED)


if __name__ == "__main__":
    unittest.main()
