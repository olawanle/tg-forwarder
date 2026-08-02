from __future__ import annotations

from forwarder.storage import JobResultRow, JobRow, ProfileRow, SendLogRow

from backend import schemas


def profile_out(p: ProfileRow) -> schemas.ProfileOut:
    return schemas.ProfileOut(
        id=p.id,
        label=p.label,
        draft_message=p.draft_message,
        draft_saved_message_id=p.draft_saved_message_id,
        draft_mode=p.draft_mode,
        has_session=bool(p.telegram_session),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def job_out(j: JobRow) -> schemas.JobOut:
    return schemas.JobOut(
        id=j.id,
        profile_id=j.profile_id,
        status=j.status,
        message=j.message,
        source_message_id=j.source_message_id,
        delay_seconds=j.delay_seconds,
        max_slowmode_wait=j.max_slowmode_wait,
        include_discord=j.include_discord,
        total=j.total,
        done=j.done,
        current_name=j.current_name,
        current_detail=j.current_detail,
        error=j.error,
        summary=j.summary,
        created_at=j.created_at,
        updated_at=j.updated_at,
    )


def job_result_out(r: JobResultRow) -> schemas.JobResultOut:
    return schemas.JobResultOut(
        id=r.id,
        platform=r.platform,
        target_id=r.target_id,
        target_name=r.target_name,
        status=r.status,
        detail=r.detail,
        created_at=r.created_at,
    )


def send_log_out(r: SendLogRow) -> schemas.SendLogOut:
    return schemas.SendLogOut(
        id=r.id,
        platform=r.platform,
        target_id=r.target_id,
        target_name=r.target_name,
        status=r.status,
        detail=r.detail,
        created_at=r.created_at,
    )
