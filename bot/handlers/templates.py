from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message
from sqlalchemy import select

from backend.app.core.database import SessionLocal
from backend.app.models import Template, TemplateKind, User
from services.templates import render_template

router = Router()


class NewTemplate(StatesGroup):
    name = State()
    body = State()


@router.message(F.text == "Message Templates")
async def templates_menu(message: Message, state: FSMContext) -> None:
    await state.set_state(NewTemplate.name)
    await message.answer("Send a template name. Variables: {group_name}, {date}, {time}.")


@router.message(NewTemplate.name)
async def template_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(NewTemplate.body)
    await message.answer("Send the template text.")


@router.message(NewTemplate.body)
async def template_body(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    async with SessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == message.from_user.id))
        ).scalar_one()
        template = Template(
            user_id=user.id,
            name=data["name"],
            kind=TemplateKind.text,
            body=message.text or "",
        )
        session.add(template)
        await session.commit()
    await state.clear()
    await message.answer("Saved. Preview:\n\n" + render_template(message.text or "", "Example Group"))
