"""Phone login for a new or reconnected profile, covering every way Telegram
can answer "send me a login code".

Telethon's send_code_request() assumes the answer is a code on its way to
the Telegram app or by SMS. Telegram now often answers differently: the
account must first add a login email (and no code is sent until it does),
the code goes to that email, it goes by a channel only Telegram's own apps
can receive (Firebase SMS), or SMS costs money. Treating all of those as
"check Telegram" left people waiting for a code that was never coming.

Here the raw requests are made, whatever Telegram answered is described to
the user, and the email set-up and "send it another way" steps are
available. Every call takes a connected, not-yet-authorized client using the
same session throughout: Telegram ties the code to the session that asked.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass

from telethon import TelegramClient, errors
from telethon.tl import functions, types

log = logging.getLogger("forwarder.login")
if not log.handlers:
    # Which way Telegram chose to send a code is the first thing to check
    # when someone says it never arrived, so it is logged at INFO even
    # though the app's root logger only passes warnings.
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False


class LoginError(Exception):
    """A login step failed for a reason worth showing the user as is."""


@dataclass
class Delivery:
    """Where Telegram says the login code went, in terms the UI can show."""

    #: app | sms | call | flash_call | missed_call | email | email_setup_required
    #: | fragment_sms | firebase_sms | sms_word | sms_phrase
    kind: str
    length: int | None = None
    #: email_pattern for email, url for fragment_sms, number prefix for missed_call
    hint: str | None = None
    #: What "send it another way" would switch to, if Telegram offers it.
    next_kind: str | None = None
    #: Seconds before "send it another way" may be used.
    timeout: int | None = None

    def public(self) -> dict:
        return asdict(self)


_SENT_KINDS = {
    types.auth.SentCodeTypeApp: "app",
    types.auth.SentCodeTypeSms: "sms",
    types.auth.SentCodeTypeCall: "call",
    types.auth.SentCodeTypeFlashCall: "flash_call",
    types.auth.SentCodeTypeMissedCall: "missed_call",
    types.auth.SentCodeTypeEmailCode: "email",
    types.auth.SentCodeTypeSetUpEmailRequired: "email_setup_required",
    types.auth.SentCodeTypeFragmentSms: "fragment_sms",
    types.auth.SentCodeTypeFirebaseSms: "firebase_sms",
    types.auth.SentCodeTypeSmsWord: "sms_word",
    types.auth.SentCodeTypeSmsPhrase: "sms_phrase",
}
_NEXT_KINDS = {
    types.auth.CodeTypeSms: "sms",
    types.auth.CodeTypeCall: "call",
    types.auth.CodeTypeFlashCall: "flash_call",
    types.auth.CodeTypeMissedCall: "missed_call",
    types.auth.CodeTypeFragmentSms: "fragment_sms",
}
#: Delivery kinds a third-party app can never receive: try another way at once.
_UNREACHABLE = {"firebase_sms"}


def describe(sent: types.auth.SentCode) -> Delivery:
    t = sent.type
    kind = _SENT_KINDS.get(type(t), type(t).__name__)
    hint = getattr(t, "email_pattern", None) or getattr(t, "url", None) or getattr(t, "prefix", None)
    return Delivery(
        kind=kind,
        length=getattr(t, "length", None),
        hint=hint,
        next_kind=_NEXT_KINDS.get(type(sent.next_type)) if sent.next_type else None,
        timeout=sent.timeout,
    )


def _checked(result, phone_code_hash: str | None = None) -> types.auth.SentCode:
    if isinstance(result, types.auth.SentCodePaymentRequired):
        raise LoginError(
            "Telegram charges for login codes by SMS on this number. Open the Telegram app on a phone that "
            "is already logged in to this account and try again, so the code arrives there instead."
        )
    if isinstance(result, types.auth.SentCodeSuccess):
        raise LoginError("Telegram logged this session in without a code. Start over and try again.")
    return result


def friendly(exc: BaseException) -> str:
    """Telegram's error codes in words a user can act on."""
    if isinstance(exc, LoginError):
        return str(exc)
    if isinstance(exc, errors.FloodWaitError):
        minutes = max(1, round(exc.seconds / 60))
        wait = f"{minutes} minute{'s' if minutes != 1 else ''}" if minutes < 120 else f"{round(minutes / 60)} hours"
        return f"Telegram is limiting login attempts for this number. Try again in {wait}."
    name = type(exc).__name__
    messages = {
        "PhoneNumberFloodError": "Too many code requests for this number. Telegram blocks new codes for a while (often up to a day); wait before trying again.",
        "PhoneNumberInvalidError": "That phone number isn't valid. Use the full number with country code, e.g. +234 803 555 0142.",
        "PhoneNumberBannedError": "Telegram has banned this phone number.",
        "PhoneNumberUnoccupiedError": "There's no Telegram account on this number yet. Create it in the Telegram app first.",
        "PhoneCodeInvalidError": "That code isn't right. Check it and try again.",
        "PhoneCodeExpiredError": "That code has expired, or was shared in a chat (Telegram cancels codes that get forwarded). Request a new one.",
        "PhoneCodeEmptyError": "Enter the code first.",
        "PasswordHashInvalidError": "That two-step verification password isn't right.",
        "EmailInvalidError": "That email address isn't valid.",
        "CodeInvalidError": "That email code isn't right. Check it and try again.",
        "EmailVerifyExpiredError": "That email code has expired. Request a new one.",
        "SendCodeUnavailableError": "Telegram has no other way to send the code right now. Use the last code you received, or start over later.",
        "AuthRestartError": "Telegram asked to restart the login. Start over.",
        "ApiIdPublishedFloodError": "Telegram is refusing logins from this app right now. Try again later.",
    }
    if name in messages:
        return messages[name]
    # Errors this Telethon version has no class for arrive with Telegram's
    # own code as the message.
    if getattr(exc, "message", "") == "EMAIL_NOT_ALLOWED":
        return "Telegram won't accept that email address for login. Try another."
    return f"Telegram said: {exc}"[:300]


