#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash tests/run_v23_alpha_verification.sh

PORT="${SOLAR_BROWSER_PORT:-8000}"
DB_PATH="${SOLAR_BROWSER_DB:-$(mktemp -u /tmp/solar-v23-browser-XXXXXX.sqlite3)}"
SERVER_LOG="${SOLAR_BROWSER_SERVER_LOG:-/tmp/solar-v23-browser-server.log}"
python3 solar_pv_design_platform_v2.1_server.py --host 127.0.0.1 --port "$PORT" --db "$DB_PATH" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  rm -f "$DB_PATH" "$DB_PATH-shm" "$DB_PATH-wal"
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if python3 - "$PORT" <<'PY' >/dev/null 2>&1
import sys, urllib.request
port=sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/solar-pv/health", timeout=1) as r:
    assert r.status == 200
PY
  then
    break
  fi
  sleep 1
done

python3 tests/test_v23_alpha_browser_smoke.py --base-url "http://127.0.0.1:${PORT}/index.html"
echo "ALL V2.3 ALPHA RELEASE GATES PASSED (INCLUDING REAL-BROWSER GATE 4)"
