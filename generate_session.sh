#!/bin/sh
set -e

cd "$(dirname "$0")"

command -v python3 >/dev/null 2>&1 || {
  echo "Python 3 was not found. Install Python 3.12+ first." >&2
  exit 1
}

echo "Installing session-generator dependencies..."
python3 -m pip install -q -r requirements.txt
echo
exec python3 -m forwarder.bootstrap_telegram "$@"
