from __future__ import annotations

import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status

from forwarder.auth import hash_password
from forwarder.storage import Storage, UserRow

from backend import schemas
from backend.converters import profile_out
from backend.deps import get_store, require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


def _gen_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.get("/users", response_model=list[schemas.AdminUserOut])
def list_users(_: UserRow = Depends(require_admin), store: Storage = Depends(get_store)):
    out = []
    for u in store.list_users():
        profiles = store.list_profiles_for_user(u.id)
        out.append(
            schemas.AdminUserOut(
                id=u.id,
                email=u.email,
                role=u.role,
                is_active=u.is_active,
                created_at=u.created_at,
                profile_count=len(profiles),
            )
        )
    return out


@router.post("/users", response_model=schemas.AdminCreateUserResponse)
def create_user(
    body: schemas.AdminCreateUserRequest,
    _: UserRow = Depends(require_admin),
    store: Storage = Depends(get_store),
):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is required.")
    if store.get_user_by_email(email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A user with that email already exists.")
    temp_password = (body.password or "").strip() or _gen_password()
    if len(temp_password) < 8:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Temporary password must be at least 8 characters."
        )
    user_id = store.create_user(
        email=email,
        password_hash=hash_password(temp_password),
        role=body.role,
        must_change_password=True,
    )
    return schemas.AdminCreateUserResponse(user_id=user_id, temp_password=temp_password)


@router.patch("/users/{user_id}/active")
def set_active(
    user_id: int,
    body: schemas.AdminSetActiveRequest,
    _: UserRow = Depends(require_admin),
    store: Storage = Depends(get_store),
):
    store.set_user_active(user_id, body.active)
    return {"ok": True}


@router.post("/users/{user_id}/reset-password", response_model=schemas.AdminResetPasswordResponse)
def reset_password(
    user_id: int, _: UserRow = Depends(require_admin), store: Storage = Depends(get_store)
):
    temp_password = _gen_password()
    store.set_user_password(user_id, hash_password(temp_password), must_change_password=True)
    return schemas.AdminResetPasswordResponse(temp_password=temp_password)


@router.get("/users/{user_id}/profiles", response_model=list[schemas.ProfileOut])
def user_profiles(
    user_id: int, _: UserRow = Depends(require_admin), store: Storage = Depends(get_store)
):
    return [profile_out(p) for p in store.list_profiles_for_user(user_id)]


@router.get("/users/{user_id}/stats", response_model=schemas.AdminUserStatsOut)
def user_stats(
    user_id: int, _: UserRow = Depends(require_admin), store: Storage = Depends(get_store)
):
    s = store.get_user_stats(user_id)
    return schemas.AdminUserStatsOut(
        total_sent=s.total_sent,
        total_errors=s.total_errors,
        total_attempts=s.total_attempts,
        last_activity=s.last_activity,
        profiles=[schemas.AdminUserProfileStatsOut(**p) for p in s.profiles],
    )
