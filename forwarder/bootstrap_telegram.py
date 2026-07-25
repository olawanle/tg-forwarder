"""One-shot CLI to create a Telethon string session for Railway.

Usage:
  set TELEGRAM_API_ID=...
  set TELEGRAM_API_HASH=...
  python -m forwarder.bootstrap_telegram
"""

from __future__ import annotations

import asyncio
import os

from telethon import TelegramClient
from telethon.sessions import StringSession


async def main() -> None:
    api_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    if not api_id.isdigit() or not api_hash:
        raise SystemExit("Set TELEGRAM_API_ID and TELEGRAM_API_HASH first")

    phone = input("Phone (international format, e.g. +15551234567): ").strip()
    client = TelegramClient(StringSession(), int(api_id), api_hash)
    await client.connect()
    await client.send_code_request(phone)
    code = input("Code from Telegram: ").strip()
    try:
        await client.sign_in(phone, code)
    except Exception:
        password = input("2FA password (if enabled): ").strip()
        await client.sign_in(password=password)

    session = client.session.save()
    await client.disconnect()
    print("\nTELEGRAM_SESSION (copy into Railway / .env):\n")
    print(session)


if __name__ == "__main__":
    asyncio.run(main())
