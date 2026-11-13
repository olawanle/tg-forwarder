"""Start a broadcast on every profile of an account in one go, each with its
own previous settings.

"Previous settings" per profile means:
- what to send: the profile's saved draft, which every broadcast start also
  writes, so it is the last thing sent unless edited since; falling back to
  the last broadcast's own message when there is no draft;
- how to send it: delay, longest slowmode wait and Discord from that
  profile's last broadcast, or the account's defaults if it has never sent.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from forwarder.config import get_settings
from forwarder.job_runner import get_job_runner
from forwarder.storage import JobRow, ProfileRow, Storage, UserRow

DEFAULT_DELAY_KEY = "default_delay_seconds"
DEFAULT_MAX_SLOWMODE_WAIT = 300


def default_delay_for(user: UserRow, store: Storage) -> float:
    """Where Compose starts the delay for this user."""
    if user.default_delay_seconds is not None:
        return float(user.default_delay_seconds)
    raw = store.get_setting(DEFAULT_DELAY_KEY)
    return float(raw) if raw is not None else get_settings().default_delay_seconds


@dataclass
class ProfilePlan:
    profile_id: int
    label: str
    ready: bool
    reason: str = ""
    mode: str = "text"
    messages: list[str] | None = None
    source_message_ids: list[int] | None = None
    delay_seconds: float = 3.0
    max_slowmode_wait: int = DEFAULT_MAX_SLOWMODE_WAIT
    include_discord: bool = False
    #: True when delay etc. came from the profile's last broadcast, False
    #: when it has none and the account defaults were used.
    from_last_broadcast: bool = False
    preview: str = ""

    def public(self) -> dict:
        out = asdict(self)
        out["variants"] = len(self.messages or self.source_message_ids or [])
        out.pop("messages")
        out.pop("source_message_ids")
        return out


def _content(profile: ProfileRow, last: JobRow | None) -> tuple[str, list[str], list[int]]:
    if profile.draft_mode == "saved":
        ids = list(profile.draft_saved_message_ids) or (
            [profile.draft_saved_message_id] if profile.draft_saved_message_id else []
        )
        if ids:
            return "saved", [], ids
    else:
        texts = [m for m in profile.draft_messages if m.strip()] or (
            [profile.draft_message] if profile.draft_message.strip() else []
        )
        if texts:
            return "text", texts, []
    if last:
        if last.source_message_ids or last.source_message_id:
            return "saved", [], list(last.source_message_ids) or [last.source_message_id]
        texts = [m for m in last.messages if m.strip()] or ([last.message] if last.message.strip() else [])
        if texts:
            return "text", texts, []
    return profile.draft_mode or "text", [], []


def plan_profile(profile: ProfileRow, store: Storage, default_delay: float) -> ProfilePlan:
    plan = ProfilePlan(profile_id=profile.id, label=profile.label, ready=False, delay_seconds=default_delay)

    last = store.get_last_run_job(profile.id)
    if last:
        plan.delay_seconds = float(last.delay_seconds)
        plan.max_slowmode_wait = int(last.max_slowmode_wait)
        plan.include_discord = bool(last.include_discord)
        plan.from_last_broadcast = True

    plan.mode, texts, ids = _content(profile, last)
    plan.messages, plan.source_message_ids = texts, ids
    if texts:
        plan.preview = texts[0].strip().replace("\n", " ")[:120]
    elif ids:
        plan.preview = f"{len(ids)} tagged Saved Message{'s' if len(ids) > 1 else ''}"

    if not profile.telegram_session:
        plan.reason = "No Telegram session. Reconnect it first."
    elif get_job_runner().is_worker_alive(profile.id) or store.get_active_job(profile.id, include_pending=False):
        plan.reason = "Already broadcasting."
    elif not texts and not ids:
        plan.reason = "Nothing to send yet. Write a message in Compose first."
    else:
        plan.ready = True
    return plan


def plan_account(user: UserRow, store: Storage) -> list[ProfilePlan]:
    default_delay = default_delay_for(user, store)
    return [plan_profile(p, store, default_delay) for p in store.list_profiles_for_user(user.id)]


def start_plan(plan: ProfilePlan, profile: ProfileRow, store: Storage) -> int:
    """Same call a single Compose start makes. Raises RuntimeError if the
    profile started something in the meantime."""
    texts = plan.messages or []
    ids = plan.source_message_ids or []
    return get_job_runner().start_broadcast(
        profile_id=profile.id,
        store=store,
        message=texts[0] if texts else "",
        delay_seconds=plan.delay_seconds,
        max_slowmode_wait=plan.max_slowmode_wait,
        include_discord=plan.include_discord,
        telegram_session=profile.telegram_session,
        source_message_id=ids[0] if plan.mode == "saved" and ids else None,
        messages=texts if plan.mode == "text" and len(texts) > 1 else None,
        source_message_ids=ids if plan.mode == "saved" and len(ids) > 1 else None,
    )
