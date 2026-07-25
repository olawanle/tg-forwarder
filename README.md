# Telegram Campaign Manager

> **Looking for the simple free-hostable broadcaster?** See **[FORWARDER.md](FORWARDER.md)** — Streamlit app for Telegram (user account) + Discord (bot) group broadcasts on Railway.

Multi-tenant SaaS-style Telegram campaign manager built with Python 3.12, FastAPI, Aiogram 3, Telethon, PostgreSQL, Redis, APScheduler, Docker, and a React dashboard.

Users manage their own Telegram accounts, groups, templates, schedules, campaigns, and delivery history through one Telegram bot and a web dashboard. Admins can inspect users, campaigns, server health, logs, and suspend accounts.

## Architecture

- `backend/` FastAPI API, auth, tenant-scoped CRUD, admin endpoints, security helpers.
- `bot/` Aiogram Telegram bot with main menu, account capture, templates, and stats.
- `telethon_client/` Telegram user-account authorization, session storage, group import.
- `services/` campaign engine, template renderer, account rate limiter, notifications, health monitor.
- `scheduler/` APScheduler worker that continuously processes active campaigns and recovers after restarts.
- `database/` Alembic migrations.
- `frontend/` React + Vite SaaS dashboard.
- `docker/` Nginx reverse proxy configuration.

## Security Model

- Every API query is scoped by `user_id`.
- Telegram API ID, API hash, and Telethon string sessions are encrypted with Fernet.
- JWT is used for web dashboard API access.
- Redis tracks per-account hourly and daily send counters.
- FloodWait exceptions pause sending and mark accounts as rate-limited.
- Admin role is assigned by `ADMIN_TELEGRAM_IDS`.
- Audit logging model is included for append-only operational events.

## Quick Start

1. Create a Telegram bot with BotFather and copy the bot token.
2. Generate a Fernet key:

   ```powershell
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

3. Copy `.env.example` to `.env` for Docker Compose, or copy `.env.local.example` to `.env` for local PowerShell runs.
4. Fill in `BOT_TOKEN`, `JWT_SECRET`, `FERNET_KEY`, and `ADMIN_TELEGRAM_IDS`.
5. Start the stack:

   ```powershell
   docker compose up --build
   ```

6. Open:

   - API: `http://localhost:8000/docs`
   - Dashboard: `http://localhost:5173`
   - Nginx entry: `http://localhost`

## Local Development

For local PowerShell runs, your database and Redis URLs must use `localhost`, not the Docker service names `postgres` and `redis`.

Copy the local env template:

```powershell
Copy-Item .env.local.example .env
```

Install Python dependencies:

```powershell
pip install -e ".[dev]"
```

Run PostgreSQL and Redis with Docker:

```powershell
docker compose up postgres redis
```

Check your local configuration:

```powershell
python scripts/check_local.py
```

Apply migrations:

```powershell
alembic -c database/alembic.ini upgrade head
```

Run services:

```powershell
uvicorn backend.app.main:app --reload
python -m bot.main
python -m scheduler.worker
```

Run the dashboard:

```powershell
cd frontend
npm install
npm run dev
```

Run tests:

```powershell
pytest
```

## Telegram Account Flow

The API supports the full Telethon login lifecycle:

1. `POST /api/accounts` stores encrypted API credentials and phone.
2. `POST /api/accounts/{account_id}/login-code` sends the Telegram login code.
3. `POST /api/accounts/{account_id}/complete-login` accepts `code`, `phone_code_hash`, and optional 2FA `password`, then stores the encrypted session.
4. `POST /api/accounts/{account_id}/refresh-groups` imports joined groups/channels.

The bot currently captures credentials and creates account records. The API endpoints are the production-safe place to complete the login flow; extending the bot to collect code/password uses the same service functions in `telethon_client/client.py`.

## Campaign Scheduling

Campaign schedule JSON can include:

```json
{
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "active_hours": ["09:00-17:00"],
  "min_delay_seconds": 45,
  "max_delay_seconds": 180,
  "cooldown_minutes": 30
}
```

Retry policy JSON can include:

```json
{
  "max_retries": 3,
  "retry_backoff_seconds": 300
}
```

The worker runs every minute, processes active campaigns, honors Redis counters, handles FloodWait, and resumes safely after container restarts.

## VPS Deployment Guide

1. Provision a VPS with Docker and Docker Compose.
2. Point your domain DNS A record to the VPS.
3. Clone or upload this project to `/opt/telegram-campaign-manager`.
4. Create `/opt/telegram-campaign-manager/.env` from `.env.example`.
5. Update `docker/nginx/default.conf` with your domain.
6. Start:

   ```bash
   docker compose up -d --build
   ```

7. Add TLS with your preferred reverse proxy or Certbot. For larger deployments, place API, bot, scheduler, PostgreSQL, and Redis on separate hosts or managed services.

## Scaling Notes

- Run multiple API replicas behind Nginx.
- Keep a single scheduler instance unless campaign jobs are moved to Celery/Redis queues.
- Move PostgreSQL and Redis to managed services for thousands of tenants.
- Partition delivery logs by time once volume grows.
- Add tenant-level billing, quotas, and webhook-based bot deployment when needed.

## Compliance Notes

Telegram does not permit spam or abusive automation. Use conservative rate limits, explicit user ownership, opt-in recipient policies, and stop sending immediately when accounts receive FloodWait or abuse signals.
