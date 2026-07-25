from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import admin_user, current_user
from backend.app.core.config import get_settings
from backend.app.core.crypto import encrypt_text
from backend.app.core.database import get_session
from backend.app.core.security import create_access_token
from backend.app.models import (
    Account,
    AccountStatus,
    Campaign,
    CampaignStatus,
    DeliveryLog,
    DeliveryStatus,
    Group,
    Template,
    User,
    UserRole,
)
from backend.app.schemas.api import (
    AccountCreate,
    AccountOut,
    CampaignCreate,
    CampaignOut,
    CompleteLoginRequest,
    LoginCodeOut,
    RefreshGroupsOut,
    StatsOut,
    TelegramLoginRequest,
    TemplateCreate,
    TemplateOut,
    TokenResponse,
    UserOut,
)
from telethon_client.client import complete_login, send_login_code
from telethon_client.groups import refresh_groups

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "time": datetime.now(UTC).isoformat()}


@router.post("/auth/telegram", response_model=TokenResponse)
async def telegram_auth(payload: TelegramLoginRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.telegram_id == payload.telegram_id))
    user = result.scalar_one_or_none()
    role = UserRole.admin if payload.telegram_id in get_settings().admin_ids else UserRole.user
    if not user:
        user = User(
            telegram_id=payload.telegram_id,
            username=payload.username,
            full_name=payload.full_name,
            role=role,
        )
        session.add(user)
    else:
        user.username = payload.username
        user.full_name = payload.full_name
        user.role = role if user.role != UserRole.admin else user.role
    await session.commit()
    await session.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id), user.role.value))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return user


@router.post("/accounts", response_model=AccountOut)
async def create_account(
    payload: AccountCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    account = Account(
        user_id=user.id,
        label=payload.label,
        phone=payload.phone,
        api_id_encrypted=encrypt_text(payload.api_id),
        api_hash_encrypted=encrypt_text(payload.api_hash),
        hourly_limit=get_settings().default_account_hourly_limit,
        daily_limit=get_settings().default_account_daily_limit,
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Account).where(Account.user_id == user.id))
    return result.scalars().all()


@router.post("/accounts/{account_id}/login-code", response_model=LoginCodeOut)
async def request_login_code(
    account_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Account not found")
    if not account.phone:
        raise HTTPException(400, "Account phone is required")
    phone_code_hash = await send_login_code(account)
    return LoginCodeOut(phone_code_hash=phone_code_hash)


@router.post("/accounts/{account_id}/complete-login", response_model=AccountOut)
async def account_complete_login(
    account_id: str,
    payload: CompleteLoginRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Account not found")
    account.session_encrypted = await complete_login(
        account, payload.code, payload.phone_code_hash, payload.password
    )
    account.status = AccountStatus.active
    await session.commit()
    await session.refresh(account)
    return account


@router.post("/accounts/{account_id}/refresh-groups", response_model=RefreshGroupsOut)
async def account_refresh_groups(
    account_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Account not found")
    if account.status != AccountStatus.active:
        raise HTTPException(400, "Account must be active")
    return RefreshGroupsOut(imported=await refresh_groups(session, account))


@router.post("/templates", response_model=TemplateOut)
async def create_template(
    payload: TemplateCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    template = Template(user_id=user.id, **payload.model_dump())
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Template).where(Template.user_id == user.id))
    return result.scalars().all()


@router.post("/campaigns", response_model=CampaignOut)
async def create_campaign(
    payload: CampaignCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(Account, payload.account_id)
    template = await session.get(Template, payload.template_id)
    if not account or account.user_id != user.id or not template or template.user_id != user.id:
        raise HTTPException(404, "Account or template not found")
    campaign = Campaign(user_id=user.id, status=CampaignStatus.draft, **payload.model_dump())
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)
    return campaign


@router.get("/campaigns", response_model=list[CampaignOut])
async def list_campaigns(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Campaign).where(Campaign.user_id == user.id))
    return result.scalars().all()


@router.post("/campaigns/{campaign_id}/{action}", response_model=CampaignOut)
async def campaign_action(
    campaign_id: str,
    action: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    campaign = await session.get(Campaign, campaign_id)
    if not campaign or campaign.user_id != user.id:
        raise HTTPException(404, "Campaign not found")
    transitions = {
        "start": CampaignStatus.active,
        "pause": CampaignStatus.paused,
        "resume": CampaignStatus.active,
        "stop": CampaignStatus.stopped,
    }
    if action not in transitions:
        raise HTTPException(400, "Unknown action")
    campaign.status = transitions[action]
    await session.commit()
    await session.refresh(campaign)
    return campaign


@router.get("/stats", response_model=StatsOut)
async def stats(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    async def count(stmt):
        return (await session.execute(stmt)).scalar() or 0

    return StatsOut(
        total_accounts=await count(select(func.count(Account.id)).where(Account.user_id == user.id)),
        total_groups=await count(select(func.count(Group.id)).where(Group.user_id == user.id)),
        active_campaigns=await count(
            select(func.count(Campaign.id)).where(
                Campaign.user_id == user.id, Campaign.status == CampaignStatus.active
            )
        ),
        successful_deliveries=await count(
            select(func.count(DeliveryLog.id)).where(
                DeliveryLog.user_id == user.id, DeliveryLog.status == DeliveryStatus.sent
            )
        ),
        failed_deliveries=await count(
            select(func.count(DeliveryLog.id)).where(
                DeliveryLog.user_id == user.id, DeliveryLog.status == DeliveryStatus.failed
            )
        ),
    )


@router.get("/admin/users", response_model=list[UserOut])
async def admin_users(_: User = Depends(admin_user), session: AsyncSession = Depends(get_session)):
    return (await session.execute(select(User).order_by(User.created_at.desc()).limit(200))).scalars().all()


@router.get("/admin/campaigns", response_model=list[CampaignOut])
async def admin_campaigns(_: User = Depends(admin_user), session: AsyncSession = Depends(get_session)):
    return (await session.execute(select(Campaign).order_by(Campaign.created_at.desc()).limit(200))).scalars().all()


@router.post("/admin/accounts/{account_id}/suspend", response_model=AccountOut)
async def suspend_account(
    account_id: str,
    _: User = Depends(admin_user),
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    account.status = AccountStatus.suspended
    await session.commit()
    await session.refresh(account)
    return account
