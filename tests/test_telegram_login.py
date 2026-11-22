"""Phone login must report where Telegram actually sent the code, and
handle the answers that aren't "a code is on its way".

Run with:  python -m unittest discover -s tests
"""
from __future__ import annotations

import asyncio
import unittest

from telethon import errors
from telethon.tl import functions, types

from forwarder import telegram_login as login


def sent(kind, next_type=None, timeout=None, code_hash="h1"):
    return types.auth.SentCode(type=kind, phone_code_hash=code_hash, next_type=next_type, timeout=timeout)


class FakeClient:
    """Answers each Telegram request type with a queued response."""

    api_id = 1
    api_hash = "x"

    def __init__(self, **answers) -> None:
        self.answers = {k: list(v) for k, v in answers.items()}
        self.calls: list = []

    async def __call__(self, request):
        self.calls.append(request)
        result = self.answers[type(request).__name__].pop(0)
        if isinstance(result, BaseException):
            raise result
        return result


def run(coro):
    return asyncio.run(coro)


class DescribeTest(unittest.TestCase):
    def test_every_delivery_kind_is_named(self) -> None:
        cases = [
            (types.auth.SentCodeTypeApp(5), ("app", None)),
            (types.auth.SentCodeTypeSms(5), ("sms", None)),
            (types.auth.SentCodeTypeEmailCode("a***@gmail.com", 6), ("email", "a***@gmail.com")),
            (types.auth.SentCodeTypeSetUpEmailRequired(), ("email_setup_required", None)),
            (types.auth.SentCodeTypeFragmentSms("https://fragment.com/x", 5), ("fragment_sms", "https://fragment.com/x")),
            (types.auth.SentCodeTypeFirebaseSms(6), ("firebase_sms", None)),
            (types.auth.SentCodeTypeMissedCall("+44 20", 4), ("missed_call", "+44 20")),
        ]
        for t, (kind, hint) in cases:
            d = login.describe(sent(t))
            self.assertEqual((d.kind, d.hint), (kind, hint))

    def test_next_method_and_wait_are_reported(self) -> None:
        d = login.describe(sent(types.auth.SentCodeTypeApp(5), types.auth.CodeTypeSms(), 60))
        self.assertEqual((d.next_kind, d.timeout, d.length), ("sms", 60, 5))


class SendCodeTest(unittest.TestCase):
    def test_reports_where_the_code_went(self) -> None:
        c = FakeClient(SendCodeRequest=[sent(types.auth.SentCodeTypeApp(5), types.auth.CodeTypeSms(), 30)])
        code_hash, d = run(login.send_code(c, "+2348000000000"))
        self.assertEqual((code_hash, d.kind, d.next_kind), ("h1", "app", "sms"))

    def test_email_set_up_required_is_passed_on_not_hidden(self) -> None:
        c = FakeClient(SendCodeRequest=[sent(types.auth.SentCodeTypeSetUpEmailRequired())])
        _, d = run(login.send_code(c, "+2348000000000"))
        self.assertEqual(d.kind, "email_setup_required")

    def test_a_channel_this_app_cannot_receive_is_switched_at_once(self) -> None:
        c = FakeClient(
            SendCodeRequest=[sent(types.auth.SentCodeTypeFirebaseSms(6), types.auth.CodeTypeSms())],
            ResendCodeRequest=[sent(types.auth.SentCodeTypeSms(6), code_hash="h2")],
        )
        code_hash, d = run(login.send_code(c, "+2348000000000"))
        self.assertEqual((code_hash, d.kind), ("h2", "sms"))

    def test_paid_sms_becomes_an_explanation(self) -> None:
        paid = types.auth.SentCodePaymentRequired("p", "h1", "s@t.org", "subj", 7, "USD", 100)
        c = FakeClient(SendCodeRequest=[paid])
        with self.assertRaises(login.LoginError) as ctx:
            run(login.send_code(c, "+2348000000000"))
        self.assertIn("charges", str(ctx.exception))


class EmailSetupTest(unittest.TestCase):
    def test_set_up_then_confirm_gives_the_real_delivery(self) -> None:
        c = FakeClient(
            SendVerifyEmailCodeRequest=[types.account.SentEmailCode("a***@gmail.com", 6)],
            VerifyEmailRequest=[types.account.EmailVerifiedLogin("a@gmail.com", sent(types.auth.SentCodeTypeEmailCode("a***@gmail.com", 6), code_hash="h3"))],
        )
        d = run(login.setup_email(c, "+234", "h1", "a@gmail.com"))
        self.assertEqual((d.kind, d.hint, d.length), ("email_verify", "a***@gmail.com", 6))
        code_hash, d = run(login.confirm_email(c, "+234", "h1", "123456"))
        self.assertEqual((code_hash, d.kind), ("h3", "email"))
        purpose = c.calls[0].purpose
        self.assertIsInstance(purpose, types.EmailVerifyPurposeLoginSetup)
        self.assertEqual((purpose.phone_number, purpose.phone_code_hash), ("+234", "h1"))


class SignInTest(unittest.TestCase):
    def test_email_codes_are_sent_as_email_verification(self) -> None:
        c = FakeClient(SignInRequest=[types.auth.Authorization(user=types.UserEmpty(1))] * 2)
        self.assertFalse(run(login.sign_in(c, "+234", "h", "11111", via_email=True)))
        self.assertFalse(run(login.sign_in(c, "+234", "h", "22222", via_email=False)))
        by_email, by_phone = c.calls
        self.assertEqual((by_email.phone_code, by_email.email_verification.code), (None, "11111"))
        self.assertEqual((by_phone.phone_code, by_phone.email_verification), ("22222", None))

    def test_two_step_password_is_reported(self) -> None:
        c = FakeClient(SignInRequest=[errors.SessionPasswordNeededError(request=None)])
        self.assertTrue(run(login.sign_in(c, "+234", "h", "1", via_email=False)))


class FriendlyErrorTest(unittest.TestCase):
    def test_common_failures_read_as_instructions(self) -> None:
        self.assertIn("2 hours", login.friendly(errors.FloodWaitError(request=None, capture=7200)))
        self.assertIn("expired", login.friendly(errors.PhoneCodeExpiredError(request=None)))
        self.assertIn("isn't right", login.friendly(errors.PhoneCodeInvalidError(request=None)))
        self.assertIn("Too many code requests", login.friendly(errors.PhoneNumberFloodError(request=None)))


if __name__ == "__main__":
    unittest.main()
