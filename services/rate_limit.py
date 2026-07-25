from datetime import UTC, datetime, timedelta

import redis.asyncio as redis

from backend.app.core.config import get_settings
from backend.app.models import Account


class AccountRateLimiter:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def can_send(self, account: Account) -> bool:
        now = datetime.now(UTC)
        if account.flood_wait_until and account.flood_wait_until > now:
            return False
        hour_key = f"rl:{account.id}:{now:%Y%m%d%H}"
        day_key = f"rl:{account.id}:{now:%Y%m%d}"
        hourly, daily = await self.redis.mget(hour_key, day_key)
        return int(hourly or 0) < account.hourly_limit and int(daily or 0) < account.daily_limit

    async def record_send(self, account: Account) -> None:
        now = datetime.now(UTC)
        hour_key = f"rl:{account.id}:{now:%Y%m%d%H}"
        day_key = f"rl:{account.id}:{now:%Y%m%d}"
        pipe = self.redis.pipeline()
        pipe.incr(hour_key)
        pipe.expire(hour_key, 3600)
        pipe.incr(day_key)
        pipe.expire(day_key, 86400)
        await pipe.execute()

    async def delay_bounds(self) -> tuple[int, int]:
        settings = get_settings()
        return settings.default_min_delay_seconds, settings.default_max_delay_seconds
