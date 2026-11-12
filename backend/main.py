from __future__ import annotations

import anyio.to_thread
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from forwarder.auth import bootstrap_admin
from forwarder.config import get_settings
from forwarder.job_runner import get_job_runner
from forwarder.storage import Storage

from backend import perfwatch
from backend.config import CORS_ORIGINS
from backend.routers import admin, auth, compose, profiles, progress, settings, targets

app = FastAPI(title="Group Forwarder API")

# Bearer-token auth (no cookies), so a wildcard origin is safe here — nothing
# credentialed rides on cookies for CORS to leak.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    # Every API call carries an Authorization header, so the browser must
    # preflight each distinct URL before using it. Let it remember the answer
    # for as long as browsers allow (Chrome caps at 2h) instead of the 10 min
    # default -- each preflight is a full extra round trip for the user.
    max_age=7200,
)

app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(targets.router)
app.include_router(compose.router)
app.include_router(progress.router)
app.include_router(admin.router)
app.include_router(settings.router)


@app.on_event("startup")
async def on_startup() -> None:
    # Sync routes run on Starlette's threadpool, capped at 40 threads by
    # default. Keep headroom above the DB pool so slow handlers (bcrypt
    # logins, admin stats) can't use up every thread polling needs.
    anyio.to_thread.current_default_thread_limiter().total_tokens = 60

    settings = get_settings()
    store = Storage(settings.database_url)
    bootstrap_admin(store, settings)
    runner = get_job_runner()
    runner.ensure_started(store)
    runner.start_scheduler()
    perfwatch.start()


@app.get("/health")
def health() -> dict:
    return {"ok": True}
