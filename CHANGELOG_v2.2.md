# CHANGELOG_v2.2

## SOLAR v2.2 — Experience + Drawings

### Protected engineering baseline

- Preserved v2.1 numerical behavior for layout, electrical, energy, finance and rule-pack calculations.
- Preserved the browser runtime's required v2.1/v1.9 engineering-module tail order.
- Preserved project schema `2.0`, rule-pack schema `2.0.0`, repository/API behavior, legacy migration behavior and frozen v1.9 hashes.
- Kept `buildElectricalObjectModel()` as the deterministic electrical source consumed by drawing/export features.

### Workflow and UX

- Added Simple Mode as the default and Engineer Mode as the progressive-disclosure view.
- Added five primary stages with a visible stepper, stage-local content, readiness chips and one sticky primary action.
- Consolidated location/installation presentation in Stage 1 without duplicating the original form inputs.
- Added map-first Site Geometry guidance.
- Added searchable module/inverter pickers backed by the original selects and existing tested defaults.
- Added a unified toast/inline notification helper for the new workflows and removed blocking alerts from normal new panel-editor/SLD interactions.
- Added debounced working-draft persistence/recovery separate from formal revision commits.

### PV Array Editor

- Added a map-centered split workspace with tool palette, selection toolbar, inspector and bottom state/action bar.
- Added Ctrl/Cmd/Shift multi-selection and box selection.
- Added validated group drag/rotation with valid/invalid preview feedback.
- Added row placement, align/distribute, lock/unlock and selected-surface regeneration/reset operations.
- Added bounded command-history undo/redo.
- Extended the existing `validateManualPanelPolygon()` ignored-panel argument to safely accept a selected Set/Array while retaining the exact geometry rules.
- Propagated accepted geometry changes into downstream stale Electrical/SLD state.

### SLD drawing system

- Added a normalized drawing-model layer with design-bound nodes/edges, drawing-only coordinates/state and source fingerprints.
- Added stable component tags and preservation of visual state for surviving design references.
- Added Compact/Detailed and IEC-style/ANSI-style presentation profiles.
- Replaced the legacy block-style SLD through a compatible `buildSldSvg()` facade while retaining its fallback path.
- Added CAD-style symbols, orthogonal paths, cable/protection labels, generated legend, system specifications, general notes, revision block and A3 title block.
- Added preflight checks for missing/incomplete data, connectivity, duplicate tags, sheet bounds and stale fingerprint.
- Added a safe visual editor with annotation-only objects, pan/zoom, snap/grid, multi-select, drag, align/distribute, drawing-only connector reroute/reset, copy/paste for annotations, undo/redo, layers and reset-to-auto-layout.
- Prevented deletion of design-bound components and kept calculated electrical values read-only inside the drawing editor.

### Exports

- Preserved SVG output and added PDF, PNG and real AC1015 DXF export.
- Added a coordinated Preliminary Engineering Pack ZIP generated from one current source snapshot/fingerprint.
- Added G-001/PV-101/PV-201/E-301/E-401/E-501 pack artifacts.
- Did not add or claim native DWG output.

### Codespaces and organization

- Added `.devcontainer/devcontainer.json` with minimal Python/Node setup and private port 8000.
- Added VS Code tasks for starting the existing server and running v2.2 verification.
- Split new UI-only responsibilities into focused modules without moving tested engineering formulas.

### Tests

- Added deterministic SLD drawing-model tests.
- Added panel command-history tests.
- Added PDF/ZIP export helper tests and ZIP compatibility validation.
- Added v2.2 static/compatibility/Codespaces wiring tests.
- Added `tests/run_v22_verification.sh`, which always runs the complete v2.1 suite first.
