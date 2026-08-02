from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from forwarder.storage import ProfileRow, Storage

from backend import schemas
from backend.converters import job_out, job_result_out, send_log_out
from backend.deps import get_owned_profile, get_store

router = APIRouter(prefix="/profiles/{profile_id}", tags=["progress"])


@router.get("/jobs/active")
def active_job(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    job = store.get_active_job(profile.id)
    return job_out(job) if job else None


@router.get("/jobs/latest")
def latest_job(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    job = store.get_latest_job(profile.id)
    return job_out(job) if job else None


@router.get("/jobs/{job_id}/results", response_model=list[schemas.JobResultOut])
def job_results(
    job_id: int,
    profile: ProfileRow = Depends(get_owned_profile),
    store: Storage = Depends(get_store),
):
    job = store.get_job(job_id)
    if not job or job.profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return [job_result_out(r) for r in store.list_job_results(job_id)]


@router.get("/send-log", response_model=list[schemas.SendLogOut])
def send_log(
    profile: ProfileRow = Depends(get_owned_profile), store: Storage = Depends(get_store)
):
    return [send_log_out(r) for r in store.list_send_logs(profile.id, 150)]
