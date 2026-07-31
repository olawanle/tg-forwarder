"""Reliable interactive Telegram StringSession generator."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
from pathlib import Path

import qrcode
from dotenv import load_dotenv, set_key
from telethon import TelegramClient
from telethon.errors import (
    AuthTokenExpiredError,
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate and validate TELEGRAM_SESSION for Railway."
    )
    parser.add_argument(
        "--qr",
        action="store_true",
        help="Log in by scanning a QR code instead of entering a phone code.",
    )
    parser.add_argument(
        "--phone",
        help="Phone number in international format (example: +15551234567).",
    )
    parser.add_argument(
        "--write-env",
        nargs="?",
        const=".env",
        metavar="PATH",
        help="Save TELEGRAM_SESSION to an env file (default: .env).",
    )
    return parser.parse_args()


def _credentials() -> tuple[int, str]:
    load_dotenv()
    raw_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()

    if not raw_id:
        raw_id = input("Telegram API ID (from my.telegram.org): ").strip()
    if not api_hash:
        api_hash = getpass.getpass("Telegram API hash (input hidden): ").strip()
    if not raw_id.isdigit():
        raise SystemExit("TELEGRAM_API_ID must be a number.")
    if not api_hash:
        raise SystemExit("TELEGRAM_API_HASH is required.")
    return int(raw_id), api_hash


async def _password_login(client: TelegramClient) -> None:
    for attempt in range(1, 4):
        password = getpass.getpass("Telegram 2FA password (input hidden): ")
        try:
            await client.sign_in(password=password)
            return
        except PasswordHashInvalidError:
            print(f"Incorrect 2FA password ({attempt}/3).")
    raise RuntimeError("Too many incorrect 2FA password attempts.")


async def _phone_login(client: TelegramClient, phone_arg: str | None) -> None:
    phone = (phone_arg or input("Phone (+country code, e.g. +15551234567): ")).strip()
    try:
        sent = await client.send_code_request(phone)
    except PhoneNumberInvalidError as exc:
        raise RuntimeError("Telegram rejected that phone number. Include +country code.") from exc

    print("Code sent by Telegram (usually inside the Telegram app, not SMS).")
    for attempt in range(1, 4):
        code = input("Login code: ").replace(" ", "").replace("-", "").strip()
        try:
            await client.sign_in(
                phone=phone,
                code=code,
                phone_code_hash=sent.phone_code_hash,
            )
            return
        except SessionPasswordNeededError:
            await _password_login(client)
            return
        except PhoneCodeInvalidError:
            print(f"Invalid code ({attempt}/3). Try again without spaces.")
        except PhoneCodeExpiredError as exc:
            raise RuntimeError("The code expired. Run the generator again for a new code.") from exc
    raise RuntimeError("Too many invalid code attempts.")


async def _qr_login(client: TelegramClient) -> None:
    print(
        "On your phone: Telegram > Settings > Devices > Link Desktop Device, "
        "then scan this QR code.\n"
    )
    for _ in range(3):
        login = await client.qr_login()
        qr = qrcode.QRCode(border=1)
        qr.add_data(login.url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        try:
            await login.wait(timeout=120)
            return
        except SessionPasswordNeededError:
            await _password_login(client)
            return
        except (asyncio.TimeoutError, AuthTokenExpiredError):
            print("QR expired; generating a new one…")
            continue
    raise RuntimeError("QR login timed out three times.")


async def generate_session(args: argparse.Namespace) -> tuple[str, str]:
    api_id, api_hash = _credentials()
    client = TelegramClient(StringSession(), api_id, api_hash)
    try:
        await client.connect()
        if args.qr:
            await _qr_login(client)
        else:
            await _phone_login(client, args.phone)

        if not await client.is_user_authorized():
            raise RuntimeError("Telegram login finished but the session is not authorized.")
        me = await client.get_me()
        session = client.session.save()
        if not session:
            raise RuntimeError("Telethon returned an empty session.")
        display = " ".join(filter(None, [me.first_name, me.last_name]))
        return session, display or me.username or str(me.id)
    finally:
        await client.disconnect()


def main() -> None:
    args = _args()
    try:
        session, account = asyncio.run(generate_session(args))
    except FloodWaitError as exc:
        raise SystemExit(f"Telegram rate-limited login. Wait {exc.seconds} seconds, then retry.")
    except (KeyboardInterrupt, EOFError):
        raise SystemExit("\nCancelled.")
    except Exception as exc:
        raise SystemExit(f"\nSession generation failed: {exc}")

    print(f"\nValidated Telegram session for: {account}")
    if args.write_env:
        env_path = Path(args.write_env)
        if not env_path.exists():
            env_path.touch()
        set_key(str(env_path), "TELEGRAM_SESSION", session)
        print(f"Saved TELEGRAM_SESSION to {env_path.resolve()}")
        print("Do not commit this file; the session grants access to your account.")
    else:
        print("\nCopy this entire value into Railway as TELEGRAM_SESSION:\n")
        print(session)
        print("\nKeep it secret. Anyone with this value can access your Telegram account.")


if __name__ == "__main__":
    main()
