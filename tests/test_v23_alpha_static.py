#!/usr/bin/env python3
from pathlib import Path
import re, subprocess
ROOT = Path(__file__).resolve().parents[1]
index = (ROOT/'index.html').read_text(encoding='utf-8')
workflow = (ROOT/'workflow.js').read_text(encoding='utf-8')
controller = (ROOT/'v23-alpha-controller.js').read_text(encoding='utf-8')
notifications = (ROOT/'notifications.js').read_text(encoding='utf-8')

assert '<meta name="application-version" content="2.1">' in index
assert 'const PROJECT_SCHEMA_VERSION = "2.0";' in (ROOT/'solar_pv_design_platform_v2.1_core.js').read_text()
assert 'const RULE_PACK_SCHEMA_VERSION = "2.0.0";' in (ROOT/'solar_pv_design_platform_v2.1_rulepacks.js').read_text()
assert 'v23-alpha-controller.js' in index
scripts = re.findall(r'<script[^>]+src="([^"]+)"', index)
assert scripts.index('v23-alpha-controller.js') < scripts.index('workflow.js')
assert 'function setProjectLocation(' not in index
assert index.count('applyProjectCoordinates(') == 3, 'low-level coordinate apply must only be defined and called inside guarded request flow'
loc_body = index[index.index('async function requestProjectLocationChange'):index.index('function toggleSetLocationMode')]
assert loc_body.count('applyProjectCoordinates(') == 2
map_body = index[index.index('map.on("click", async function(event)'):index.index('document.getElementById("latitude").addEventListener')]
assert 'if (!locationLifecycle.isSetModeActive()) return;' in map_body
assert 'requestProjectLocationChange' in map_body and 'applyProjectCoordinates' not in map_body
bound_body = index[index.index('function hasLocationBoundData'):index.index('function getLocationBoundDataSummary')]
for token in ['roofFaces.length', 'shadingCoordinateOrigin', 'shadingObstructions.length']:
    assert token in bound_body
assert 'SolarPVNotifications?.decision' in loc_body
assert 'clearLocationBoundDataForRelocation();' in loc_body
assert 'Formal immutable revision history is preserved.' in loc_body
assert 'alert(' not in index[index.index('PROJECT LOCATION — v2.3 Alpha'):index.index('LOCAL METRE COORDINATE SYSTEM')]
assert 'SolarPVAlphaLocationLifecycle?.isConfirmed' in workflow
assert 'siteDesignCard: [1, 2, 3]' in workflow
assert 'API.decision' in notifications and 'global.confirm' not in notifications[notifications.index('API.decision'):]
assert 'locationLifecycle:' in index and 'confirmed: locationLifecycle.isConfirmed()' in index

for path in ['v23-alpha-controller.js','workflow.js','notifications.js']:
    subprocess.run(['node','--check',str(ROOT/path)],check=True)
# Check the main inline application script syntax independently.
blocks = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', index, flags=re.S|re.I)
inline = '\n'.join(block for block in blocks if block.strip())
tmp = ROOT/'tests'/'.tmp_v23_inline_check.js'
tmp.write_text(inline,encoding='utf-8')
try:
    subprocess.run(['node','--check',str(tmp)],check=True)
finally:
    tmp.unlink(missing_ok=True)
