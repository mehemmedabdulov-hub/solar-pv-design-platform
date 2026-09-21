# CHANGELOG_v2.1

## solar_pv_design_platform_v2.1

### Calculation corrections

- Corrected DC string and MPPT-homerun voltage-drop sizing to use temperature-corrected hot Vmp instead of STC Vmp.
- Prevented strings with different series module counts from sharing the same MPPT.
- Corrected detailed AC wiring-loss percentage to use the same maximum-active/rated-power basis used to size feeder current.
- Changed energy clipping from whole-plant aggregation to per-inverter clipping based on actual panel-to-inverter assignments.
- Changed clipping limits to honor `maxActivePowerKW` when it exceeds nominal AC power.
- Corrected geometric obstruction shading so the direct-ray shade fraction removes direct beam only, not diffuse and ground-reflected POA.
- Corrected clipping percentage denominator to use inverter energy immediately before clipping.
- Corrected ground no-shadow pitch to use the orientation-aware Grid-U panel chord used by the layout engine; aligned tilted ground row-axis candidates with the configured array azimuth.
- Expanded the IRR root bracket dynamically so valid IRRs above 1000 percent can be solved.
- Added ambiguity protection for multiple-IRR cash flows; v2.1 reports N/A rather than selecting an arbitrary root.
- Changed the displayed capacity-factor metric to an explicit `AC Capacity Factor` using nominal AC nameplate capacity.
- Removed silent rounding of fractional financial-analysis horizons; analysis years must be an integer from 1 to 50.
- Blocked annual-energy/finance fallback when the annual irradiation field is marked as stale for prior coordinates.
- Blocked energy simulation and downstream fallback when the electrical design has failed or required inverter assignments are missing.

### Reliability and reporting

- Added `solar_pv_design_platform_v2.1_finance.js` for testable finance helpers and validation.
- Added explicit year-1 energy-source provenance to the finance result/report.
- Clarified that synchronizing detailed rated-power wiring loss to the energy model is a constant-percentage approximation.
- Updated the energy-model description to state per-inverter clipping and direct-beam geometry shading behavior.
- Added v2.1 health capability `v2.1-calculation-corrections` while retaining the legacy database filename and v2.0 project/rule-pack contracts.

### Repository / Codespaces readiness

- Added a standard root `README.md` with fresh setup, run, health-check, verification, database-backup, external-network, security, engineering-scope, and licensing metadata.
- Added `requirements-dev.txt` with a reproducible `jsonschema==4.26.0` verification dependency; no npm application dependency manifest was introduced.
- Added `.gitignore` coverage for Python caches/virtual environments, generated SQLite runtime state, logs/temp files, editor metadata, and OS junk.
- Removed the supplied empty `.solar_pv_data/solar_pv_v17_alpha6.sqlite3` runtime database from source control packaging after independently confirming it contained zero projects and zero project revisions; the v2.1 server recreates the database/schema automatically.
- Hardened v2.1 static serving so repository dotfiles/source-control metadata, Python/shell source, Python caches, and SQLite state cannot be fetched through the development server.
- Expanded the v2.1 server regression test to verify every local runtime JS/schema dependency used by the current browser path and to reject sensitive static paths.
- Kept the repository on the standard GitHub Codespaces image rather than adding an unnecessary custom devcontainer; Python and Node.js are supplied by the default Codespaces image and port forwarding is private by default.

### Compatibility

- Application/runtime version: 2.1.
- Project schema intentionally remains `2.0` so existing v2.0 saved projects remain loadable without a forced migration.
- Rule-pack schema intentionally remains `2.0.0`; this release corrects consumers/calculations rather than changing the rule-pack data contract.
- Frozen v1.9 source modules and hashes are retained for provenance/regression comparison.
- Existing v1.9 rule-pack, v2.0 rule-pack-contract, project-migration, and frozen-hash tests remain passing.

### Tests added

- `tests/test_v21_calculation_regressions.js` - 16 independent before/expected/after numerical scenarios.
- `tests/test_v21_static.py` - runtime wiring, schema/version, syntax, UI guard, and compatibility checks.
- `tests/test_v21_server.py` - v2.1 server/API/revision and compatibility checks.
- `tests/run_v21_verification.sh` - complete v2.1 plus retained-regression verification runner.
- Human- and machine-readable calculation evidence in `tests/CALCULATION_AUDIT_BEFORE_AFTER_v2.1.md` and `tests/CALCULATION_TEST_RESULTS_v2.1.json`.

### Known scope limitations

See `ERROR_REPORT_v2.1.md`, section "Retained model limitations". The release remains a preliminary PV design/calculation platform, not a substitute for jurisdiction-specific electrical, structural, fire, protection, or bankable-energy engineering.
