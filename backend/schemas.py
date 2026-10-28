from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user_id: int
    email: str
    role: str
    must_change_password: bool


class LoginStepResponse(BaseModel):
    """/auth/login never returns a usable token directly -- 2FA is always
    required -- except for the "done" status, used only for an account an
    admin has explicitly exempted from 2FA (backend/routers/admin.py
    totp-exempt). The `status` field is what the frontend switches on;
    fields outside the relevant branch are simply omitted."""

    status: str  # "totp_required" | "totp_setup_required" | "done"
    pre_auth_token: str | None = None
    # status == "totp_setup_required" only (first login, or after an admin
    # 2FA reset):
    totp_secret: str | None = None
    totp_qr_data_uri: str | None = None
    # status == "done" only (totp_exempt accounts skip 2FA entirely):
    token: str | None = None
    user_id: int | None = None
    email: str | None = None
    role: str | None = None
    must_change_password: bool | None = None


class TotpVerifyRequest(BaseModel):
    pre_auth_token: str
    code: str


class TotpSetupConfirmRequest(BaseModel):
    pre_auth_token: str
    code: str


class TotpSetupConfirmResponse(BaseModel):
    token: str
    user_id: int
    email: str
    role: str
    must_change_password: bool
    backup_codes: list[str]


class RegenerateBackupCodesResponse(BaseModel):
    backup_codes: list[str]


class ChangePasswordRequest(BaseModel):
    new_password: str


class ProfileOut(BaseModel):
    id: int
    label: str
    phone: str | None
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
    delay_seconds: float = Field(default=3.0, ge=0)
    max_slowmode_wait: int = 300
    include_discord: bool = False


class AppSettingsOut(BaseModel):
    default_delay_seconds: float


class AppSettingsUpdateRequest(BaseModel):
    default_delay_seconds: float = Field(ge=0)


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
    default_delay_seconds: float | None
    totp_enabled: bool
    totp_exempt: bool
    last_login_at: str | None
    last_login_ip: str | None


class AdminSetUserDelayRequest(BaseModel):
    default_delay_seconds: float | None = Field(default=None, ge=0)


class AdminSetTotpExemptRequest(BaseModel):
    exempt: bool


class AdminSetActiveRequest(BaseModel):
    active: bool


class AdminResetPasswordResponse(BaseModel):
    temp_password: str


class LoginAuditOut(BaseModel):
    stage: str
    success: bool
    ip: str | None
    detail: str
    at: str


class AdminUserProfileStatsOut(BaseModel):
    id: int
    label: str
    phone: str | None
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
    distinct_login_ips_7d: int
    recent_logins: list[LoginAuditOut]
