from __future__ import annotations

import asyncio
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import redis.asyncio as redis
from sqlalchemy import text

from backend.app.core.config import get_settings
from backend.app.core.database import engine

# #region agent log
_DEBUG_LOG = Path(__file__).resolve().parents[1] / "debug-a05dc4.log"


def _agent_log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    payload = {
        "sessionId": "a05dc4",
        "runId": "post-fix",
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    with _DEBUG_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload) + "\n")


# #endregion


async def main() -> None:
    settings = get_settings()
    db = urlparse(settings.database_url)
    cache = urlparse(settings.redis_url)

    print("Configuration")
    print(f"  database host: {db.hostname}:{db.port or 5432}")
    print(f"  database name: {db.path.lstrip('/')}")
    print(f"  redis host: {cache.hostname}:{cache.port or 6379}")
    print(f"  environment: {settings.environment}")

    # #region agent log
    _agent_log(
        "H1",
        "check_local.py:config",
        "parsed connection hosts",
        {
            "db_hostname": db.hostname,
            "db_port": db.port,
            "db_path": db.path,
            "redis_hostname": cache.hostname,
            "redis_port": cache.port,
            "redis_path": cache.path,
            "environment": settings.environment,
            "missing_db_host": db.hostname is None,
            "missing_redis_host": cache.hostname is None,
            "uses_docker_service_name": db.hostname in {"postgres", "redis"}
            or cache.hostname in {"postgres", "redis"},
        },
    )
    # #endregion

    if db.hostname is None or cache.hostname is None:
        print("\nWarning: DATABASE_URL or REDIS_URL is missing a host.")
        print("  For local PowerShell runs, use .env.local.example values with host 'localhost'.")
    elif db.hostname == "postgres":
        print("\nWarning: DATABASE_URL uses host 'postgres'.")
        print("  That only works inside docker compose.")
        print("  For local PowerShell runs, use .env.local.example values with host 'localhost'.")

    print("\nChecking Docker/WSL...")
    try:
        docker = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            text=True,
            capture_output=True,
            timeout=20,
        )
        if docker.returncode == 0:
            print(f"  Docker engine: ok ({docker.stdout.strip()})")
            # #region agent log
            _agent_log(
                "H2",
                "check_local.py:docker",
                "docker engine status",
                {"ok": True, "version": docker.stdout.strip()},
            )
            # #endregion
        else:
            err = docker.stderr.strip() or docker.stdout.strip()
            print(f"  Docker engine: failed - {err}")
            # #region agent log
            _agent_log(
                "H2",
                "check_local.py:docker",
                "docker engine status",
                {"ok": False, "error": err[:300]},
            )
            # #endregion
    except Exception as exc:
        print(f"  Docker engine: failed - {exc}")
        # #region agent log
        _agent_log(
            "H2",
            "check_local.py:docker",
            "docker engine status",
            {"ok": False, "error": str(exc)[:300]},
        )
        # #endregion

    try:
        wsl = subprocess.run(["wsl", "-l", "-v"], text=True, capture_output=True, timeout=20)
        wsl_text = (wsl.stdout + wsl.stderr).replace("\x00", "")
        if "has no installed distributions" in wsl_text:
            print("  WSL: no Linux distributions installed")
            print("  Install one with: wsl --install -d Ubuntu")
            # #region agent log
            _agent_log("H3", "check_local.py:wsl", "wsl status", {"ok": False, "reason": "no_distro"})
            # #endregion
        elif wsl.returncode == 0:
            print("  WSL: ok")
            # #region agent log
            _agent_log("H3", "check_local.py:wsl", "wsl status", {"ok": True})
            # #endregion
        else:
            print(f"  WSL: failed - {wsl_text.strip()}")
            # #region agent log
            _agent_log(
                "H3",
                "check_local.py:wsl",
                "wsl status",
                {"ok": False, "reason": wsl_text.strip()[:300]},
            )
            # #endregion
    except Exception as exc:
        print(f"  WSL: failed - {exc}")
        # #region agent log
        _agent_log("H3", "check_local.py:wsl", "wsl status", {"ok": False, "reason": str(exc)[:300]})
        # #endregion

    print("\nChecking PostgreSQL...")
    try:
        async with engine.connect() as conn:
            await conn.execute(text("select 1"))
        print("  PostgreSQL: ok")
        # #region agent log
        _agent_log("H4", "check_local.py:postgres", "postgres connect", {"ok": True})
        # #endregion
    except Exception as exc:
        print(f"  PostgreSQL: failed - {exc}")
        # #region agent log
        _agent_log(
            "H4",
            "check_local.py:postgres",
            "postgres connect",
            {"ok": False, "error_type": type(exc).__name__, "error": str(exc)[:300]},
        )
        # #endregion

    print("\nChecking Redis...")
    client = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await client.ping()
        print("  Redis: ok")
        # #region agent log
        _agent_log("H5", "check_local.py:redis", "redis connect", {"ok": True})
        # #endregion
    except Exception as exc:
        print(f"  Redis: failed - {exc}")
        # #region agent log
        _agent_log(
            "H5",
            "check_local.py:redis",
            "redis connect",
            {"ok": False, "error_type": type(exc).__name__, "error": str(exc)[:300]},
        )
        # #endregion
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
