from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from forwarder.auth import (
    authenticate,
    generate_backup_codes,
    generate_totp_secret,
    hash_backup_codes,
    hash_password,
    normalize_backup_code,
    totp_provisioning_uri,
    verify_totp_code,
)
from forwarder.storage import Storage, UserRow

from backend import schemas
from backend.deps import get_current_user, get_store
from backend.security import create_pre_auth_token, create_token, decode_pre_auth_token
from backend.totp_qr import qr_data_uri

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _decode_pre_auth_or_401(token: str) -> int:
    try:
        return decode_pre_auth_token(token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This step expired — log in again.")


def _finish_login(
    store: Storage, user: UserRow, ip: str | None
) -> schemas.TotpSetupConfirmResponse:
    session_id = store.rotate_session(user.id, login_ip=ip)
    return schemas.TotpSetupConfirmResponse(
        token=create_token(user.id, session_id),
        user_id=user.id,
        email=user.email,
        role=user.role,
        must_change_password=user.must_change_password,
        backup_codes=[],
    )


@router.post("/login", response_model=schemas.LoginStepResponse)
def login(body: schemas.LoginRequest, store: Storage = Depends(get_store)):
    user = authenticate(store, body.email, body.password)
    if not user:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid email or password, or the account is disabled.",
        )
    pre_auth_token = create_pre_auth_token(user.id)
    if user.totp_enabled:
        return schemas.LoginStepResponse(status="totp_required", pre_auth_token=pre_auth_token)

    # No 2FA on this account yet (brand new, or an admin just reset it) --
    # every login must go through 2FA, so set up is mandatory here rather
    # than optional. The secret is held pending (not yet enabled) until
    # confirmed below.
    secret = generate_totp_secret()
    store.set_pending_totp_secret(user.id, secret)
    return schemas.LoginStepResponse(
        status="totp_setup_required",
        pre_auth_token=pre_auth_token,
        totp_secret=secret,
        totp_qr_data_uri=qr_data_uri(totp_provisioning_uri(user.email, secret)),
    )


@router.post("/login/totp", response_model=schemas.TotpSetupConfirmResponse)
def login_totp(
    body: schemas.TotpVerifyRequest, request: Request, store: Storage = Depends(get_store)
):
    user_id = _decode_pre_auth_or_401(body.pre_auth_token)
    user = store.get_user_by_id(user_id)
    if not user or not user.is_active or not user.totp_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This step expired — log in again.")

    secret = store.get_totp_secret(user.id)
    ok = bool(secret) and verify_totp_code(secret, body.code)
    if not ok:
        ok = store.consume_backup_code(user.id, normalize_backup_code(body.code))
    if not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect code.")

    return _finish_login(store, user, _client_ip(request))


@router.post("/totp/setup/confirm", response_model=schemas.TotpSetupConfirmResponse)
def totp_setup_confirm(
    body: schemas.TotpSetupConfirmRequest, request: Request, store: Storage = Depends(get_store)
):
    user_id = _decode_pre_auth_or_401(body.pre_auth_token)
    user = store.get_user_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This step expired — log in again.")

    secret = store.get_totp_secret(user.id)
    if not secret or not verify_totp_code(secret, body.code):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Incorrect code — use the current 6-digit code from your authenticator app.",
        )

    store.enable_totp(user.id)
    codes = generate_backup_codes()
    store.replace_backup_codes(user.id, hash_backup_codes(codes))

    result = _finish_login(store, user, _client_ip(request))
    result.backup_codes = codes
    return result


@router.post("/totp/backup-codes/regenerate", response_model=schemas.RegenerateBackupCodesResponse)
def regenerate_backup_codes(
    user: UserRow = Depends(get_current_user), store: Storage = Depends(get_store)
):
    if not user.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2FA is not set up on this account yet.")
    codes = generate_backup_codes()
    store.replace_backup_codes(user.id, hash_backup_codes(codes))
    return schemas.RegenerateBackupCodesResponse(backup_codes=codes)


@router.post("/logout")
def logout(user: UserRow = Depends(get_current_user), store: Storage = Depends(get_store)):
    """Explicit sign-out: the token the caller was holding stops working
    immediately, rather than staying valid until its (long) expiry."""
    store.clear_session(user.id)
    return {"ok": True}


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