# A2 installation migration guard assertions.
assert 'createInstallationMigrationState' in controller
assert 'planInstallationMigration' in controller
assert 'async function requestInstallationTypeChange' in index
install_body = index[index.index('async function requestInstallationTypeChange'):index.index('document.querySelectorAll(\'input[name="installation"]\').forEach(input => {', index.index('async function requestInstallationTypeChange'))]
assert 'SolarPVNotifications.decision' in install_body
assert 'installationMigrationState.cancel()' in install_body
assert 'installationMigrationState.commit(requestedType)' in install_body
assert 'setInstallationRadioValue(fromType)' in install_body
assert 'invalidateLayout(' in install_body
assert 'window.SolarPVPersistenceUI?.schedule?.("Installation migration confirmed")' in install_body
assert 'installation: installationMigrationState.getCommittedType()' in index
assert 'SolarPVAlphaInstallationMigrationState?.isPending' in workflow
assert 'alert(' not in install_body
# A2 cancel/pending must not resync active-face form fields before a migration is committed.
pre_decision = install_body[install_body.index('// Keep the UI and every persisted/fingerprinted snapshot'):install_body.index('const confirmed = await window.SolarPVNotifications.decision')]
cancel_branch = install_body[install_body.index('if (!confirmed)'):install_body.index('installationMigrationState.commit(requestedType)')]
assert 'applyInstallationWorkflowUI();' not in pre_decision, 'pending migration must not mutate fingerprinted face-derived form fields'
assert 'applyInstallationWorkflowUI();' not in cancel_branch, 'cancelled migration must be fingerprint-neutral'
# A3 deliverable decoupling assertions.
assert 'createDeliverableInstrumentation' in controller
update_body = index[index.index('function updateDesignResults'):index.index('function generateDesign')]
assert 'updateEngineeringDeliverables' not in update_body
assert 'markDeliverablesStale(' in update_body
assert 'recordGenericRefresh()' in update_body
assert 'function markDeliverablesStale' in index
mark_body = index[index.index('function markDeliverablesStale'):index.index('function resetEngineeringDeliverablesUi')]
assert 'buildElectricalObjectModel' not in mark_body
assert 'engineeringDeliverablesResult = null' not in mark_body
assert 'SolarPVSLDEditor?.markStale' in mark_body
metadata_start = index.index('["projectName", "customerName"]')
metadata_body = index[metadata_start:index.index('document.getElementById("panel")', metadata_start)]
assert 'updateEngineeringDeliverables' not in metadata_body
assert 'markDeliverablesStale' in metadata_body
assert 'alphaDeliverableInstrumentation.recordBuild()' in index[index.index('function buildElectricalObjectModel'):index.index('function getProtectionLabelForInverter')]
for fn in ['exportSldSvg','exportBomCsv','downloadEngineeringReportHtml','printEngineeringReport']:
    start=index.index(f'function {fn}')
    end=index.find('\nfunction ',start+10)
    body=index[start:end if end!=-1 else len(index)]
    assert 'force: true' in body, f'{fn} must use explicit regeneration boundary'
assert 'alert(' not in index[index.index('function exportSldSvg'):index.index('/* ---------------------- V1.5 FINANCIAL MODEL')], 'A3-touched export paths must not use alert()'
# A4 release wiring / version / alert-debt assertions.
assert '<meta name="experience-version" content="2.2">' in index, 'inherited v2.2 experience/drawing layer marker must remain for compatibility'
assert '<meta name="orchestration-version" content="2.3-alpha">' in index
assert 'SOLAR v2.3 Alpha orchestration' in index
assert 'const RELEASE_VERSION = "2.3 Alpha";' in workflow
runner=(ROOT/'tests'/'run_v23_alpha_verification.sh').read_text(encoding='utf-8')
assert runner.index('bash tests/run_v22_verification.sh') < runner.index('node tests/test_v23_alpha_location_guard.js')
for required in ['test_v23_alpha_location_guard.js','test_v23_alpha_installation_migration.js','test_v23_alpha_deliverable_decoupling.js','test_v23_alpha_static.py','test_v23_alpha_protected.py','test_v23_alpha_server_assets.py','test_v23_alpha_browser_smoke.py','run_v23_alpha_release_verification.sh']:
    assert (ROOT/'tests'/required).is_file(), required
alert_debt=index.count('alert(')
assert alert_debt <= 24, f'Alpha unexpectedly increased legacy alert debt: {alert_debt}'
assert 'alert(' not in loc_body and 'alert(' not in install_body
assert (ROOT/'docs'/'V2.3_ALPHA_BASELINE.md').is_file()
assert (ROOT/'docs'/'V2.3_ALPHA_IMPLEMENTATION_REPORT.md').is_file()
assert (ROOT/'docs'/'UI_SMOKE_CHECKLIST_V2.3_ALPHA.md').is_file()
assert (ROOT/'SOURCE_MANIFEST_SHA256_V2.3_ALPHA.txt').is_file(), 'package-time Alpha source manifest missing'
print(f'v2.3 Alpha static A1/A2/A3/A4 assertions: PASS (remaining legacy alert() debt: {alert_debt})')
