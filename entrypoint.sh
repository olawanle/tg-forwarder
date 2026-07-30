#!/bin/sh
set -e

# Railway injects PORT. Expand it here in a real shell — never rely on a
# Railway "Start Command" that passes the literal string $PORT to Streamlit.
PORT="${PORT:-8080}"
DATA_DIR="${FORWARDER_DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"
export FORWARDER_DATA_DIR="$DATA_DIR"

echo "Starting Streamlit on 0.0.0.0:${PORT} (data: ${DATA_DIR})"

exec streamlit run forwarder/app.py \
  --server.port="${PORT}" \
  --server.address=0.0.0.0 \
  --server.headless=true \
  --browser.gatherUsageStats=false \
  --server.enableCORS=false \
  --server.enableXsrfProtection=false
