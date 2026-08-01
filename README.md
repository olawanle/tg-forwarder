# Telegram + Discord Group Forwarder

Multi-user broadcast tool: each logged-in user can hold one or more Telegram **profiles**
(Telethon user sessions) and broadcast one marketing message to every group on that account,
plus optionally to selected Discord channels. Runs as a background job per profile, so you can
leave the page, reload, or watch progress from another device — and different users'/profiles'
broadcasts never block each other.

Access is admin-gated: only the admin (`goconnect234@gmail.com` by default) can create accounts.
There is no self-registration.

## Quick start (local)

```bash
python -m pip install -r requirements.txt
cp .env.example .env
# fill TELEGRAM_API_ID, TELEGRAM_API_HASH (from https://my.telegram.org),
# DATABASE_URL (a local/dev Postgres), SESSION_ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD
streamlit run forwarder/app.py
```

On first boot the app creates the admin account from `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD` if
no admin exists yet. Log in as the admin, then use the **Admin** page to create accounts for
everyone else — each person gets an email + temporary password that you share with them
directly (there's no email/SMTP integration). They log in, are forced to set a real password,
then add their own Telegram profile(s).

## Adding a Telegram profile

**Recommended — log in with a phone number, right in the app.** On the Connect page, "Add a
profile — log in with your phone number" walks through the same phone + code flow Telegram
itself uses to add a new device. Works from a single mobile browser, no computer or script
needed. Each step reconnects using the exact (still-unauthorized) session string the previous
step returned instead of a fresh one — that's what makes it reliable across Streamlit reruns,
unlike an earlier version of this flow that lost the login mid-way.

**Advanced — generate a session string locally.** For technical users who'd rather not type a
Telegram login code into a web form, or want to move an existing session between environments.

Windows PowerShell:

```powershell
.\generate_session.ps1
```

macOS/Linux:

```bash
chmod +x generate_session.sh
./generate_session.sh
```

The wizard:

- prompts for API ID/hash when they are not already in `.env`
- keeps Telegram's code and `phone_code_hash` in one connected process
- retries invalid codes and handles 2FA separately
- validates the logged-in account before printing anything
- supports QR login:

```powershell
.\generate_session.ps1 --qr
```

You can save the result directly to a gitignored local `.env`:

```powershell
.\generate_session.ps1 --write-env
```

Paste the printed session string into the app's Connect page under "Advanced: paste an existing
session string" — not into a Railway variable. Treat this value like a password: anyone with it
can access the Telegram account. It's stored encrypted in the database, never in plaintext.

## Deploy on Railway (fork-friendly)

1. Fork or clone this repo on GitHub.
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Add a **Postgres** database to the project (Railway plugin).
4. Open the app service → **Settings**:
   - **Build**: Builder = **Dockerfile** (path `Dockerfile` — default).
   - **Deploy**: **clear any custom Start Command** (leave empty). The image `entrypoint.sh` sets the port from `$PORT`.
5. **Variables** (Variables tab):

   | Variable | Required | Notes |
   |----------|----------|--------|
   | `TELEGRAM_API_ID` | yes | my.telegram.org — shared "which app" credentials for all profiles |
   | `TELEGRAM_API_HASH` | yes | my.telegram.org |
   | `DATABASE_URL` | yes | Railway does **not** auto-share this across services — set it to `${{Postgres.DATABASE_URL}}` (replace `Postgres` with your DB service's name if you renamed it) |
   | `SESSION_ENCRYPTION_KEY` | yes | generate once: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
   | `ADMIN_EMAIL` | yes | e.g. `goconnect234@gmail.com` — becomes the first admin on boot |
   | `ADMIN_INITIAL_PASSWORD` | yes | admin's own login password, only used once to bootstrap the account |
   | `DISCORD_BOT_TOKEN` | optional | Discord bot token, shared by all users |

6. **Networking** → Generate domain.
7. Open the URL → log in as the admin → **Admin** page → create accounts for your friends →
   each person adds their own profile(s) from **Connect**.

### Locked out of the admin account

`ADMIN_INITIAL_PASSWORD` is only read once, the moment the admin row is first
created — changing it afterwards does nothing on its own. If you lose that
password or the account gets deactivated:

1. In Railway → forwarder service → Variables, set `ADMIN_INITIAL_PASSWORD` to
   the new password you want and add `ADMIN_FORCE_PASSWORD_RESET=true`.
2. Redeploy (or wait for the restart). On boot the app reissues the admin's
   password to that value, reactivates the account if needed, and forces a
   password change on next login.
3. Log in with `ADMIN_EMAIL` + the new password, then **remove**
   `ADMIN_FORCE_PASSWORD_RESET`  (or set it back to `false`) so the reset
   doesn't reapply on every future boot.

### Fixing Bad Gateway / port errors

| Symptom | Fix |
|---------|-----|
| Bad Gateway | Deploy Logs usually show a crash. Clear custom **Start Command**. |
| `'$PORT' is not a valid integer` | Something is overriding the Docker entrypoint. Delete Start Command; redeploy. |
| `No module named streamlit` | Builder is Nixpacks. Set Builder to **Dockerfile**. |
| Works after refresh | Free plan cold start — wait ~30s and reload. |

## App pages

| Page | Purpose |
|------|---------|
| Connect | Add/switch Telegram profiles, Discord bot status |
| Targets | Preview groups, manage blacklist, Discord channel picks (per profile) |
| Compose | Message + start/cancel background broadcast (per profile) |
| Progress | Live job status for the active profile (works from any device) |
| Log | Send history (per profile) |
| Admin | Admin-only: create/deactivate users, reset passwords, view profile labels |

## Multi-user model

- **Users** log in with email + password. Only the admin can create accounts (Admin page) — no
  self-registration.
- **Profiles** belong to a user. A profile is one Telegram session; a user can add several (e.g.
  to run broadcasts from more than one Telegram account) and switch the active one from the
  sidebar or Connect page.
- Broadcasts, blacklists, drafts, and send logs are all scoped **per profile** — different
  profiles (even for the same user) don't see each other's data, and their background jobs run
  concurrently without blocking one another.
- Discord stays a single bot/token shared app-wide (not per-user).

## How Telegram sending works

- Sends to **all groups/supergroups** on the active profile's account (not DMs / broadcast channels).
- Skips Stars / paid-message groups and blacklists them.
- Detects posts wiped by anti-spam and blacklists those groups.
- Honors slowmode / FloodWait up to your max wait setting.
- One click = one full run per profile, then stops until you start again.

## Discord

Create a bot at https://discord.com/developers/applications, invite with **Send Messages**,
set `DISCORD_BOT_TOKEN`, select channels per profile under Targets.

## Compliance

Only post where you have permission. Mass spam violates Telegram/Discord rules and can get accounts banned.

## Project layout

```
forwarder/           # Streamlit app + Telegram/Discord services + auth/admin
Dockerfile           # Production image
entrypoint.sh        # Expands PORT safely for Railway
requirements.txt
.env.example
railway.toml
```
