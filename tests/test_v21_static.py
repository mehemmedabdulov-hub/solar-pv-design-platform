#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import pathlib
import re
import subprocess
import sys

from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
V21_JS = [
    "solar_pv_design_platform_v2.1_core.js",
    "solar_pv_design_platform_v2.1_layout.js",
    "solar_pv_design_platform_v2.1_rulepacks.js",
    "solar_pv_design_platform_v2.1_electrical.js",
    "solar_pv_design_platform_v2.1_energy.js",
    "solar_pv_design_platform_v2.1_finance.js",
]
RETAINED_JS = [
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v1.9_worker.js",
]

text = INDEX.read_text(encoding="utf-8")
assert '<meta name="application-version" content="2.1">' in text
assert '<meta name="project-schema" content="2.0">' in text
assert "Version 2.1" in text
for section in range(1, 18):
    assert re.search(rf"<h2>\s*{section}\.\s", text), f"Section {section} is missing"

script_refs = re.findall(r'<script[^>]+src="([^"]+)"', text, flags=re.I)
external = [ref for ref in script_refs if re.match(r"^https?://", ref)]
local_refs = [ref for ref in script_refs if not re.match(r"^https?://", ref)]
expected_load_order = [
    "solar_pv_design_platform_v2.1_core.js",
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v2.1_layout.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v2.1_rulepacks.js",
    "solar_pv_design_platform_v2.1_electrical.js",
    "solar_pv_design_platform_v2.1_energy.js",
    "solar_pv_design_platform_v2.1_finance.js",
]
assert local_refs[-len(expected_load_order):] == expected_load_order, local_refs
for name in V21_JS + RETAINED_JS:
    assert (ROOT / name).is_file(), f"Missing runtime/retained module: {name}"
assert (ROOT / "solar_pv_design_platform_v2.1_server.py").is_file()
assert (ROOT / "schemas" / "solar_pv_rule_pack_schema_v2.0.0.json").is_file()

# Core version/storage/migration continuity. v2.0 storage is explicitly a legacy source.
core = (ROOT / "solar_pv_design_platform_v2.1_core.js").read_text(encoding="utf-8")
assert 'const APP_VERSION = "2.1";' in core
assert 'const PROJECT_SCHEMA_VERSION = "2.0";' in core
assert '"solarPvDesignPlatform.v2.0.project"' in core
assert '"solarPvDesignPlatform.v1.9.project"' in core
assert '"solar_pv_design_platform_v1.9_worker.js"' in core

# Calculation corrections must be wired into the actual loaded runtime.
electrical = (ROOT / "solar_pv_design_platform_v2.1_electrical.js").read_text(encoding="utf-8")
energy = (ROOT / "solar_pv_design_platform_v2.1_energy.js").read_text(encoding="utf-8")
layout = (ROOT / "solar_pv_design_platform_v2.1_layout.js").read_text(encoding="utf-8")
finance = (ROOT / "solar_pv_design_platform_v2.1_finance.js").read_text(encoding="utf-8")
for source, marker in [
    (electrical, 'version:"2.1.0"'),
    (energy, 'version:"2.1.0"'),
    (layout, 'version:"2.1.0"'),
    (finance, 'version: "2.1.0"'),
]:
    assert marker in source
assert "string.vmpHotV" in electrical
assert "totalAcSizingPowerKW" in electrical
assert "modules:${string.moduleCount}" in electrical
assert "calculatePerInverterClipping" in energy
assert "calculateGeometryAdjustedGroupPower" in energy
assert "calculateAcCapacityFactor" in energy
assert "calculateGroundNoShadowPitch" in layout
assert "getPanelGridDimensions" in layout
assert "signChanges !== 1" in finance
assert "high < 1e6" in finance
assert "calculateEnergySimulation(dcCapacityKW, totalAcCapacityKW, module, inverter)" in text
assert "isValidAnalysisYears(inputs.analysisYears)" in text

# Rule-contract integration remains intact.
for token in [
    "SolarPVRulePackContract",
    "exportFormalRulePack",
    "importFormalRulePackFile",
    "engineeringRuleContractStatus",
    "rulePackSchemaVersion",
    "contractFingerprint",
    "regulatoryComplianceClaim",
    "migrateV19EngineeringRuleConfiguration",
]:
    assert token in text, f"Missing rule-contract token: {token}"
assert "not construction-ready" in text.lower() or "not construction" in text.lower()
assert "Fault current" in text and "unsupported" in text.lower()

# Syntax-check all active JS plus retained Worker and the inline application.
inline_scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', text, flags=re.S | re.I)
inline_code = "\n".join(inline_scripts)
inline_path = ROOT / "tests" / ".inline-v21-check.js"
inline_path.write_text(inline_code, encoding="utf-8")
try:
    subprocess.run(["node", "--check", str(inline_path)], check=True)
finally:
    inline_path.unlink(missing_ok=True)
for name in V21_JS + RETAINED_JS:
    subprocess.run(["node", "--check", str(ROOT / name)], check=True)
subprocess.run([sys.executable, "-m", "py_compile", str(ROOT / "solar_pv_design_platform_v2.1_server.py")], check=True)

# Server compatibility + v2.1 capability.
server = (ROOT / "solar_pv_design_platform_v2.1_server.py").read_text(encoding="utf-8")
assert 'APP_VERSION = "2.1.0"' in server
assert 'PROJECT_SCHEMA_VERSION = "2.0"' in server
assert 'solar_pv_v17_alpha6.sqlite3' in server
assert '"v2.0-rule-pack-contract"' in server
assert '"v2.1-calculation-corrections"' in server

# Formal rule-pack schema remains valid and accepts the representative v2 contract fixture.
schema_path = ROOT / "schemas" / "solar_pv_rule_pack_schema_v2.0.0.json"
schema = json.loads(schema_path.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
fixture_path = ROOT / "tests" / "fixtures" / "v2.0_rulepacks" / "spvdp_v20_contract_example.json"
fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
validator = Draft202012Validator(schema)
assert not list(validator.iter_errors(fixture))
for label, mutator in [
    ("missing required identity", lambda p: p.pop("identity")),
    ("invalid semantic version", lambda p: p["identity"].__setitem__("engineeringVersion", "v1")),
    ("missing engineering unit", lambda p: p["ruleFamilies"][0]["data"]["rows"][0]["factor"].pop("unit")),
]:
    invalid = copy.deepcopy(fixture)
    mutator(invalid)
    assert list(validator.iter_errors(invalid)), f"Schema unexpectedly accepted {label}"

print(json.dumps({
    "ok": True,
    "applicationVersion": "2.1",
    "projectSchema": "2.0",
    "activeV21Modules": V21_JS,
    "retainedCompatibilityModules": RETAINED_JS,
    "externalBrowserLibraries": external,
    "sections": 17,
    "calculationCorrectionsWired": True,
    "databaseFilenamePreserved": True,
}, indent=2))
