import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from backend.app.core.config import get_settings
from bot.handlers import accounts, start, stats, templates


async def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)
    redis = Redis.from_url(settings.redis_url)
    dispatcher = Dispatcher(storage=RedisStorage(redis=redis))
    dispatcher.include_router(start.router)
    dispatcher.include_router(accounts.router)
    dispatcher.include_router(templates.router)
    dispatcher.include_router(stats.router)
    await dispatcher.start_polling(Bot(settings.bot_token))


if __name__ == "__main__":
    asyncio.run(main())
