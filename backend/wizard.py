"""In-memory state for the phone-login wizard between HTTP requests.

Mirrors the same pattern forwarder/job_runner.py already uses for in-process
state. A wizard step reconnects using the exact session string the previous
step returned (see forwarder/telegram_service.py submit_code/submit_password
docstrings) since Telegram ties the code — and later the 2FA check — to the
specific unauthorized session that requested it, not to the phone number.

Limitation: if the backend process restarts mid-wizard, the in-flight attempt
is lost and the user just starts over — same limitation the Streamlit version
already has via st.session_state.
"""

from __future__ import annotations

import time

WIZARD_STORE: dict[str, dict] = {}
_TTL_SECONDS = 600


def sweep_expired() -> None:
    now = time.time()
    expired = [k for k, v in WIZARD_STORE.items() if now - v.get("created", 0) > _TTL_SECONDS]
    for k in expired:
        WIZARD_STORE.pop(k, None)
