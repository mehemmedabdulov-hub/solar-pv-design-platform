# SOLAR v2.2 — UX, Panel Editor & SLD Upgrade

## Release intent

v2.2 is an **Experience + Drawings** release over the verified v2.1 engine. It progressively reveals complexity instead of removing engineering capability. The project schema remains `2.0`, the rule-pack schema remains `2.0.0`, and the protected v2.1/v1.9 numerical and compatibility modules retain their established runtime order.

## Five-stage workflow

### 1 — Project & Location
Project/customer, coordinates or GPS, and installation type are presented as one starting stage. Existing latitude/longitude inputs are reused rather than duplicated. Rooftop, Ground Mount and Carport retain their original values and now include short explanatory copy.

### 2 — Site Geometry
The existing map remains the source for surfaces/exclusions. The stage adds concise map-first guidance and hides specialist clutter in Simple Mode. The existing buildable-geometry engine remains authoritative.

### 3 — PV System
Module/inverter selection, generation and array editing live in one stage. Searchable equipment cards drive the original select elements, so there is still one equipment state. The new Array Editor moves the existing map into a map-centered editing workspace.

### 4 — Electrical + SLD
The existing string/MPPT and detailed electrical calculation paths remain authoritative. When current, their deterministic `buildElectricalObjectModel()` result drives a normalized drawing model and E-401 SLD. Engineer Mode retains the detailed string, cable, rule and provenance controls.

### 5 — Review & Export
A concise KPI dashboard precedes the retained detailed results. Save/revision, validation and distinct export outputs are gathered in one review area. Technical provenance remains available rather than being deleted.

## Readiness/dependency model

The v2.2 workflow exposes `Current`, `Missing`, `Stale`, `Calculating`/working and failure-style states without creating new engineering formulas. Dependencies are treated as:

`Project → Site → Layout → Electrical → SLD → Review/Exports`

Accepted array edits mark Electrical and SLD stale. A stale SLD is held rather than silently replaced, and drawing exports require its source fingerprint to match the current electrical object model. Refreshing Electrical/SLD clears only the relevant stale states.

## PV Array Editor

The editor is implemented in `panel-editor.js` and wraps the existing map/Leaflet layers. It adds:

- select, add module, add row, box select, measure and obstacle tools;
- Ctrl/Cmd/Shift multi-selection;
- group movement with green/red ghost validity feedback;
- group rotation and exact rotation/azimuth entry;
- align/distribute operations using the configured module gap;
- lock/unlock metadata for intentional placements;
- selected-surface regeneration and a separate confirmed reset-to-auto-layout action;
- command-based undo/redo for geometry operations;
- inspector fields for surface/orientation/rotation/panel IDs/rows/string state; and
- stale downstream status after accepted edits.

Every candidate accepted by the v2.2 editor still passes `validateManualPanelPolygon()` and the same exact buildable-area/exclusion/overlap/gap primitives. Group transforms validate every selected candidate and candidate-to-candidate spacing before committing.

## SLD drawing model

`sld-drawing-model.js` separates electrical meaning from drawing position:

- generated nodes/edges contain stable drawing IDs plus stable references to design objects/circuits;
- visual coordinates, display tags, notes, layer visibility and manually routed edge points are drawing state only;
- annotation objects are explicitly `bound:false` and cannot become electrical source data;
- manual positions/tags/notes survive regeneration when the underlying `designRef` survives;
- Compact mode groups repeated strings by MPPT, while Detailed mode expands individual strings;
- the model creates only component types supported by the current source data (for example, a meter is not invented when no meter data exists); and
- a drawing fingerprint is separate from the electrical source fingerprint.

## SLD rendering and editor safety

The E-401 renderer includes PV/DC, inverter/protection, AC distribution and grid zones; vector symbols; orthogonal connectors; cable size/material/length/current/voltage-drop labels; protection text when supplied by the electrical result; a dynamic legend; system specifications; general notes; revision fields; source/rule metadata; and an A3 landscape title block.

The generated view is read-only by default. **Edit Drawing** enables visual-only operations: move/multi-select, align/distribute, pan/zoom, grid/snap, tag/note edits, drawing annotations, annotation copy/paste, visual circuit rerouting/reset, undo/redo, layers and reset-to-auto-layout. Calculated electrical fields are shown read-only. A design-bound component cannot be deleted from the drawing editor; the UI directs the user upstream instead.

## SLD preflight

Preflight checks include missing equipment identity, missing string/MPPT assignment, incomplete cable/protection data, missing connector nodes, unconnected generated nodes, duplicate tags, off-sheet objects, unsupported types and stale source fingerprint. Missing values are described as `NOT SPECIFIED` rather than fabricated. A preliminary export can carry warnings, but the product does not claim construction readiness.

## Exports implemented

- SLD SVG
- SLD PNG
- SLD PDF (A3 landscape rasterized drawing embedded in a standards-compliant PDF wrapper)
- SLD DXF (AC1015, documented lightweight subset using layers, LINE, LWPOLYLINE and TEXT entities)
- BOM CSV
- existing HTML/print engineering report
- Project JSON
- Preliminary Engineering Pack ZIP with:
  - `G-001_Project_Summary.html`
  - `PV-101_Site_Plan.svg`
  - `PV-201_Array_Layout.svg`
  - `E-301_String_MPPT.csv`
  - `E-401_Single_Line_Diagram.svg`
  - `E-501_BOM.csv`
  - `Engineering_Pack_Print.html`
  - `manifest.json` + disclaimer/readme

Native DWG is intentionally not implemented. DXF is never renamed to `.dwg`.

## Codespaces

The repository now includes `.devcontainer/devcontainer.json` with Python + Node verification support, `requirements-dev.txt` installation, private forwarded port 8000, and `.vscode/tasks.json` entries for starting the server and running the v2.2 verification suite.

## Verification

Run:

```bash
bash tests/run_v22_verification.sh
```

See `docs/V2.2_IMPLEMENTATION_REPORT.md` for the delivered test results, changed-file inventory and remaining limitations.
