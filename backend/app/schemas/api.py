from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from backend.app.models import AccountStatus, CampaignStatus, TemplateKind, UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TelegramLoginRequest(BaseModel):
    telegram_id: int
    username: str | None = None
    full_name: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    telegram_id: int
    username: str | None
    full_name: str | None
    role: UserRole
    is_active: bool


class AccountCreate(BaseModel):
    label: str
    api_id: str
    api_hash: str
    phone: str | None = None


class LoginCodeOut(BaseModel):
    phone_code_hash: str


class CompleteLoginRequest(BaseModel):
    code: str
    phone_code_hash: str
    password: str | None = None


class RefreshGroupsOut(BaseModel):
    imported: int


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    phone: str | None
    status: AccountStatus
    hourly_limit: int
    daily_limit: int
    flood_wait_until: datetime | None


class TemplateCreate(BaseModel):
    name: str
    kind: TemplateKind = TemplateKind.text
    body: str
    media_file_id: str | None = None


class TemplateOut(TemplateCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class CampaignCreate(BaseModel):
    name: str
    account_id: UUID
    template_id: UUID
    target_tags: list[str] = []
    schedule: dict = {}
    retry_policy: dict = {}


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    status: CampaignStatus
    sent_count: int
    failed_count: int
    schedule: dict


class StatsOut(BaseModel):
    total_accounts: int
    total_groups: int
    active_campaigns: int
    successful_deliveries: int
    failed_deliveries: int
