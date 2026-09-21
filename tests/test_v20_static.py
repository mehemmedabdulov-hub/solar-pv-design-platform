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
V2_JS = [
    "solar_pv_design_platform_v2.0_core.js",
    "solar_pv_design_platform_v2.0_rulepacks.js",
]
RETAINED_JS = [
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v1.9_layout.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v1.9_electrical.js",
    "solar_pv_design_platform_v1.9_energy.js",
    "solar_pv_design_platform_v1.9_worker.js",
]
ALL_JS = V2_JS + RETAINED_JS

text = INDEX.read_text(encoding="utf-8")
assert '<meta name="application-version" content="2.0-alpha1">' in text
assert '<meta name="project-schema" content="2.0">' in text
assert "Version 2.0 Alpha 1" in text
assert "17. Engineering Rule Packs, Project Overlays &amp; Deterministic Audit" in text

for section in range(1, 18):
    assert re.search(rf"<h2>\s*{section}\.\s", text), f"Section {section} is missing"

script_refs = re.findall(r'<script[^>]+src="([^"]+)"', text, flags=re.I)
external = [ref for ref in script_refs if re.match(r"^https?://", ref)]
local_refs = [ref for ref in script_refs if not re.match(r"^https?://", ref)]
assert len(external) == 3, f"Unexpected external script dependency count: {external}"
expected_load_order = [
    "solar_pv_design_platform_v2.0_core.js",
    "solar_pv_design_platform_v1.9_repository.js",
    "solar_pv_design_platform_v1.9_geometry.js",
    "solar_pv_design_platform_v1.9_layout.js",
    "solar_pv_design_platform_v1.9_rules.js",
    "solar_pv_design_platform_v2.0_rulepacks.js",
    "solar_pv_design_platform_v1.9_electrical.js",
    "solar_pv_design_platform_v1.9_energy.js",
]
assert local_refs[-len(expected_load_order):] == expected_load_order, local_refs
for name in ALL_JS:
    assert (ROOT / name).is_file(), f"Missing runtime module: {name}"
assert (ROOT / "solar_pv_design_platform_v2.0_server.py").is_file()
assert (ROOT / "schemas" / "solar_pv_rule_pack_schema_v2.0.0.json").is_file()

# Rule-contract integration/UI boundary.
for token in [
    "SolarPVRulePackContract",
    "exportFormalRulePack",
    "importFormalRulePackFile",
    "engineeringRuleContractStatus",
    "engineeringRuleSchemaSummary",
    "engineeringRuleContractFingerprintSummary",
    "engineeringRuleCapabilitySummary",
    "engineeringRuleReviewSummary",
    "engineeringRuleOverlayPolicySummary",
    "engineeringRuleEvidenceSummary",
    "rulePackSchemaVersion",
    "contractFingerprint",
    "regulatoryComplianceClaim",
    "migrateV19EngineeringRuleConfiguration",
]:
    assert token in text, f"Missing v2.0 rule-contract integration token: {token}"
assert "not construction-ready" in text.lower() or "not construction" in text.lower()
assert "Fault current" in text and "unsupported" in text.lower()
# Persistence/migration and deliverable provenance remain wired through the existing application shell.
for token in [
    "function migrateProjectSnapshot(rawSnapshot)",
    "sourceProjectSchema",
    "migrationProvenance",
    "data-rule-schema-version",
    "data-rule-contract-fingerprint",
    "Rule Pack Schema Version",
    "Rule Contract Fingerprint",
    "Engineering Evidence Status",
    "Independent Review Status",
    "Regulatory Compliance Claim",
    "Rule Evidence References",
    "Project Overlay Policy",
    "Calculation Provenance",
]:
    assert token in text, f"Missing migration/deliverable provenance token: {token}"

# Syntax check the complete inline application and every local JS module.
inline_scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', text, flags=re.S | re.I)
inline_code = "\n".join(inline_scripts)
inline_path = ROOT / "tests" / ".inline-v20-check.js"
inline_path.write_text(inline_code, encoding="utf-8")
try:
    subprocess.run(["node", "--check", str(inline_path)], check=True)
