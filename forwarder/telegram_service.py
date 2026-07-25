from __future__ import annotations

import asyncio
from dataclasses import dataclass

from telethon import TelegramClient
from telethon.errors import FloodWaitError, SessionPasswordNeededError
from telethon.sessions import StringSession
from telethon.tl.types import Channel, Chat


@dataclass
class TelegramTarget:
    id: str
    name: str
    kind: str


@dataclass
class SendResult:
    target_id: str
    target_name: str
    status: str
    detail: str = ""


class TelegramService:
    def __init__(self, api_id: int | None, api_hash: str, session: str = "") -> None:
        self.api_id = api_id
        self.api_hash = api_hash
        self.session = session

    def configured(self) -> bool:
        return bool(self.api_id and self.api_hash)

    def has_session(self) -> bool:
        return bool(self.session)

    def _client(self) -> TelegramClient:
        if not self.api_id or not self.api_hash:
            raise RuntimeError("TELEGRAM_API_ID and TELEGRAM_API_HASH are required")
        return TelegramClient(StringSession(self.session or ""), self.api_id, self.api_hash)

    async def status(self) -> dict[str, str | bool]:
        if not self.configured():
            return {"ok": False, "detail": "Missing TELEGRAM_API_ID / TELEGRAM_API_HASH"}
        if not self.has_session():
            return {"ok": False, "detail": "No TELEGRAM_SESSION yet — complete login"}
        client = self._client()
        try:
            await client.connect()
            if not await client.is_user_authorized():
                return {"ok": False, "detail": "Session is not authorized"}
            me = await client.get_me()
            name = " ".join(filter(None, [me.first_name, me.last_name])) or (me.username or str(me.id))
            return {"ok": True, "detail": f"Logged in as {name}"}
        except Exception as exc:
            return {"ok": False, "detail": str(exc)[:300]}
        finally:
            await client.disconnect()

    async def request_code(self, phone: str) -> tuple[str, str]:
        """Returns (phone_code_hash, updated_session_string)."""
        client = self._client()
        try:
            await client.connect()
            sent = await client.send_code_request(phone)
            self.session = client.session.save()
            return sent.phone_code_hash, self.session
        finally:
            await client.disconnect()

    async def complete_login(
        self,
        phone: str,
        code: str,
        phone_code_hash: str,
        password: str | None = None,
    ) -> str:
        client = self._client()
        try:
            await client.connect()
            try:
                await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash)
            except SessionPasswordNeededError:
                if not password:
                    raise RuntimeError("2FA password required")
                await client.sign_in(password=password)
            self.session = client.session.save()
            return self.session
        finally:
            await client.disconnect()

    async def list_groups(self) -> list[TelegramTarget]:
        client = self._client()
        targets: list[TelegramTarget] = []
        try:
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")
            async for dialog in client.iter_dialogs():
                entity = dialog.entity
                if isinstance(entity, Chat):
                    targets.append(
                        TelegramTarget(id=str(dialog.id), name=dialog.name or str(dialog.id), kind="group")
                    )
                elif isinstance(entity, Channel):
                    kind = "channel" if entity.broadcast else "supergroup"
                    targets.append(
                        TelegramTarget(id=str(dialog.id), name=dialog.name or str(dialog.id), kind=kind)
                    )
            targets.sort(key=lambda t: t.name.lower())
            return targets
        finally:
            await client.disconnect()

    async def broadcast(
        self,
        message: str,
        target_ids: list[str],
        delay_seconds: float,
        max_targets: int,
        name_lookup: dict[str, str] | None = None,
    ) -> list[SendResult]:
        if not message.strip():
            raise ValueError("Message is empty")
        selected = target_ids[:max_targets]
        name_lookup = name_lookup or {}
        results: list[SendResult] = []
        client = self._client()
        try:
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")
            for index, target_id in enumerate(selected):
                name = name_lookup.get(target_id, target_id)
                try:
                    await client.send_message(int(target_id), message)
                    results.append(SendResult(target_id, name, "ok", "sent"))
                except FloodWaitError as exc:
                    wait = int(exc.seconds) + 1
                    await asyncio.sleep(wait)
                    try:
                        await client.send_message(int(target_id), message)
                        results.append(
                            SendResult(target_id, name, "ok", f"sent after FloodWait {wait}s")
                        )
                    except Exception as retry_exc:
                        results.append(SendResult(target_id, name, "error", str(retry_exc)[:300]))
                except Exception as exc:
                    results.append(SendResult(target_id, name, "error", str(exc)[:300]))
                if index < len(selected) - 1 and delay_seconds > 0:
                    await asyncio.sleep(delay_seconds)
            return results
        finally:
            await client.disconnect()
