FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt ./backend-requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r backend-requirements.txt

COPY forwarder ./forwarder
COPY backend ./backend

ENV PYTHONUNBUFFERED=1

# Real shell (not exec-form) so $PORT expands — a bare exec-form CMD passes
# the literal string "$PORT" through unexpanded on Railway, the same PORT
# footgun the Streamlit service's entrypoint.sh was built to avoid.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
