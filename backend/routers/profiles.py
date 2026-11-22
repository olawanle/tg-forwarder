from __future__ import annotations

import logging
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from forwarder.config import get_settings
from forwarder.storage import ProfileRow, Storage, UserRow
from forwarder import telegram_login
from forwarder.telegram_service import TelegramService

from backend import schemas
from backend.converters import profile_out
from backend.deps import get_current_user, get_owned_profile, get_store
from backend import qr_login
from backend.wizard import WIZARD_STORE, sweep_expired

router = APIRouter(prefix="/profiles", tags=["profiles"])
log = logging.getLogger("forwarder.login")


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
    if body.profile_id is not None:
        existing = store.get_profile(body.profile_id)
        if not existing or existing.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
        store.update_profile_session(body.profile_id, body.session_string.strip())
        return profile_out(store.get_profile(body.profile_id))
    profile_id = store.create_profile(user.id, body.label.strip(), body.session_string.strip())
    return profile_out(store.get_profile(profile_id))


@router.delete("/{profile_id}")
def delete_profile(
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    if store.get_active_job(profile.id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This profile has a broadcast in progress — cancel it first.",
        )
    store.delete_profile(profile.id)
    return {"ok": True}


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

def _wizard(token: str, user: UserRow) -> dict:
    state = WIZARD_STORE.get(token)
    if not state or state["user_id"] != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This login attempt expired. Start over.")
    return state


def _telegram(session: str) -> TelegramService:
    settings = get_settings()
    return TelegramService(settings.telegram_api_id, settings.telegram_api_hash, session)


async def _run_step(state: dict, step, *args):
    """Run a login step on the wizard's session and keep the session it
    leaves behind. Errors become a message the user can act on."""
    tg = _telegram(state["session"])
    try:
        result = await tg.login_step(step, *args)
    except Exception as exc:
        log.info("login step %s failed: %s", step.__name__, type(exc).__name__)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, telegram_login.friendly(exc))
    state["session"] = tg.session
    return result


def _remember(state: dict, phone_code_hash: str, delivery: telegram_login.Delivery) -> schemas.CodeDeliveryOut:
    state["phone_code_hash"] = phone_code_hash
    state["delivery"] = delivery.kind
    return schemas.CodeDeliveryOut(**delivery.public())


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
    reconnect_profile_id: int | None = None
    if body.profile_id is not None:
        store = Storage(settings.database_url)
        # Blocking call made directly in this `async def` handler's body --
        # offload it so it doesn't stall the shared event loop (and every
        # other in-flight request) for its duration; see the matching note
        # in targets.py's groups().
        existing = await run_in_threadpool(store.get_profile, body.profile_id)
        if not existing or existing.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
        reconnect_profile_id = body.profile_id
    phone = body.phone.strip()
    state = {
        "user_id": user.id,
        "label": body.label.strip(),
        "phone": phone,
        "session": "",
        "created": time.time(),
        "reconnect_profile_id": reconnect_profile_id,
    }
    phone_code_hash, delivery = await _run_step(state, telegram_login.send_code, phone)
    token = secrets.token_urlsafe(24)
    out = _remember(state, phone_code_hash, delivery)
    WIZARD_STORE[token] = state
    return schemas.PhoneSendCodeResponse(wizard_token=token, delivery=out)


@router.post("/qr/start", response_model=schemas.QrStatusOut)
async def qr_start(body: schemas.QrStartRequest, user: UserRow = Depends(get_current_user)):
    """Log in by scanning a QR code with the Telegram app instead of a code."""
    sweep_expired()
    qr_login.sweep()
    if not body.label.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give the profile a name first.")
    if body.profile_id is not None:
        store = Storage(get_settings().database_url)
        existing = await run_in_threadpool(store.get_profile, body.profile_id)
        if not existing or existing.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    token = secrets.token_urlsafe(24)
    try:
        state = await qr_login.start(token, user.id, body.label.strip(), body.profile_id)
    except Exception as exc:
        log.info("qr login start failed: %s", type(exc).__name__)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, telegram_login.friendly(exc))
    return schemas.QrStatusOut(wizard_token=token, **qr_login.public(state))


@router.post("/qr/status", response_model=schemas.QrStatusOut)
def qr_status(body: schemas.PhoneWizardRequest, user: UserRow = Depends(get_current_user)):
    state = qr_login.QR_STORE.get(body.wizard_token)
    if not state or state["user_id"] != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This login attempt expired. Start over.")
    if state["status"] == "password" and body.wizard_token not in WIZARD_STORE:
        # Continue in the normal wizard's two-step password step.
        WIZARD_STORE[body.wizard_token] = {
            "user_id": user.id,
            "label": state["label"],
            "phone": None,
            "session": state["session"],
            "created": time.time(),
            "reconnect_profile_id": state.get("reconnect_profile_id"),
        }
    out = qr_login.public(state)
    if state["status"] in ("done", "expired", "error"):
        qr_login.stop(body.wizard_token)
    return schemas.QrStatusOut(wizard_token=body.wizard_token, **out)