finally:
    inline_path.unlink(missing_ok=True)
for name in ALL_JS:
    subprocess.run(["node", "--check", str(ROOT / name)], check=True)
subprocess.run([sys.executable, "-m", "py_compile", str(ROOT / "solar_pv_design_platform_v2.0_server.py")], check=True)

# Core version/storage/migration continuity, including retained database/worker names.
core = (ROOT / "solar_pv_design_platform_v2.0_core.js").read_text(encoding="utf-8")
assert 'const APP_VERSION = "2.0-alpha1";' in core
assert 'const PROJECT_SCHEMA_VERSION = "2.0";' in core
assert '"solarPvDesignPlatform.v1.9.project"' in core
assert '"solar_pv_design_platform_v1.9_worker.js"' in core
assert '"engineering-rule-contract"' in core
for schema_version in ["1.9", "1.8", "1.8-final", "1.8-rulepacks", "1.7-alpha6", "1.6"]:
    assert f'"{schema_version}"' in core, f"Compatibility schema alias not present: {schema_version}"

server = (ROOT / "solar_pv_design_platform_v2.0_server.py").read_text(encoding="utf-8")
assert 'APP_VERSION = "2.0.0-alpha.1"' in server
assert 'PROJECT_SCHEMA_VERSION = "2.0"' in server
assert 'solar_pv_v17_alpha6.sqlite3' in server, "SQLite continuity filename was changed unexpectedly"
assert '"v2.0-rule-pack-contract"' in server

# JSON Schema itself is valid and accepts the representative native fixture.
schema = json.loads((ROOT / "schemas" / "solar_pv_rule_pack_schema_v2.0.0.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
fixture = json.loads((ROOT / "tests" / "fixtures" / "v2.0_rulepacks" / "spvdp_v20_contract_example.json").read_text(encoding="utf-8"))
schema_errors = sorted(Draft202012Validator(schema).iter_errors(fixture), key=lambda e: list(e.path))
assert not schema_errors, "\n".join(error.message for error in schema_errors)
validator = Draft202012Validator(schema)
for label, mutator in [
    ("missing required identity", lambda p: p.pop("identity")),
    ("invalid semantic version", lambda p: p["identity"].__setitem__("engineeringVersion", "v1")),
    ("missing engineering unit", lambda p: p["ruleFamilies"][0]["data"]["rows"][0]["factor"].pop("unit")),
    ("unknown engineering key", lambda p: p["ruleFamilies"][0]["data"].__setitem__("faultCurrentA", {"value": 1000, "unit": "A"})),
    ("unsupported capability declaration", lambda p: p["capabilities"].__setitem__("invented-capability", {"state": "unsupported", "validationStatus": "not-validated", "scope": "not supported"})),
]:
    invalid = copy.deepcopy(fixture)
    mutator(invalid)
    errors = list(validator.iter_errors(invalid))
    assert errors, f"JSON Schema unexpectedly accepted {label}"

# Frozen v1.9 calculation module stays byte-identical to source-only archive content in this worktree.
# The compatibility golden suite, not a silent refactor, is the change detector for engineering behavior.
rules = (ROOT / "solar_pv_design_platform_v1.9_rules.js").read_text(encoding="utf-8")
assert 'const RULE_ENGINE_VERSION = "1.9.0";' in rules
assert "calculateRulePackFingerprint" in rules
assert "__proto__" in rules and "constructor" in rules and "prototype" in rules

print({
    "ok": True,
    "sections": 17,
    "v2Modules": V2_JS,
    "retainedModules": RETAINED_JS,
    "externalBrowserLibraries": external,
    "inlineScriptBytes": len(inline_code.encode("utf-8")),
    "rulePackSchema": schema.get("$id"),
    "projectSchema": "2.0",
    "databaseFilenamePreserved": True,
})
