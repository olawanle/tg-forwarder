from telethon import TelegramClient
from telethon.sessions import StringSession

from backend.app.core.crypto import decrypt_text, encrypt_text
from backend.app.models import Account


def build_client(account: Account) -> TelegramClient:
    session = StringSession(decrypt_text(account.session_encrypted) if account.session_encrypted else "")
    return TelegramClient(
        session,
        int(decrypt_text(account.api_id_encrypted)),
        decrypt_text(account.api_hash_encrypted),
    )


async def send_login_code(account: Account) -> str:
    client = build_client(account)
    async with client:
        sent = await client.send_code_request(account.phone)
        return sent.phone_code_hash


async def complete_login(account: Account, code: str, phone_code_hash: str, password: str | None = None) -> str:
    client = build_client(account)
    async with client:
        try:
            await client.sign_in(account.phone, code=code, phone_code_hash=phone_code_hash)
        except Exception as exc:
            if password:
                await client.sign_in(password=password)
            else:
                raise exc
        return encrypt_text(client.session.save())
