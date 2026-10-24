from __future__ import annotations

import os

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_ALGORITHM = "HS256"
# Long-lived by design: single-active-session enforcement (users.session_id)
# is the real security backstop, not token expiry -- a token stops working
# immediately if the account logs in anywhere else, long before this expiry
# would ever matter. 90 days so people rarely see a login screen.
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", str(90 * 24)))
# Short-lived token for the password-verified-but-2FA-pending step between
# /auth/login and /auth/login/totp (or /auth/totp/setup/confirm).
PRE_AUTH_TOKEN_EXPIRE_SECONDS = 300

CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
] or ["*"]
