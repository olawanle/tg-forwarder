from __future__ import annotations

import base64
from io import BytesIO

import qrcode


def qr_data_uri(data: str) -> str:
    """PNG QR code for `data`, inline as a data: URI so the frontend can
    just drop it into an <img src> with no separate asset/endpoint."""
    img = qrcode.make(data)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