async def send_code(client: TelegramClient, phone: str) -> tuple[str, Delivery]:
    """Ask for a login code. Returns (phone_code_hash, where it went)."""
    for attempt in range(3):
        try:
            result = await client(
                functions.auth.SendCodeRequest(phone, client.api_id, client.api_hash, types.CodeSettings())
            )
            break
        except errors.AuthRestartError:
            if attempt == 2:
                raise
    sent = _checked(result)
    delivery = describe(sent)
    log.info("login code requested: delivery=%s next=%s timeout=%s", delivery.kind, delivery.next_kind, delivery.timeout)
    if delivery.kind in _UNREACHABLE and delivery.next_kind:
        return await resend_code(client, phone, sent.phone_code_hash)
    return sent.phone_code_hash, delivery


async def resend_code(client: TelegramClient, phone: str, phone_code_hash: str) -> tuple[str, Delivery]:
    """Send the code again by Telegram's next method (SMS, call, …)."""
    sent = _checked(await client(functions.auth.ResendCodeRequest(phone, phone_code_hash)))
    delivery = describe(sent)
    log.info("login code resent: delivery=%s next=%s", delivery.kind, delivery.next_kind)
    return sent.phone_code_hash or phone_code_hash, delivery


async def setup_email(client: TelegramClient, phone: str, phone_code_hash: str, email: str) -> Delivery:
    """First half of the login-email set-up Telegram may require: it mails
    a code to `email` to confirm the address."""
    purpose = types.EmailVerifyPurposeLoginSetup(phone, phone_code_hash)
    sent = await client(functions.account.SendVerifyEmailCodeRequest(purpose, email))
    log.info("login email set-up: verification code sent")
    return Delivery(kind="email_verify", length=sent.length, hint=sent.email_pattern)


async def confirm_email(client: TelegramClient, phone: str, phone_code_hash: str, code: str) -> tuple[str, Delivery]:
    """Second half: confirm the address. Telegram then sends the actual
    login code, and says where."""
    purpose = types.EmailVerifyPurposeLoginSetup(phone, phone_code_hash)
    result = await client(functions.account.VerifyEmailRequest(purpose, types.EmailVerificationCode(code)))
    if not isinstance(result, types.account.EmailVerifiedLogin):
        raise LoginError("Telegram confirmed the email but didn't send a login code. Start over.")
    sent = _checked(result.sent_code)
    delivery = describe(sent)
    log.info("login email confirmed: delivery=%s", delivery.kind)
    return sent.phone_code_hash or phone_code_hash, delivery


async def sign_in(client: TelegramClient, phone: str, phone_code_hash: str, code: str, via_email: bool) -> bool:
    """Returns True when the account also needs its two-step password.
    A code that came by email is submitted as an email verification."""
    try:
        if via_email:
            result = await client(
                functions.auth.SignInRequest(phone, phone_code_hash, email_verification=types.EmailVerificationCode(code))
            )
        else:
            result = await client(functions.auth.SignInRequest(phone, phone_code_hash, phone_code=code))
    except errors.SessionPasswordNeededError:
        return True
    if isinstance(result, types.auth.AuthorizationSignUpRequired):
        raise LoginError("There's no Telegram account on this number yet. Create it in the Telegram app first.")
    return False
