from __future__ import annotations

import anyio.to_thread
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from forwarder.auth import bootstrap_admin
from forwarder.config import get_settings
from forwarder.job_runner import get_job_runner
from forwarder.storage import API_POOL_MAXCONN, Storage

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
    # Every route below is a plain `def`, so FastAPI dispatches each call
    # through Starlette's sync threadpool executor -- which anyio caps at a
    # hardcoded 40 threads by default, independent of (and lower than) the
    # API connection pool's own 60. Under load that cap became the real
    # bottleneck: HTTP requests queued for a thread-pool slot while the DB
    # pool still had room, producing the same "CPU/DB idle, requests slow"
    # symptom pool-sizing alone couldn't explain. Match it to the pool size
    # so the thread pool is never the limiting factor below it.
    anyio.to_thread.current_default_thread_limiter().total_tokens = API_POOL_MAXCONN

    settings = get_settings()
    store = Storage(settings.database_url)
    bootstrap_admin(store, settings)
    runner = get_job_runner()
    runner.ensure_started(store)
    runner.start_scheduler()


@app.get("/health")
def health() -> dict:
    return {"ok": True}
