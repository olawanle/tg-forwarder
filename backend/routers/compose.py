from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from forwarder.job_runner import get_job_runner
from forwarder.storage import ProfileRow, Storage

from backend import schemas
from backend.converters import job_out
from backend.deps import get_owned_profile, get_store
from backend.tg import build_telegram_service

router = APIRouter(prefix="/profiles/{profile_id}", tags=["compose"])


@router.get("/saved-messages", response_model=list[schemas.SavedMessageOut])
async def saved_messages(profile: ProfileRow = Depends(get_owned_profile)):
    try:
        options = await build_telegram_service(profile).list_tagged_saved_messages()
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)[:300])
    return [
        schemas.SavedMessageOut(id=o.id, tag=o.tag, preview=o.preview, has_media=o.has_media)
        for o in options
    ]


@router.put("/draft/text")
def set_draft_text(
    body: schemas.DraftTextRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    store.set_draft_message(profile.id, body.message)
    return {"ok": True}


@router.put("/draft/saved")
def set_draft_saved(
    body: schemas.DraftSavedMessageRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    store.set_draft_saved_message(profile.id, body.saved_message_id)
    return {"ok": True}


@router.post("/broadcast/start", response_model=schemas.JobOut)
def broadcast_start(
    body: schemas.BroadcastStartRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    if body.mode not in ("text", "saved"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "mode must be 'text' or 'saved'.")
    if not profile.telegram_session:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This profile has no Telegram session yet.")

    message = body.message or ""
    source_message_id = body.source_message_id if body.mode == "saved" else None
    if body.mode == "text" and not message.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message is empty.")
    if body.mode == "saved" and not source_message_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick a tagged Saved Message.")

    if body.mode == "text":
        store.set_draft_message(profile.id, message)
    else:
        store.set_draft_saved_message(profile.id, source_message_id)

    runner = get_job_runner()
    try:
        job_id = runner.start_broadcast(
            profile_id=profile.id,
            store=store,
            message=message,
            delay_seconds=body.delay_seconds,
            max_slowmode_wait=body.max_slowmode_wait,
            include_discord=body.include_discord,
            telegram_session=profile.telegram_session,
            source_message_id=source_message_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    return job_out(store.get_job(job_id))


@router.post("/broadcast/cancel")
def broadcast_cancel(profile: ProfileRow = Depends(get_owned_profile)):
    get_job_runner().request_cancel(profile.id)
    return {"ok": True}


@router.post("/broadcast/resume")
def broadcast_resume(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    job_id = get_job_runner().resume_interrupted(profile.id, store, profile.telegram_session)
    if not job_id:
        return None
    return job_out(store.get_job(job_id))
