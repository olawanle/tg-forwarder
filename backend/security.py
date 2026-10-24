from __future__ import annotations

import time

import jwt

from backend.config import (
    JWT_ALGORITHM,
    JWT_EXPIRE_HOURS,
    JWT_SECRET,
    PRE_AUTH_TOKEN_EXPIRE_SECONDS,
)


def _require_secret() -> None:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set")


def create_token(user_id: int, session_id: str) -> str:
    """The final, full-access token issued once password + 2FA both check
    out. Carries the session id that single-active-session enforcement
    checks on every request (backend.deps.get_current_user) -- a login
    anywhere else rotates it, which invalidates every token minted before
    that rotation immediately, regardless of this token's own expiry."""
    _require_secret()
    payload = {
        "sub": str(user_id),
        "sid": session_id,
        "exp": int(time.time()) + JWT_EXPIRE_HOURS * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> tuple[int, str]:
    """Returns (user_id, session_id). Raises on any invalid/expired/
    pre-2FA-migration token (missing 'sid') -- the caller's except turns
    that into a 401, same as any other invalid token."""
    _require_secret()
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    return int(payload["sub"]), str(payload["sid"])


def create_pre_auth_token(user_id: int) -> str:
    """Issued after a correct password but before 2FA is verified. Scoped
    (via the 'scope' claim) so it can never be used as a real access token
    even if leaked, and short-lived (5 min) since it's only meant to carry
    the user through the second login step."""
    _require_secret()
    payload = {
        "sub": str(user_id),
        "scope": "pre_auth",
        "exp": int(time.time()) + PRE_AUTH_TOKEN_EXPIRE_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_pre_auth_token(token: str) -> int:
    _require_secret()
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("scope") != "pre_auth":
        raise ValueError("Not a pre-auth token")
    return int(payload["sub"])
