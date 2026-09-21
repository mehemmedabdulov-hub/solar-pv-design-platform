#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== SOLAR v2.3 Alpha inherited v2.2 baseline =="
bash tests/run_v22_verification.sh

echo "== SOLAR v2.3 Alpha A1 location lifecycle =="
node tests/test_v23_alpha_location_guard.js

echo "== SOLAR v2.3 Alpha A2 installation migration =="
node tests/test_v23_alpha_installation_migration.js

echo "== SOLAR v2.3 Alpha A3 deliverable decoupling =="
node tests/test_v23_alpha_deliverable_decoupling.js

echo "== SOLAR v2.3 Alpha static / compatibility / protected baseline =="
python3 tests/test_v23_alpha_static.py
python3 tests/test_v23_alpha_protected.py
python3 tests/test_v23_alpha_server_assets.py

echo "ALL V2.3 ALPHA NON-BROWSER VERIFICATION CHECKS PASSED"
