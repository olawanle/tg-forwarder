from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from forwarder.config import get_settings
from forwarder.discord_service import DiscordService
from forwarder.storage import ProfileRow, Storage

from backend import schemas
from backend.deps import get_owned_profile, get_store
from backend.tg import build_telegram_service

router = APIRouter(prefix="/profiles/{profile_id}", tags=["targets"])


@router.get("/status")
async def status_(profile: ProfileRow = Depends(get_owned_profile)):
    return await build_telegram_service(profile).status()


@router.get("/groups", response_model=list[schemas.GroupOut])
async def groups(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    skips = store.get_telegram_skips(profile.id)
    try:
        targets = await build_telegram_service(profile).list_groups(skip_ids=set(skips.keys()))
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)[:300])
    return [
        schemas.GroupOut(id=t.id, name=t.name, kind=t.kind, stars_required=t.stars_required)
        for t in targets
    ]


@router.get("/skips", response_model=list[schemas.SkipOut])
def skips(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    data = store.get_telegram_skips(profile.id)
    return [
        schemas.SkipOut(target_id=k, name=v["name"], reason=v["reason"], detail=v["detail"], at=v["at"])
        for k, v in data.items()
    ]


@router.post("/skips/{target_id}/restore")
def restore_skip(
    target_id: str,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    store.remove_telegram_skip(profile.id, target_id)
    return {"ok": True}


@router.delete("/skips")
def clear_skips(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    store.clear_telegram_skips(profile.id)
    return {"ok": True}


@router.post("/leave-groups")
async def leave_groups(
    body: schemas.LeaveGroupsRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    skips = store.get_telegram_skips(profile.id)
    ids = body.target_ids if body.target_ids else list(skips.keys())
    targets = [{"id": tid, "name": skips.get(tid, {}).get("name", tid)} for tid in ids]
    if not targets:
        return {"left": [], "failed": []}
    results = await build_telegram_service(profile).leave_groups(targets)
    left: list[dict] = []
    failed: list[dict] = []
    for r in results:
        if r.status == "left":
            store.remove_telegram_skip(profile.id, r.target_id)
            left.append({"target_id": r.target_id, "name": r.target_name})
        else:
            failed.append({"target_id": r.target_id, "name": r.target_name, "detail": r.detail})
    return {"left": left, "failed": failed}


@router.get("/discord-channels", response_model=list[schemas.DiscordChannelOut])
async def discord_channels(profile: ProfileRow = Depends(get_owned_profile)):
    settings = get_settings()
    dc = DiscordService(settings.discord_bot_token)
    if not dc.configured():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "DISCORD_BOT_TOKEN is not set.")
    try:
        chans = await dc.list_text_channels()
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)[:300])
    return [schemas.DiscordChannelOut(id=c.id, name=c.name, guild=c.guild) for c in chans]


@router.get("/discord-selection", response_model=list[str])
def discord_selection_get(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    return store.get_selected_discord_channels(profile.id)


@router.put("/discord-selection")
def discord_selection_put(
    body: schemas.DiscordSelectionRequest,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    store.set_selected_discord_channels(profile.id, body.channel_ids)
    return {"ok": True}
