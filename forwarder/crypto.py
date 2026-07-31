"""Encrypt Telegram session strings at rest. Sessions grant full account
access, so they must never be stored in the database as plaintext."""

from __future__ import annotations

from functools import lru_cache

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
