from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.crypto import encrypt_text
from backend.app.core.database import SessionLocal
from backend.app.models import Account, User

router = Router()


class ConnectAccount(StatesGroup):
    label = State()
    api_id = State()
    api_hash = State()
    phone = State()


@router.message(F.text == "Connect Telegram Account")
async def connect_account(message: Message, state: FSMContext) -> None:
    await state.set_state(ConnectAccount.label)
    await message.answer("Send a label for this Telegram account.")


@router.message(ConnectAccount.label)
async def account_label(message: Message, state: FSMContext) -> None:
    await state.update_data(label=message.text)
    await state.set_state(ConnectAccount.api_id)
    await message.answer("Send your Telegram API ID.")


@router.message(ConnectAccount.api_id)
async def account_api_id(message: Message, state: FSMContext) -> None:
    await state.update_data(api_id=message.text)
    await state.set_state(ConnectAccount.api_hash)
    await message.answer("Send your Telegram API HASH.")


@router.message(ConnectAccount.api_hash)
async def account_api_hash(message: Message, state: FSMContext) -> None:
    await state.update_data(api_hash=message.text)
    await state.set_state(ConnectAccount.phone)
    await message.answer("Send the phone number linked to this Telegram account.")


@router.message(ConnectAccount.phone)
async def account_phone(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    tg_user = message.from_user
    async with SessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == tg_user.id))
        ).scalar_one()
        account = Account(
            user_id=user.id,
            label=data["label"],
            phone=message.text,
            api_id_encrypted=encrypt_text(data["api_id"]),
            api_hash_encrypted=encrypt_text(data["api_hash"]),
            hourly_limit=get_settings().default_account_hourly_limit,
            daily_limit=get_settings().default_account_daily_limit,
        )
        session.add(account)
        await session.commit()
    await state.clear()
    await message.answer(
        "Account saved. Use the API login endpoints or extend this bot flow to request and submit the login code."
    )


@router.message(F.text == "My Accounts")
async def my_accounts(message: Message) -> None:
    async with SessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == message.from_user.id))
        ).scalar_one()
        accounts = (
            await session.execute(select(Account).where(Account.user_id == user.id))
        ).scalars().all()
    lines = [f"{a.label}: {a.status.value}" for a in accounts]
    await message.answer("\n".join(lines) if lines else "No connected accounts yet.")
