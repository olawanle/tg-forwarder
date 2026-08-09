from __future__ import annotations

from fastapi import APIRouter, Depends

from forwarder.config import get_settings
from forwarder.storage import Storage, UserRow

from backend import schemas
from backend.deps import get_current_user, get_store, require_admin

router = APIRouter(tags=["settings"])

_DEFAULT_DELAY_KEY = "default_delay_seconds"


@router.get("/settings", response_model=schemas.AppSettingsOut)
def get_app_settings(
    _: UserRow = Depends(get_current_user), store: Storage = Depends(get_store)
):
    raw = store.get_setting(_DEFAULT_DELAY_KEY)
    value = float(raw) if raw is not None else get_settings().default_delay_seconds
    return schemas.AppSettingsOut(default_delay_seconds=value)


@router.put("/admin/settings", response_model=schemas.AppSettingsOut)
def update_app_settings(
    body: schemas.AppSettingsUpdateRequest,
    _: UserRow = Depends(require_admin),
    store: Storage = Depends(get_store),
):
    store.set_setting(_DEFAULT_DELAY_KEY, str(body.default_delay_seconds))
    return schemas.AppSettingsOut(default_delay_seconds=body.default_delay_seconds)
