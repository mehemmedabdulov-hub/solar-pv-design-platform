# Solar PV Design Platform v1.9 Final

This package is the cumulative v1.9 release line built from the verified v1.7 architecture and the accepted v1.8 engineering-rule-pack direction.

## What v1.9 contains

- All retained v1.7 design workflows: site/design surfaces, geometry, automatic/manual layout, equipment records, string/MPPT design, detailed electrical calculations, energy, validation, SLD/BOM/report outputs, finance, 3D obstruction/point-cloud shading, revisions, local-first repository behavior, HTTP/SQLite repository, and deterministic Worker fallback.
- v1.8 cumulative capability: explicit versioned engineering rule packs with rule ID/version, jurisdiction/reference metadata, deterministic rule resolution, fallback behavior, validation, saved-project compatibility, and preliminary-engineering warnings.
- v1.9 final capability: project-specific JSON rule overlays, deterministic rule fingerprints, decision traces, scenario comparison, conductor/material/install/ambient/grouping configuration, project/revision persistence, migration to rule provenance, and rule provenance embedded in SLD/BOM/engineering-report outputs.
- A new Section 17, **Engineering Rule Packs, Project Overlays & Deterministic Audit**. The original 16 sections remain present.

## Engineering limitation

The built-in rule packs are transparent preliminary design defaults. They do **not** claim complete implementation of IEC, NEC, fire, utility, earthing, protection-coordination, structural, or local jurisdiction requirements. Final fault current, breaking capacity, disconnection time, manufacturer coordination, earthing, SPD coordination, access/fire setbacks, and applicable-code compliance require independent engineering verification.

## Run

```bash
python3 solar_pv_design_platform_v1.9_server.py --port 8000
```

Then open `http://127.0.0.1:8000/` in a browser. By default the server intentionally retains the established SQLite path `.solar_pv_data/solar_pv_v17_alpha6.sqlite3` for repository continuity. Use `--db <path>` if you intentionally want another database.

The browser UI still loads Leaflet, Leaflet Draw, and Turf from their existing public CDNs, so those libraries require network access unless you vendor them locally in a future release.

## Compatibility

- Current project schema: `1.9`.
- Compatibility migration accepts the retained v1.7 schemas plus v1.8 aliases `1.8`, `1.8-final`, and `1.8-rulepacks`.
- Older snapshots without explicit engineering-rule configuration migrate to the legacy v1.7 compatibility pack so their historical detailed-electrical inputs remain the basis of the rule context.
- New v1.9 projects default to the global preliminary rule pack.

## Verification

From this directory:

```bash
python3 tests/test_v19_static.py
node tests/test_v19_rulepacks.js
python3 tests/test_v19_server.py
```

The static/syntax suite verifies all local modules, the large inline application script, 17 sections, version/schema references, Worker path, and SQLite continuity. The rule suite validates built-in packs, deterministic fingerprints, project overlays, derating, materials, PE sizing, and pure cable-sizing functions. The server suite verifies health/static serving plus immutable revision, idempotency, parent-fingerprint conflict, current pull, history, and revision restoration.

Headless Chromium could not complete a browser smoke test in the build container and did not request the application page. Browser UAT therefore remains a release-acceptance responsibility even though code-level and server acceptance tests pass.
