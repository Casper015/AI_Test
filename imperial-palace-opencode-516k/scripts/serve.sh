#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-8123}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "serving $ROOT at http://127.0.0.1:$PORT/"
python3 -m http.server "$PORT" --bind 127.0.0.1
