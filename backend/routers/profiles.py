from __future__ import annotations

import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, status

from forwarder.config import get_settings
from forwarder.storage import ProfileRow, Storage, UserRow
from forwarder.telegram_service import TelegramService

from backend import schemas
from backend.converters import profile_out
from backend.deps import get_current_user, get_owned_profile, get_store
from backend.wizard import WIZARD_STORE, sweep_expired

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("", response_model=list[schemas.ProfileOut])
def list_profiles(
    user: UserRow = Depends(get_current_user), store: Storage = Depends(get_store)
):
    return [profile_out(p) for p in store.list_profiles_for_user(user.id)]


@router.post("/session", response_model=schemas.ProfileOut)
def create_profile_with_session(
    body: schemas.CreateProfileSessionRequest,
    user: UserRow = Depends(get_current_user),
    store: Storage = Depends(get_store),
):
    if not body.label.strip() or not body.session_string.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Label and session string are required."
        )
    profile_id = store.create_profile(user.id, body.label.strip(), body.session_string.strip())
    return profile_out(store.get_profile(profile_id))


@router.patch("/{profile_id}/session")
def replace_session(
    body: schemas.UpdateSessionRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    if not body.session_string.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session string is required.")
    store.update_profile_session(profile.id, body.session_string.strip())
    return {"ok": True}


# ---------------------------------------------------------- phone login wizard

@router.post("/phone/send-code", response_model=schemas.PhoneSendCodeResponse)
async def phone_send_code(
    body: schemas.PhoneSendCodeRequest,
    user: UserRow = Depends(get_current_user),
):
    sweep_expired()
    settings = get_settings()
    if not body.label.strip() or not body.phone.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Label and phone number are required."
        )
    tmp = TelegramService(settings.telegram_api_id, settings.telegram_api_hash, "")
    try:
        phone_code_hash, session = await tmp.request_code(body.phone.strip())
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)[:300])
    token = secrets.token_urlsafe(24)
    WIZARD_STORE[token] = {
        "user_id": user.id,
        "label": body.label.strip(),
        "phone": body.phone.strip(),
        "session": session,
        "phone_code_hash": phone_code_hash,
        "created": time.time(),
    }
    return schemas.PhoneSendCodeResponse(wizard_token=token)


@router.post("/phone/verify-code", response_model=schemas.PhoneVerifyCodeResponse)
async def phone_verify_code(
    body: schemas.PhoneVerifyCodeRequest,
    user: UserRow = Depends(get_current_user),
    store: Storage = Depends(get_store),
):
    settings = get_settings()
    state = WIZARD_STORE.get(body.wizard_token)
    if not state or state["user_id"] != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wizard session expired — start over.")
    tmp = TelegramService(settings.telegram_api_id, settings.telegram_api_hash, state["session"])
    try:
        needs_password, session = await tmp.submit_code(
            state["phone"], body.code.replace(" ", "").strip(), state["phone_code_hash"]
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid or expired code: {exc}"[:300])
    state["session"] = session
    if needs_password:
        return schemas.PhoneVerifyCodeResponse(needs_password=True)
    profile_id = store.create_profile(user.id, state["label"], session)
    WIZARD_STORE.pop(body.wizard_token, None)
    return schemas.PhoneVerifyCodeResponse(needs_password=False, profile_id=profile_id)


@router.post("/phone/verify-password", response_model=schemas.PhoneVerifyPasswordResponse)
async def phone_verify_password(
    body: schemas.PhoneVerifyPasswordRequest,
    user: UserRow = Depends(get_current_user),
    store: Storage = Depends(get_store),
):
    settings = get_settings()
    state = WIZARD_STORE.get(body.wizard_token)
    if not state or state["user_id"] != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wizard session expired — start over.")
    tmp = TelegramService(settings.telegram_api_id, settings.telegram_api_hash, state["session"])
    try:
        session = await tmp.submit_password(body.password)
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Incorrect password: {exc}"[:300])
    profile_id = store.create_profile(user.id, state["label"], session)
    WIZARD_STORE.pop(body.wizard_token, None)
    return schemas.PhoneVerifyPasswordResponse(profile_id=profile_id)
