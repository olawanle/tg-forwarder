from __future__ import annotations

from fastapi import APIRouter, Depends

from forwarder.storage import Storage, UserRow

from backend import schemas
from backend.broadcast_all import default_delay_for
from backend.deps import get_current_user, get_store, require_admin

router = APIRouter(tags=["settings"])

_DEFAULT_DELAY_KEY = "default_delay_seconds"


@router.get("/settings", response_model=schemas.AppSettingsOut)
def get_app_settings(
    user: UserRow = Depends(get_current_user), store: Storage = Depends(get_store)
):
    return schemas.AppSettingsOut(default_delay_seconds=default_delay_for(user, store))


@router.put("/admin/settings", response_model=schemas.AppSettingsOut)
def update_app_settings(
    body: schemas.AppSettingsUpdateRequest,
    _: UserRow = Depends(require_admin),
    store: Storage = Depends(get_store),
):
    store.set_setting(_DEFAULT_DELAY_KEY, str(body.default_delay_seconds))
    return schemas.AppSettingsOut(default_delay_seconds=body.default_delay_seconds)
