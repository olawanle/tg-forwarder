from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from forwarder.config import Settings, get_settings
from forwarder.storage import ProfileRow, Storage, UserRow

from backend.security import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_settings_dep() -> Settings:
    return get_settings()


def get_store(settings: Settings = Depends(get_settings_dep)) -> Storage:
    return Storage(settings.database_url)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    store: Storage = Depends(get_store),
) -> UserRow:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    try:
        user_id = decode_token(creds.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = store.get_user_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or disabled")
    return user


def require_admin(user: UserRow = Depends(get_current_user)) -> UserRow:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def get_owned_profile(
    profile_id: int,
    user: UserRow = Depends(get_current_user),
    store: Storage = Depends(get_store),
) -> ProfileRow:
    profile = store.get_profile(profile_id)
    if not profile or profile.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return profile
