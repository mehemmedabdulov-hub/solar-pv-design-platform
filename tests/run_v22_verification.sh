#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== SOLAR v2.2 protected v2.1 regression baseline =="
bash tests/run_v21_verification.sh

echo "== SOLAR v2.2 drawing model =="
node tests/test_v22_sld_model.js

echo "== SOLAR v2.2 panel command history =="
node tests/test_v22_panel_history.js

echo "== SOLAR v2.2 exports =="
node tests/test_v22_exports.js
python3 tests/test_v22_pack_zip.py

echo "== SOLAR v2.2 static / compatibility wiring =="
python3 tests/test_v22_static.py
python3 tests/test_v22_server_assets.py

echo "ALL V2.2 VERIFICATION CHECKS PASSED"
