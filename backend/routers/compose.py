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
    messages = [m for m in (body.messages or []) if m.strip()]
    store.set_draft_messages(profile.id, messages)
    return {"ok": True}


@router.put("/draft/saved")
def set_draft_saved(
    body: schemas.DraftSavedMessageRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    store.set_draft_saved_messages(profile.id, body.saved_message_ids)
    return {"ok": True}


@router.get("/jobs/scheduled", response_model=list[schemas.JobOut])
def scheduled_jobs(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    return [job_out(j) for j in store.list_scheduled_jobs_for_profile(profile.id)]


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

    messages = [m for m in (body.messages or []) if m.strip()]
    source_message_ids = list(body.source_message_ids or [])
    message = messages[0] if messages else (body.message or "")
    source_message_id = (
        source_message_ids[0] if source_message_ids else body.source_message_id
    ) if body.mode == "saved" else None
    if body.mode == "saved":
        source_message_ids = source_message_ids or ([source_message_id] if source_message_id else [])

    if body.mode == "text" and not message.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message is empty.")
    if body.mode == "saved" and not source_message_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick at least one tagged Saved Message.")

    if body.mode == "text":
        store.set_draft_messages(profile.id, messages or [message])
    else:
        store.set_draft_saved_messages(profile.id, source_message_ids)

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
            messages=messages if body.mode == "text" and len(messages) > 1 else None,
            source_message_ids=source_message_ids if body.mode == "saved" and len(source_message_ids) > 1 else None,
            scheduled_at=body.scheduled_at,
        )
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    return job_out(store.get_job(job_id))


@router.post("/broadcast/cancel")
def broadcast_cancel(profile: ProfileRow = Depends(get_owned_profile)):
    get_job_runner().request_cancel(profile.id)
    return {"ok": True}


@router.post("/jobs/{job_id}/cancel-scheduled")
def cancel_scheduled(
    job_id: int,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    job = store.get_job(job_id)
    if not job or job.profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    ok = get_job_runner().cancel_scheduled(job_id, store)
    if not ok:
        raise HTTPException(status.HTTP_409_CONFLICT, "This broadcast has already started.")
    return {"ok": True}


@router.post("/broadcast/resume")
def broadcast_resume(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    job_id = get_job_runner().resume_interrupted(profile.id, store, profile.telegram_session)
    if not job_id:
        return None
    return job_out(store.get_job(job_id))
