from __future__ import annotations

import time

import jwt

from backend.config import JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_SECRET


def create_token(user_id: int) -> str:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set")
    payload = {"sub": str(user_id), "exp": int(time.time()) + JWT_EXPIRE_HOURS * 3600}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> int:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set")
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    return int(payload["sub"])
