#!/usr/bin/env python3
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
index = (ROOT / "index.html").read_text(encoding="utf-8")

assert '<meta name="application-version" content="2.1">' in index, "protected application version marker changed"
assert '<meta name="experience-version" content="2.2">' in index
assert 'ux-v2.2.css' in index
for label in ["Project & Location", "Site Geometry", "PV System", "Electrical + SLD", "Review & Export"]:
    assert label in (ROOT / "workflow.js").read_text(encoding="utf-8"), f"missing stage {label}"

scripts = re.findall(r'<script[^>]+src="([^"]+)"', index)
expected_tail = [
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
assert scripts[-9:] == expected_tail, f"protected runtime script tail changed: {scripts[-9:]}"
for new_script in ["notifications.js","equipment-ui.js","workflow.js","panel-editor.js","sld-drawing-model.js","sld-editor.js","results-ui.js","persistence-ui.js"]:
    assert new_script in scripts and scripts.index(new_script) < len(scripts)-9, f"{new_script} missing or loaded after engineering runtime"

assert 'function validateManualPanelPolygon(candidatePolygon, roofFaceId, ignoredPanel = null)' in index
assert 'ignoredPanel instanceof Set' in index, "group validator facade does not recognize selected-panel sets"
assert 'SolarPVSLDDrawing.createDrawingModel' in index, "buildSldSvg compatibility facade does not use normalized drawing model"
assert 'SolarPVSLDEditor.exportSvg' in index and 'function isCurrent' in (ROOT / 'sld-editor.js').read_text(encoding='utf-8'), "SLD stale/export guard missing"
assert 'SolarPVWorkflow?.shouldHoldSld' in index, "stale SLD hold guard missing"

model_js = (ROOT / "sld-drawing-model.js").read_text(encoding="utf-8")
assert 'sourceFingerprint' in model_js
assert 'bound:false' in model_js
assert 'PRELIMINARY · NOT FOR CONSTRUCTION' in model_js
assert 'AC1015' in model_js, "DXF interchange writer missing"
assert '.dwg' not in model_js.lower(), "drawing model must not fake or generate DWG"

for path in ["workflow.js","notifications.js","panel-editor.js","sld-drawing-model.js","sld-editor.js","results-ui.js","persistence-ui.js","equipment-ui.js"]:
    subprocess.run(["node", "--check", str(ROOT / path)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

core_js = (ROOT / "solar_pv_design_platform_v2.1_core.js").read_text(encoding="utf-8")
rule_js = (ROOT / "solar_pv_design_platform_v2.1_rulepacks.js").read_text(encoding="utf-8")
assert 'const PROJECT_SCHEMA_VERSION = "2.0";' in core_js, "project schema compatibility changed"
assert 'const RULE_PACK_SCHEMA_VERSION = "2.0.0";' in rule_js, "rule-pack schema compatibility changed"
schema_rules = json.loads((ROOT / "schemas" / "solar_pv_rule_pack_schema_v2.0.0.json").read_text(encoding="utf-8"))
assert "2.0.0" in json.dumps(schema_rules), "rule-pack schema file no longer describes 2.0.0"

container = json.loads((ROOT / ".devcontainer" / "devcontainer.json").read_text(encoding="utf-8"))
assert 8000 in container["forwardPorts"]
assert container["portsAttributes"]["8000"]["visibility"] == "private"
assert "requirements-dev.txt" in container["postCreateCommand"]
tasks = json.loads((ROOT / ".vscode" / "tasks.json").read_text(encoding="utf-8"))
commands = "\n".join(task.get("command", "") for task in tasks["tasks"])
assert "solar_pv_design_platform_v2.1_server.py --port 8000" in commands
assert "tests/run_v22_verification.sh" in commands

combined = "\n".join((ROOT / p).read_text(encoding="utf-8", errors="ignore") for p in ["index.html","workflow.js","panel-editor.js","sld-editor.js","results-ui.js"])
for framework in ["react", "vue", "angular", "vite"]:
    assert not re.search(rf'<script[^>]+{framework}|from\s+[\'\"]{framework}|require\([\'\"]{framework}', combined, re.I), f"heavy frontend framework introduced: {framework}"

print("v2.2 static/compatibility wiring: PASS")
