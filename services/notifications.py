from aiogram import Bot

from backend.app.core.config import get_settings
from backend.app.models import User


async def notify_user(user: User, message: str) -> None:
    bot = Bot(get_settings().bot_token)
    try:
        await bot.send_message(user.telegram_id, message)
    finally:
        await bot.session.close()
