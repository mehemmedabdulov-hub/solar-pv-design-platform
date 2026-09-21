#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "SOURCE_MANIFEST_SHA256_V1.9_FROZEN.txt"

# These calculation/repository/runtime files must remain byte-identical to the
# frozen v1.9 source-only release. index.html and test_v19_static.py are excluded
# because the v2 shell/version migration intentionally changes those integration
# surfaces while retaining the underlying v1.9 modules.
FROZEN_RUNTIME_FILES = [
    "solar_pv_design_platform_v1.9_core.js",
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v1.9_layout.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v1.9_electrical.js",
    "solar_pv_design_platform_v1.9_energy.js",
    "solar_pv_design_platform_v1.9_worker.js",
    "solar_pv_design_platform_v1.9_server.py",
    "README_V1.9.md",
    "V1.9_RELEASE_NOTES.md",
    "tests/test_v19_rulepacks.js",
    "tests/test_v19_server.py",
    "tests/ACCEPTANCE_RESULTS_v1.9.txt",
]

manifest = {}
for raw in MANIFEST.read_text(encoding="utf-8").splitlines():
    raw = raw.strip()
    if not raw:
        continue
    digest, filename = raw.split(None, 1)
    manifest[filename.strip()] = digest

checked = {}
for filename in FROZEN_RUNTIME_FILES:
    assert filename in manifest, f"{filename} missing from frozen v1.9 manifest"
    path = ROOT / filename
    assert path.is_file(), f"Frozen v1.9 file missing: {filename}"
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    expected = manifest[filename]
    assert actual == expected, f"Frozen v1.9 drift in {filename}: expected {expected}, got {actual}"
    checked[filename] = actual

print({
    "ok": True,
    "frozenV19FilesVerified": len(checked),
    "v19RuleEngineSha256": checked["solar_pv_design_platform_v1.9_rules.js"],
    "v19ElectricalSha256": checked["solar_pv_design_platform_v1.9_electrical.js"],
    "v19ServerSha256": checked["solar_pv_design_platform_v1.9_server.py"],
})
