import asyncio
import logging

import redis.asyncio as redis
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.models import Campaign, CampaignStatus
from services.campaign_engine import process_campaign
from services.health_monitor import account_health_snapshot

logging.basicConfig(level=get_settings().log_level)
logger = logging.getLogger("campaign-worker")


async def run_due_campaigns() -> None:
    redis_client = redis.from_url(get_settings().redis_url, decode_responses=True)
    async with SessionLocal() as session:
        campaigns = (
            await session.execute(select(Campaign).where(Campaign.status == CampaignStatus.active))
        ).scalars().all()
        for campaign in campaigns:
            await process_campaign(session, redis_client, campaign)
    await redis_client.aclose()


async def health_monitor() -> None:
    async with SessionLocal() as session:
        accounts = await account_health_snapshot(session)
        if accounts:
            logger.warning("Accounts needing user attention: %s", len(accounts))


async def main() -> None:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(run_due_campaigns, "interval", seconds=60, max_instances=1, coalesce=True)
    scheduler.add_job(health_monitor, "interval", minutes=5, max_instances=1, coalesce=True)
    scheduler.start()
    logger.info("Scheduler started")
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
