from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import Channel, Chat

from backend.app.models import Account, Group
from telethon_client.client import build_client


async def refresh_groups(session: AsyncSession, account: Account) -> int:
    client = build_client(account)
    imported = 0
    async with client:
        async for dialog in client.iter_dialogs():
            entity = dialog.entity
            if not isinstance(entity, (Channel, Chat)) or not (dialog.is_group or dialog.is_channel):
                continue
            group = Group(
                user_id=account.user_id,
                account_id=account.id,
                telegram_chat_id=entity.id,
                title=dialog.name,
                username=getattr(entity, "username", None),
            )
            await session.merge(group)
            imported += 1
    await session.commit()
    return imported
