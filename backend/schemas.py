from __future__ import annotations

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user_id: int
    email: str
    role: str
    must_change_password: bool


class ChangePasswordRequest(BaseModel):
    new_password: str


class ProfileOut(BaseModel):
    id: int
    label: str
    draft_message: str
    draft_saved_message_id: int | None
    draft_mode: str
    draft_messages: list[str]
    draft_saved_message_ids: list[int]
    has_session: bool
    created_at: str
    updated_at: str


class CreateProfileSessionRequest(BaseModel):
    label: str
    session_string: str
    profile_id: int | None = None  # set to reconnect an existing profile in place


class UpdateSessionRequest(BaseModel):
    session_string: str


class PhoneSendCodeRequest(BaseModel):
    label: str
    phone: str
    profile_id: int | None = None  # set to reconnect an existing profile in place


class PhoneSendCodeResponse(BaseModel):
    wizard_token: str


class PhoneVerifyCodeRequest(BaseModel):
    wizard_token: str
    code: str


class PhoneVerifyCodeResponse(BaseModel):
    needs_password: bool
    profile_id: int | None = None


class PhoneVerifyPasswordRequest(BaseModel):
    wizard_token: str
    password: str


class PhoneVerifyPasswordResponse(BaseModel):
    profile_id: int


class GroupOut(BaseModel):
    id: str
    name: str
    kind: str
    stars_required: int


class SkipOut(BaseModel):
    target_id: str
    name: str
    reason: str
    detail: str
    at: str


class LeaveGroupsRequest(BaseModel):
    target_ids: list[str] | None = None  # None = leave every currently-blacklisted group


class DiscordChannelOut(BaseModel):
    id: str
    name: str
    guild: str


class DiscordSelectionRequest(BaseModel):
    channel_ids: list[str]


class DraftTextRequest(BaseModel):
    messages: list[str]


class DraftSavedMessageRequest(BaseModel):
    saved_message_ids: list[int]


class SavedMessageOut(BaseModel):
    id: int
    tag: str
    preview: str
    has_media: bool


class BroadcastStartRequest(BaseModel):
    mode: str  # "text" | "saved"
    message: str | None = None
    source_message_id: int | None = None
    messages: list[str] | None = None  # 2+ = rotate across targets
    source_message_ids: list[int] | None = None  # 2+ = rotate across targets
    scheduled_at: str | None = None  # ISO datetime, future — None = send now
    delay_seconds: float = 3.0
    max_slowmode_wait: int = 300
    include_discord: bool = False


class JobOut(BaseModel):
    id: int
    profile_id: int
    status: str
    message: str
    source_message_id: int | None
    messages: list[str]
    source_message_ids: list[int]
    scheduled_at: str | None
    delay_seconds: float
    max_slowmode_wait: int
    include_discord: bool
    total: int
    done: int
    current_name: str
    current_detail: str
    error: str
    summary: dict
    created_at: str
    updated_at: str


class JobResultOut(BaseModel):
    id: int
    platform: str
    target_id: str
    target_name: str
    status: str
    detail: str
    created_at: str


class TrendPointOut(BaseModel):
    day: str
    sent: int
    errors: int
    total: int


class SendLogOut(BaseModel):
    id: int
    platform: str
    target_id: str
    target_name: str
    status: str
    detail: str
    created_at: str


class AdminCreateUserRequest(BaseModel):
    email: str
    role: str = "user"
    password: str | None = None  # None = auto-generate


class AdminCreateUserResponse(BaseModel):
    user_id: int
    temp_password: str


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    created_at: str
    profile_count: int


class AdminSetActiveRequest(BaseModel):
    active: bool


class AdminResetPasswordResponse(BaseModel):
    temp_password: str


class AdminUserProfileStatsOut(BaseModel):
    id: int
    label: str
    sent: int
    errors: int
    attempts: int
    last_activity: str | None


class AdminUserStatsOut(BaseModel):
    total_sent: int
    total_errors: int
    total_attempts: int
    last_activity: str | None
    profiles: list[AdminUserProfileStatsOut]
