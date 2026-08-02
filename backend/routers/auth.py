from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from forwarder.auth import authenticate, hash_password
from forwarder.storage import Storage, UserRow

from backend import schemas
from backend.deps import get_current_user, get_store
from backend.security import create_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.LoginResponse)
def login(body: schemas.LoginRequest, store: Storage = Depends(get_store)):
    user = authenticate(store, body.email, body.password)
    if not user:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid email or password, or the account is disabled.",
        )
    return schemas.LoginResponse(
        token=create_token(user.id),
        user_id=user.id,
        email=user.email,
        role=user.role,
        must_change_password=user.must_change_password,
    )


@router.post("/change-password")
def change_password(
    body: schemas.ChangePasswordRequest,
    user: UserRow = Depends(get_current_user),
    store: Storage = Depends(get_store),
):
    if len(body.new_password) < 8:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Password must be at least 8 characters."
        )
    store.set_user_password(
        user.id, hash_password(body.new_password), must_change_password=False
    )
    return {"ok": True}
