# SOLAR v2.3 Alpha — Integrity, Relocation Safety & Deliverable Decoupling

This checkout is the **v2.3 Alpha orchestration patch** applied on top of the verified v2.2 Experience + Drawings package. It preserves the protected calculation engine **v2.1**, project schema **2.0**, and rule-pack schema **2.0.0**. Alpha adds explicit location confirmation/locking and relocation, guarded installation-type migration, and stale/on-demand engineering deliverables.

Run the complete Alpha release verification (inherited + Alpha automated checks and real Chromium Gate 4) with:

```bash
bash tests/run_v23_alpha_release_verification.sh
```

The non-browser cumulative verifier remains available as `bash tests/run_v23_alpha_verification.sh`. The release runner starts the existing local v2.1 server, loads the actual served app and pinned browser dependencies in Chromium, and exercises the A1-A4 interaction smoke. GitHub Actions runs the same release command on every push and pull request. See `docs/V2.3_ALPHA_BASELINE.md`, `docs/V2.3_ALPHA_IMPLEMENTATION_REPORT.md`, and `docs/UI_SMOKE_CHECKLIST_V2.3_ALPHA.md`.

---

## Inherited v2.2 documentation

### SOLAR v2.2 — Experience + Drawings

SOLAR v2.2 is the usability, panel-editor, and professional-drawings upgrade for the verified Solar PV Design Platform v2.1 calculation engine. The release deliberately keeps the numerical engine and compatibility contracts at **v2.1 / project schema 2.0 / rule-pack schema 2.0.0** while layering the v2.2 workflow and drawing system over those protected interfaces.

The browser app remains lightweight HTML/CSS/JavaScript with the existing Python standard-library HTTP/SQLite development server. There is no React/Vue/Angular/Vite application build and no npm application dependency set.

## What v2.2 adds

- **Simple Mode** by default with five primary stages: Project & Location → Site Geometry → PV System → Electrical + SLD → Review & Export.
- **Engineer Mode** that reveals the retained detailed engineering controls without resetting hidden values.
- A map-centered **PV Array Editor** with box/multi-select, group movement/rotation, row operations, align/distribute, lock/unlock, exact geometry validation, undo/redo, and selected-surface regeneration.
- A normalized, source-fingerprinted **SLD drawing model** bound to the existing deterministic electrical object model rather than duplicating electrical calculations.
- A CAD-style E-401 SLD with Compact/Detailed modes, IEC-style/ANSI-style presentation profiles, orthogonal circuit paths, cable/protection annotations, specification/legend/revision/title blocks, and explicit preliminary status.
- A safe **SLD drawing editor** for positions, tags, drawing notes, annotations, layers, pan/zoom, alignment/distribution and visual connector rerouting. Calculated ratings remain read-only and design-bound components cannot be deleted from the drawing alone.
- SLD **SVG, PDF, PNG and DXF** exports. DXF is a real AC1015 interchange file; no DWG output is claimed or fabricated.
- A coordinated **Preliminary Engineering Pack ZIP** containing G-001, PV-101, PV-201, E-301, E-401 and E-501 artifacts generated from one project/electrical snapshot and source fingerprint.
- Debounced **working-draft autosave/recovery** kept separate from immutable formal revision commits.
- A minimal `.devcontainer`, VS Code server/verification tasks, and private port-8000 configuration for Codespaces.

See `README_V2.2.md`, `CHANGELOG_v2.2.md`, and `docs/V2.2_IMPLEMENTATION_REPORT.md` for detailed behavior and verification evidence.

## Requirements

Runtime:

- Python 3

Verification/development:

- Python 3
- Node.js
- Python `jsonschema` 4.x, pinned in `requirements-dev.txt`

No `npm install` step is required.

## GitHub Codespaces quick start

1. Open the repository in **GitHub Codespaces** and wait for the devcontainer setup to finish. `postCreateCommand` installs `requirements-dev.txt`.
2. Run **Terminal → Run Task → Start Solar PV Server**.
3. Open forwarded port **8000** from the **Ports** panel. The port is labelled **Solar PV App** and is configured **private** by default because the development server has no authentication.
4. Start in **Simple Mode** for the five-stage workflow; switch to **Engineer Mode** when detailed assumptions or technical controls are needed.
5. When validating a change, run **Terminal → Run Task → Run SOLAR v2.2 Verification** or execute `bash tests/run_v22_verification.sh`.

## Run application manually

```bash
python3 solar_pv_design_platform_v2.1_server.py --port 8000
```

The server filename and health/API version intentionally remain v2.1 because v2.2 does not replace the protected calculation/server contract.

From the same machine/container:

```bash
curl http://127.0.0.1:8000/api/solar-pv/health
```

## Run complete verification

```bash
bash tests/run_v22_verification.sh
```

The v2.2 runner first executes the complete retained v2.1 verification suite, then adds deterministic drawing-model, panel command-history, export/ZIP, syntax, UI wiring, compatibility, and Codespaces checks.

The protected v2.1 suite continues to cover calculation regressions, runtime wiring, server/API/revision behavior, frozen v1.9 hashes, retained v1.9 rule-pack regression, the v2.0 rule-pack contract, and legacy project migration.

## Database and project compatibility

Runtime project/revision data remains at:

```text
.solar_pv_data/solar_pv_v17_alpha6.sqlite3
```

The directory and SQLite sidecars are gitignored and recreated by the existing server. v2.2 preserves browser-local persistence, JSON import/export, immutable revision semantics, HTTP/SQLite repository behavior and legacy migrations. Working-draft autosave is a recovery layer only; it does not replace a formal revision commit.

## External browser/network services

The browser runtime retains the existing pinned external dependencies and services:

- Leaflet 1.9.4 from unpkg
- Leaflet.Draw 1.0.4 from cdnjs
- Turf 7.3.0 from jsDelivr
- OpenStreetMap tiles
- ArcGIS World Imagery tiles
- NASA POWER climatology/resource API

Map imagery and NASA resource retrieval therefore require network access.

## Version and compatibility boundary

- v2.2 UX/drawing layer: **2.2**
- calculation/runtime engine: **2.1**
- saved-project schema: **2.0**
- formal rule-pack schema: **2.0.0**
- retained frozen v1.9 compatibility files: unchanged and hash-verified

This split is intentional. v2.2 changes how users move through the app, edit arrays and produce drawings; it does not silently alter verified v2.1 numerical behavior.

## Security and deployment scope

`solar_pv_design_platform_v2.1_server.py` is a local/development server with no authentication and is not production hardened. Keep Codespaces port 8000 private unless an authenticated, production-appropriate front end is deliberately added.

## Engineering scope

SOLAR remains a preliminary PV design/calculation platform. Professional presentation does not imply jurisdictional approval. Cable ampacity is still heuristic rather than a complete code-table calculation; AC cable impedance is resistive-only; the energy model is simplified rather than bankable; and protection coordination, fault/breaking capacity, earthing, structural, fire-code and project-specific construction engineering require qualified independent review. SLD and Engineering Pack outputs therefore default to **PRELIMINARY · NOT FOR CONSTRUCTION**.

## License

The supplied source archive did not contain a `LICENSE` file. No license has been invented or inferred.
