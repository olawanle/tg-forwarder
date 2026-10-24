from __future__ import annotations

import secrets
import string

import pyotp

from forwarder.config import Settings
from forwarder.crypto import hash_password, verify_password  # re-exported for callers
from forwarder.storage import Storage, UserRow


def authenticate(store: Storage, email: str, password: str) -> UserRow | None:
    user = store.get_user_by_email(email.strip().lower())
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def bootstrap_admin(store: Storage, settings: Settings) -> None:
    """Idempotent: create the first admin from env vars if none exists yet.

    ADMIN_INITIAL_PASSWORD is only consumed on that first creation. If the
    account is later locked out (password lost, account deactivated), set
    ADMIN_FORCE_PASSWORD_RESET=true alongside ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD
    to reissue it on next boot, then unset it again.
    """
    if not settings.admin_email or not settings.admin_initial_password:
        return

    existing = store.get_user_by_email(settings.admin_email)
    if existing:
        if settings.admin_force_password_reset:
            store.set_user_password(
                existing.id,
                hash_password(settings.admin_initial_password),
                must_change_password=True,
            )
            if not existing.is_active:
                store.set_user_active(existing.id, True)
            # A locked-out admin needs full break-glass access back,
            # including past whatever 2FA device they've lost -- otherwise
            # this reset still leaves them stuck at a TOTP prompt they
            # can't answer. They go through setup again on next login.
            store.disable_totp(existing.id)
        return

    if store.count_admins() > 0:
        return
    store.create_user(
        email=settings.admin_email,
        password_hash=hash_password(settings.admin_initial_password),
        role="admin",
        must_change_password=True,
    )


# ------------------------------------------------------------- 2FA (TOTP)

_ISSUER = "Group Forwarder"
_BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(email: str, secret: str) -> str:
    """otpauth:// URI for the QR code -- what Google Authenticator (or any
    compatible app) actually scans."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=_ISSUER)


def verify_totp_code(secret: str, code: str) -> bool:
    code = code.strip().replace(" ", "")
    if not code:
        return False
    # valid_window=1 tolerates the previous/next 30s step for clock drift.
    return pyotp.totp.TOTP(secret).verify(code, valid_window=1)


def generate_backup_codes(count: int = 10) -> list[str]:
    """One-time recovery codes, shown once at 2FA setup. Format XXXX-XXXX
    for readability; normalize_backup_code() strips that back out before
    verification."""
    codes = []
    for _ in range(count):
        raw = "".join(secrets.choice(_BACKUP_CODE_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


def hash_backup_codes(codes: list[str]) -> list[str]:
    return [hash_password(normalize_backup_code(c)) for c in codes]


def normalize_backup_code(code: str) -> str:
    return code.strip().upper().replace("-", "").replace(" ", "")
