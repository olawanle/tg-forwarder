# Telegram + Discord Group Forwarder

Broadcast one marketing message to **every Telegram group** on your account (Telethon user session) and optionally to Discord channels (bot). Runs as a background job so you can leave the page, reload, or watch progress from another device.

## Quick start (local)

```bash
python -m pip install -r requirements.txt
cp .env.example .env
# fill TELEGRAM_API_ID, TELEGRAM_API_HASH (from https://my.telegram.org)
streamlit run forwarder/app.py
```

Optional: create a Telethon string session for Railway:

```bash
export TELEGRAM_API_ID=12345
export TELEGRAM_API_HASH=your_hash
python -m forwarder.bootstrap_telegram
```

Paste the printed value into `TELEGRAM_SESSION`.

## Deploy on Railway (fork-friendly)

1. Fork or clone this repo on GitHub.
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Open the service → **Settings**:
   - **Build**: Builder = **Dockerfile** (path `Dockerfile` — default).
   - **Deploy**: **clear any custom Start Command** (leave empty). The image `entrypoint.sh` sets the port from `$PORT`.
4. **Variables** (Variables tab):

   | Variable | Required | Notes |
   |----------|----------|--------|
   | `TELEGRAM_API_ID` | yes | my.telegram.org |
   | `TELEGRAM_API_HASH` | yes | my.telegram.org |
   | `TELEGRAM_SESSION` | yes for prod | from `python -m forwarder.bootstrap_telegram` |
   | `DISCORD_BOT_TOKEN` | optional | Discord bot token |
   | `OWNER_PASSWORD` | recommended | locks the UI |
   | `FORWARDER_DATA_DIR` | optional | default `/app/data` |

5. **Networking** → Generate domain.
6. Open the URL → **Connect** → **Compose** → **Start background broadcast**.

### Fixing Bad Gateway / port errors

| Symptom | Fix |
|---------|-----|
| Bad Gateway | Deploy Logs usually show a crash. Clear custom **Start Command**. |
| `'$PORT' is not a valid integer` | Something is overriding the Docker entrypoint. Delete Start Command; redeploy. |
| `No module named streamlit` | Builder is Nixpacks. Set Builder to **Dockerfile**. |
| Works after refresh | Free plan cold start — wait ~30s and reload. |

Optional volume: mount at `/data`, set `FORWARDER_DATA_DIR=/data` so SQLite survives redeploys.

## App pages

| Page | Purpose |
|------|---------|
| Connect | Telegram login / session + Discord bot status |
| Targets | Preview groups, manage blacklist, Discord channel picks |
| Compose | Message + start/cancel background broadcast |
| Progress | Live job status (works from any device) |
| Log | Send history |

## How Telegram sending works

- Sends to **all groups/supergroups** on the account (not DMs / broadcast channels).
- Skips Stars / paid-message groups and blacklists them.
- Detects posts wiped by anti-spam and blacklists those groups.
- Honors slowmode / FloodWait up to your max wait setting.
- One click = one full run, then stops until you start again.

## Discord

Create a bot at https://discord.com/developers/applications, invite with **Send Messages**, set `DISCORD_BOT_TOKEN`, select channels under Targets.

## Compliance

Only post where you have permission. Mass spam violates Telegram/Discord rules and can get accounts banned.

## Project layout

```
forwarder/           # Streamlit app + Telegram/Discord services
Dockerfile           # Production image
entrypoint.sh        # Expands PORT safely for Railway
requirements.txt
.env.example
railway.toml
```
