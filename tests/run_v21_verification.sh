#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

printf '%s\n' '=== v2.1 independent calculation regression suite ==='
node tests/test_v21_calculation_regressions.js

printf '%s\n' '=== v2.1 static/runtime wiring suite ==='
python3 tests/test_v21_static.py

printf '%s\n' '=== v2.1 server/API suite ==='
python3 tests/test_v21_server.py

printf '%s\n' '=== retained frozen-v1.9 source hash verification ==='
python3 tests/test_v20_frozen_v19_hashes.py

printf '%s\n' '=== retained v1.9 rule-pack regression suite ==='
node tests/test_v19_rulepacks.js

printf '%s\n' '=== retained v2.0 rule-pack contract suite ==='
node tests/test_v20_rulepacks.js

printf '%s\n' '=== retained v2.0 project migration suite ==='
node tests/test_v20_project_migration.js

printf '%s\n' '=== ALL V2.1 VERIFICATION CHECKS PASSED ==='