@router.get("/qr/shared/{share_key}", response_model=schemas.QrSharedOut)
def qr_shared(share_key: str):
    """The QR on its own, for a link opened on another screen without logging
    in there. The key is random and dies with the attempt (10 minutes)."""
    out = qr_login.shared(share_key)
    if out is None:
        return schemas.QrSharedOut(status="closed")
    return schemas.QrSharedOut(**out)


@router.post("/qr/cancel")
def qr_cancel(body: schemas.PhoneWizardRequest, user: UserRow = Depends(get_current_user)):
    state = qr_login.QR_STORE.get(body.wizard_token)
    if state and state["user_id"] == user.id:
        qr_login.stop(body.wizard_token)
    return {"ok": True}


@router.post("/phone/resend-code", response_model=schemas.PhoneDeliveryResponse)
async def phone_resend_code(body: schemas.PhoneWizardRequest, user: UserRow = Depends(get_current_user)):
    """Send the code again, by the next method Telegram offers (SMS, call…)."""
    state = _wizard(body.wizard_token, user)
    phone_code_hash, delivery = await _run_step(
        state, telegram_login.resend_code, state["phone"], state["phone_code_hash"]
    )
    return schemas.PhoneDeliveryResponse(delivery=_remember(state, phone_code_hash, delivery))


@router.post("/phone/setup-email", response_model=schemas.PhoneDeliveryResponse)
async def phone_setup_email(body: schemas.PhoneSetupEmailRequest, user: UserRow = Depends(get_current_user)):
    """Telegram wants a login email on the account before it sends a code:
    mail a confirmation code to it."""
    state = _wizard(body.wizard_token, user)
    email = body.email.strip()
    if "@" not in email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a valid email address.")
    delivery = await _run_step(
        state, telegram_login.setup_email, state["phone"], state["phone_code_hash"], email
    )
    return schemas.PhoneDeliveryResponse(delivery=schemas.CodeDeliveryOut(**delivery.public()))


@router.post("/phone/verify-email", response_model=schemas.PhoneDeliveryResponse)
async def phone_verify_email(body: schemas.PhoneVerifyCodeRequest, user: UserRow = Depends(get_current_user)):
    """Confirm the login email; Telegram then sends the login code."""
    state = _wizard(body.wizard_token, user)
    phone_code_hash, delivery = await _run_step(
        state, telegram_login.confirm_email, state["phone"], state["phone_code_hash"], body.code.replace(" ", "").strip()
    )
    return schemas.PhoneDeliveryResponse(delivery=_remember(state, phone_code_hash, delivery))


@router.post("/phone/verify-code", response_model=schemas.PhoneVerifyCodeResponse)
async def phone_verify_code(
    body: schemas.PhoneVerifyCodeRequest,
    user: UserRow = Depends(get_current_user),
    store: Storage = Depends(get_store),
):
    state = _wizard(body.wizard_token, user)
    needs_password = await _run_step(
        state,
        telegram_login.sign_in,
        state["phone"],
        state["phone_code_hash"],
        body.code.replace(" ", "").strip(),
        state.get("delivery") == "email",
    )
    if needs_password:
        return schemas.PhoneVerifyCodeResponse(needs_password=True)
    session = state["session"]
    reconnect_id = state.get("reconnect_profile_id")
    if reconnect_id is not None:
        await run_in_threadpool(store.update_profile_session, reconnect_id, session)
        await run_in_threadpool(store.update_profile_phone, reconnect_id, state["phone"])
        profile_id = reconnect_id
    else:
        profile_id = await run_in_threadpool(
            store.create_profile, user.id, state["label"], session, phone=state["phone"]
        )
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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, telegram_login.friendly(exc))
    reconnect_id = state.get("reconnect_profile_id")
    if reconnect_id is not None:
        await run_in_threadpool(store.update_profile_session, reconnect_id, session)
        if state.get("phone"):  # unknown after a QR login
            await run_in_threadpool(store.update_profile_phone, reconnect_id, state["phone"])
        profile_id = reconnect_id
    else:
        profile_id = await run_in_threadpool(
            store.create_profile, user.id, state["label"], session, phone=state["phone"]
        )
    WIZARD_STORE.pop(body.wizard_token, None)
    return schemas.PhoneVerifyPasswordResponse(profile_id=profile_id)
