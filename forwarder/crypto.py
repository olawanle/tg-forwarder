"""Encrypt Telegram session strings at rest. Sessions grant full account
access, so they must never be stored in the database as plaintext."""

from __future__ import annotations

from functools import lru_cache

import bcrypt
from cryptography.fernet import Fernet

from forwarder.config import get_settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = get_settings().session_encryption_key
    if not key:
        raise RuntimeError(
            "SESSION_ENCRYPTION_KEY is not set. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\"` and set it as an env var "
            "before storing any Telegram session."
        )
    return Fernet(key.encode())


def encrypt(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode())


def decrypt(ciphertext: bytes) -> str:
    return _fernet().decrypt(bytes(ciphertext)).decode()


# Password/code hashing lives here (rather than forwarder.auth) so that
# forwarder.storage -- which forwarder.auth itself imports -- can also use
# verify_password (for backup-code checks) without a circular import.


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False
