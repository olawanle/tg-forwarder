from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models import Account, AccountStatus
from services.notifications import notify_user


async def account_health_snapshot(session: AsyncSession) -> list[Account]:
    result = await session.execute(
        select(Account).where(
            Account.status.in_([AccountStatus.rate_limited, AccountStatus.disconnected]),
        ).options(selectinload(Account.user))
    )
    accounts = result.scalars().all()
    for account in accounts:
        account.last_health_check_at = datetime.now(UTC)
        if account.user:
            await notify_user(
                account.user,
                f"Account health warning for {account.label}: {account.status.value}.",
            )
    await session.commit()
    return accounts
