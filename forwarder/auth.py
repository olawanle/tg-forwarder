from __future__ import annotations

import bcrypt

from forwarder.config import Settings
from forwarder.storage import Storage, UserRow


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def authenticate(store: Storage, email: str, password: str) -> UserRow | None:
    user = store.get_user_by_email(email.strip().lower())
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def bootstrap_admin(store: Storage, settings: Settings) -> None:
    """Idempotent: create the first admin from env vars if none exists yet."""
    if store.count_admins() > 0:
        return
    if not settings.admin_email or not settings.admin_initial_password:
        return
    store.create_user(
        email=settings.admin_email,
        password_hash=hash_password(settings.admin_initial_password),
        role="admin",
        must_change_password=True,
    )
