from __future__ import annotations

import asyncio
from dataclasses import dataclass

import discord


@dataclass
class DiscordTarget:
    id: str
    name: str
    guild: str


@dataclass
class SendResult:
    target_id: str
    target_name: str
    status: str
    detail: str = ""


class DiscordService:
    def __init__(self, token: str) -> None:
        self.token = token

    def configured(self) -> bool:
        return bool(self.token)

    async def _with_client(self, work):
        if not self.token:
            raise RuntimeError("DISCORD_BOT_TOKEN is required")

        intents = discord.Intents.default()
        intents.guilds = True
        client = discord.Client(intents=intents)
        holder: dict = {}

        @client.event
        async def on_ready() -> None:
            try:
                holder["result"] = await work(client)
            except Exception as exc:  # noqa: BLE001 — surface to caller
                holder["error"] = exc
            finally:
                await client.close()

        await client.start(self.token)
        if "error" in holder:
            raise holder["error"]
        return holder.get("result")

    async def status(self) -> dict[str, str | bool | int]:
        if not self.configured():
            return {"ok": False, "detail": "Missing DISCORD_BOT_TOKEN", "guilds": 0}

        async def work(client: discord.Client):
            return {
                "ok": True,
                "detail": f"Bot online as {client.user}",
                "guilds": len(client.guilds),
            }

        try:
            return await self._with_client(work)
        except Exception as exc:
            return {"ok": False, "detail": str(exc)[:300], "guilds": 0}

    async def list_text_channels(self) -> list[DiscordTarget]:
        async def work(client: discord.Client) -> list[DiscordTarget]:
            targets: list[DiscordTarget] = []
            for guild in client.guilds:
                for channel in guild.text_channels:
                    me = guild.me
                    if me is None:
                        continue
                    perms = channel.permissions_for(me)
                    if not perms.send_messages:
                        continue
                    label = f"#{channel.name} ({guild.name})"
                    targets.append(
                        DiscordTarget(id=str(channel.id), name=label, guild=guild.name)
                    )
            targets.sort(key=lambda t: (t.guild.lower(), t.name.lower()))
            return targets

        return await self._with_client(work)

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

        async def work(client: discord.Client) -> list[SendResult]:
            results: list[SendResult] = []
            for index, target_id in enumerate(selected):
                name = name_lookup.get(target_id, target_id)
                channel = client.get_channel(int(target_id))
                if channel is None:
                    try:
                        channel = await client.fetch_channel(int(target_id))
                    except Exception as exc:
                        results.append(
                            SendResult(target_id, name, "error", f"channel not found: {exc}"[:300])
                        )
                        continue
                if not isinstance(channel, discord.TextChannel):
                    results.append(SendResult(target_id, name, "skipped", "not a text channel"))
                    continue
                me = channel.guild.me
                if me is None or not channel.permissions_for(me).send_messages:
                    results.append(
                        SendResult(target_id, name, "skipped", "missing Send Messages permission")
                    )
                    continue
                try:
                    await channel.send(message)
                    results.append(SendResult(target_id, name, "ok", "sent"))
                except discord.HTTPException as exc:
                    if exc.status == 429:
                        retry = float(getattr(exc, "retry_after", delay_seconds) or delay_seconds)
                        await asyncio.sleep(retry)
                        try:
                            await channel.send(message)
                            results.append(
                                SendResult(
                                    target_id, name, "ok", f"sent after rate limit {retry:.1f}s"
                                )
                            )
                        except Exception as retry_exc:
                            results.append(SendResult(target_id, name, "error", str(retry_exc)[:300]))
                    else:
                        results.append(SendResult(target_id, name, "error", str(exc)[:300]))
                except Exception as exc:
                    results.append(SendResult(target_id, name, "error", str(exc)[:300]))
                if index < len(selected) - 1 and delay_seconds > 0:
                    await asyncio.sleep(delay_seconds)
            return results

        return await self._with_client(work)
