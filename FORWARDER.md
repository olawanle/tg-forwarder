# Group Forwarder (Telegram + Discord)

Lean Streamlit app that broadcasts one designated message to selected Telegram groups (as **your user account** via Telethon) and Discord text channels (via a **Discord bot** you invite into each marketing server).

Deploy on **Railway** (always-on). The older FastAPI/React/Docker SaaS stack in this repo is separate and not required.

## Features

- Connect Telegram (API ID/hash + login code / 2FA) or paste a string session
- Connect Discord bot and list channels where it can send messages
- Multi-select targets, compose a message, broadcast with configurable delay
- FloodWait / Discord rate-limit handling and a simple SQLite send log

## Compliance

Only post in groups/servers where you have permission. Mass spam violates Telegram and Discord rules and can get accounts banned. Discord **user-account** automation (selfbots) is not supported — use a bot.

## Local run

```powershell
cd "c:\Users\Hp\OneDrive\Documents\tg message bot"
python -m pip install -r requirements-forwarder.txt
Copy-Item .env.forwarder.example .env   # then fill values
streamlit run forwarder/app.py
```

Optional: create a Telethon string session without the UI:

```powershell
$env:TELEGRAM_API_ID="12345"
$env:TELEGRAM_API_HASH="your_hash"
python -m forwarder.bootstrap_telegram
```

Paste the printed value into `TELEGRAM_SESSION`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_API_ID` | Yes | From https://my.telegram.org |
| `TELEGRAM_API_HASH` | Yes | From https://my.telegram.org |
| `TELEGRAM_SESSION` | Yes (prod) | Telethon string session |
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `OWNER_PASSWORD` | No | Gates the Streamlit UI if set |
| `FORWARDER_DATA_DIR` | No | SQLite directory (default `forwarder_data`) |
| `MAX_TARGETS_PER_RUN` | No | Default `50` |
| `DEFAULT_DELAY_SECONDS` | No | Default `8` |

## Discord bot setup

1. Create an application at https://discord.com/developers/applications
2. Add a Bot; copy the token → `DISCORD_BOT_TOKEN`
3. OAuth2 → URL Generator → scopes: `bot` → permissions: **Send Messages** (and View Channels)
4. Open the invite URL and add the bot to each marketing server

## Railway deploy

The live deployment is already provisioned:

| Item | Value |
|------|-------|
| Project | `tg-forwarder` |
| Service | `forwarder` (auto-deploys from `olawanle/tg-forwarder`, branch `main`) |
| URL | https://forwarder-production-bc52.up.railway.app |
| Build | Docker, [`Dockerfile.forwarder`](Dockerfile.forwarder) via `RAILWAY_DOCKERFILE_PATH` |
| Volume | `/data` (persists the SQLite database) |

Build note: the repo root also holds the legacy campaign-manager `pyproject.toml`, which Nixpacks picks up instead of Streamlit. [`Dockerfile.forwarder`](Dockerfile.forwarder) installs only `requirements-forwarder.txt`, so the build must stay on the Docker builder.

Free plan: `sleepApplication` is required, so the service sleeps while idle and wakes on the first request. Broadcasts are triggered from the UI, so this is fine — just allow a few seconds for the first page load. Free-tier deploys are also blocked during each region's peak hours (8:00–20:00 local), so redeploys may need an off-peak region.

To reproduce from scratch:

1. Push the repo to GitHub.
2. New Railway project → Deploy from repo.
3. Set variable `RAILWAY_DOCKERFILE_PATH=Dockerfile.forwarder` and use the Docker builder.
4. Add env vars from the table above (`TELEGRAM_*`, `DISCORD_BOT_TOKEN`, optional `OWNER_PASSWORD`).
5. Attach a volume mounted at `/data` and set `FORWARDER_DATA_DIR=/data`.
6. Generate a domain, then open it → Connect → Targets → Compose → Broadcast.

## App pages

1. **Connect** — Telegram login / session + Discord bot status  
2. **Targets** — refresh and multi-select groups/channels; save selection  
3. **Compose** — message, delay slider, Broadcast  
4. **Log** — recent send results  

## Layout

```
forwarder/
  app.py                 # Streamlit UI
  config.py
  storage.py             # SQLite selections + logs
  telegram_service.py
  discord_service.py
  bootstrap_telegram.py  # CLI session helper
requirements-forwarder.txt
Procfile
railway.toml
```
