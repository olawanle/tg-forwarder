from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.models import User, UserRole
from bot.keyboards.menu import MAIN_MENU

router = Router()


@router.message(CommandStart())
async def start(message: Message) -> None:
    tg_user = message.from_user
    if not tg_user:
        return
    async with SessionLocal() as session:
        existing = (
            await session.execute(select(User).where(User.telegram_id == tg_user.id))
        ).scalar_one_or_none()
        role = UserRole.admin if tg_user.id in get_settings().admin_ids else UserRole.user
        if not existing:
            session.add(
                User(
                    telegram_id=tg_user.id,
                    username=tg_user.username,
                    full_name=tg_user.full_name,
                    role=role,
                )
            )
        await session.commit()
    await message.answer("Welcome to Telegram Campaign Manager.", reply_markup=MAIN_MENU)
