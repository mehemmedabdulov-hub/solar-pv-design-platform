#!/usr/bin/env python3
from __future__ import annotations

"""Retained v1.9 static/module compatibility regression.

The unmodified v1.9 version of this test was executed before any v2 edits and its
result is recorded in BASELINE_RESULTS_BEFORE_V2_EDITS.txt. After the controlled
v2.0 Alpha 1 version migration, this test continues to verify that the frozen
v1.9 runtime modules are present, syntax-valid, and loaded in the established
relative order inside the v2 shell. Current-v2 shell assertions live in
`test_v20_static.py`.
"""

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
V19_JS = [
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v1.9_layout.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v1.9_electrical.js",
    "solar_pv_design_platform_v1.9_energy.js",
    "solar_pv_design_platform_v1.9_worker.js",
]

text = INDEX.read_text(encoding="utf-8")
assert '<meta name="application-version" content="2.0-alpha1">' in text
assert '<meta name="project-schema" content="2.0">' in text
assert "17. Engineering Rule Packs, Project Overlays &amp; Deterministic Audit" in text

for section in range(1, 18):
    assert re.search(rf"<h2>\s*{section}\.\s", text), f"Section {section} is missing"

script_refs = re.findall(r'<script[^>]+src="([^"]+)"', text, flags=re.I)
external = [ref for ref in script_refs if re.match(r"^https?://", ref)]
local_refs = [ref for ref in script_refs if not re.match(r"^https?://", ref)]
assert len(external) == 3, f"Unexpected external script dependency count: {external}"
for name in V19_JS[:-1]:
    assert name in local_refs, f"index.html no longer loads retained v1.9 module {name}"
for name in V19_JS:
    assert (ROOT / name).is_file(), f"Missing frozen v1.9 runtime module: {name}"

# Established calculation-module order remains repository -> geometry -> layout ->
# v1.9 rules -> v2 contract -> electrical -> energy. The formal contract is the
# only inserted module and remains after the frozen v1.9 rule engine.
required_order = [
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v1.9_layout.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v2.0_rulepacks.js",
    "solar_pv_design_platform_v1.9_electrical.js",
    "solar_pv_design_platform_v1.9_energy.js",
]
indices = [local_refs.index(name) for name in required_order]
assert indices == sorted(indices), f"Compatibility load order changed: {required_order}"

for name in V19_JS:
    subprocess.run(["node", "--check", str(ROOT / name)], check=True)
subprocess.run([sys.executable, "-m", "py_compile", str(ROOT / "solar_pv_design_platform_v1.9_server.py")], check=True)

# Frozen v1.9 core/server/rule identifiers remain available for historical use.
core = (ROOT / "solar_pv_design_platform_v1.9_core.js").read_text(encoding="utf-8")
assert 'const APP_VERSION = "1.9";' in core
assert 'const PROJECT_SCHEMA_VERSION = "1.9";' in core
assert '"solar_pv_design_platform_v1.9_worker.js"' in core
for schema in ["1.8", "1.8-final", "1.8-rulepacks", "1.7-alpha6"]:
    assert f'"{schema}"' in core, f"v1.9 compatibility schema alias missing: {schema}"

server = (ROOT / "solar_pv_design_platform_v1.9_server.py").read_text(encoding="utf-8")
assert 'APP_VERSION = "1.9.0"' in server
assert 'PROJECT_SCHEMA_VERSION = "1.9"' in server
assert 'solar_pv_v17_alpha6.sqlite3' in server

rules = (ROOT / "solar_pv_design_platform_v1.9_rules.js").read_text(encoding="utf-8")
assert 'const RULE_ENGINE_VERSION = "1.9.0";' in rules
assert "listRulePacks" in rules and "buildRuleContext" in rules and "calculateRulePackFingerprint" in rules
assert "__proto__" in rules and "prototype" in rules and "constructor" in rules

print({
    "ok": True,
    "mode": "v1.9-frozen-modules-hosted-by-v2.0-alpha1",
    "sections": 17,
    "retainedV19Modules": len(V19_JS),
    "externalBrowserLibraries": external,
    "legacyDatabaseFilenamePreserved": True,
})
