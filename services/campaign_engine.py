import asyncio
import random
from datetime import UTC, datetime, timedelta

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.errors import FloodWaitError, UnauthorizedError

from backend.app.models import (
    Account,
    AccountStatus,
    Campaign,
    CampaignStatus,
    DeliveryLog,
    DeliveryStatus,
    Group,
    Template,
)
from services.rate_limit import AccountRateLimiter
from services.templates import render_template
from telethon_client.client import build_client


async def process_campaign(session: AsyncSession, redis_client: redis.Redis, campaign: Campaign) -> None:
    account = await session.get(Account, campaign.account_id)
    template = await session.get(Template, campaign.template_id)
    if not account or not template or account.status not in {AccountStatus.active, AccountStatus.rate_limited}:
        return

    limiter = AccountRateLimiter(redis_client)
    if not await limiter.can_send(account):
        account.status = AccountStatus.rate_limited
        await session.commit()
        return

    query = select(Group).where(
        Group.user_id == campaign.user_id,
        Group.account_id == campaign.account_id,
        Group.is_excluded.is_(False),
    )
    groups = (await session.execute(query.limit(50))).scalars().all()
    if campaign.target_tags:
        wanted = set(campaign.target_tags)
        groups = [group for group in groups if wanted.intersection(set(group.tags or []))]

    client = build_client(account)
    min_delay, max_delay = await limiter.delay_bounds()
    async with client:
        for group in groups:
            if campaign.status != CampaignStatus.active:
                break
            if not await limiter.can_send(account):
                break
            log = DeliveryLog(
                user_id=campaign.user_id,
                campaign_id=campaign.id,
                account_id=account.id,
                group_id=group.id,
            )
            try:
                text = render_template(template.body, group.title)
                await client.send_message(group.telegram_chat_id, text)
                log.status = DeliveryStatus.sent
                campaign.sent_count += 1
                account.status = AccountStatus.active
                await limiter.record_send(account)
            except FloodWaitError as exc:
                log.status = DeliveryStatus.failed
                log.error = f"FloodWait: {exc.seconds}s"
                log.flood_wait_seconds = exc.seconds
                account.status = AccountStatus.rate_limited
                account.flood_wait_until = datetime.now(UTC) + timedelta(seconds=exc.seconds)
                session.add(log)
                await session.commit()
                break
            except UnauthorizedError:
                log.status = DeliveryStatus.failed
                log.error = "Telegram session unauthorized"
                account.status = AccountStatus.disconnected
                campaign.status = CampaignStatus.paused
            except Exception as exc:
                log.status = DeliveryStatus.failed
                log.error = str(exc)[:1000]
                campaign.failed_count += 1
            session.add(log)
            await session.commit()
            await asyncio.sleep(random.randint(min_delay, max_delay))
