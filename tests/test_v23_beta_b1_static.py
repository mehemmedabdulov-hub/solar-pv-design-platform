#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
index=(ROOT/'index.html').read_text(encoding='utf-8')
workflow=(ROOT/'workflow.js').read_text(encoding='utf-8')
state=(ROOT/'project-state-v2.3.js').read_text(encoding='utf-8')
assert '<script src="project-state-v2.3.js"></script>' in index
assert 'function captureLegacyProjectSnapshotFromRuntime' in index
assert 'function captureProjectSnapshot(options = {})' in index
assert 'SolarPVProjectState.toLegacySnapshot(projectStateStore.getState(), legacy)' in index
assert 'solar:projectstatechange' in state
assert 'REPLACE_STATE' in state and 'SET_PATH' in state
assert 'state.location?.confirmed === true' in workflow
assert 'schemaVersion = PROJECT_SCHEMA_VERSION' in index
print('v2.3 Beta B1 static ProjectState boundary: PASS')
