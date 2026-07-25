from aiogram import F, Router
from aiogram.types import Message
from sqlalchemy import func, select

from backend.app.core.database import SessionLocal
from backend.app.models import Account, Campaign, CampaignStatus, DeliveryLog, DeliveryStatus, Group, User

router = Router()


@router.message(F.text == "Statistics")
async def stats(message: Message) -> None:
    async with SessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.telegram_id == message.from_user.id))
        ).scalar_one()

        async def count(stmt):
            return (await session.execute(stmt)).scalar() or 0

        text = "\n".join(
            [
                f"Accounts: {await count(select(func.count(Account.id)).where(Account.user_id == user.id))}",
                f"Groups: {await count(select(func.count(Group.id)).where(Group.user_id == user.id))}",
                f"Active campaigns: {await count(select(func.count(Campaign.id)).where(Campaign.user_id == user.id, Campaign.status == CampaignStatus.active))}",
                f"Successful deliveries: {await count(select(func.count(DeliveryLog.id)).where(DeliveryLog.user_id == user.id, DeliveryLog.status == DeliveryStatus.sent))}",
                f"Failed deliveries: {await count(select(func.count(DeliveryLog.id)).where(DeliveryLog.user_id == user.id, DeliveryLog.status == DeliveryStatus.failed))}",
            ]
        )
    await message.answer(text)
