# Solar PV Design Platform v2.1

This directory is the corrected replacement release for `solar_pv_design_platform_v2.0_alpha1`, with the calculation audit and fixes requested for v2.1.

## Run

From this directory:

```bash
python3 solar_pv_design_platform_v2.1_server.py
```

Then open the local URL printed by the server. The v2.1 server keeps the prior database filename/DB contract so an existing v2.0 local project store can continue to be used.

## What changed

The v2.1 browser runtime loads corrected calculation modules for core/versioning, layout, rule-pack integration, electrical design, energy, and finance. The frozen v1.9 files and v2.0 compatibility files are intentionally retained for provenance and regression tests.

Major numerical corrections include hot-Vmp DC voltage-drop sizing, like-length MPPT string grouping, consistent AC loss basis, per-inverter/max-active-power clipping, direct-only obstruction shading, clipping-loss denominator, orientation-aware ground pitch, robust/unique IRR handling, explicit AC capacity factor, strict finance horizon validation, stale-resource blocking, and electrical-readiness gating for energy/finance.

See:

- `ERROR_REPORT_v2.1.md` - every confirmed calculation/engineering-logic error, test values, wrong/correct result, cause, and applied fix.
- `CHANGELOG_v2.1.md` - release changes and compatibility notes.
- `tests/CALCULATION_AUDIT_BEFORE_AFTER_v2.1.md` - readable before/after numerical comparison.
- `tests/CALCULATION_TEST_RESULTS_v2.1.json` - machine-readable test results.
- `tests/FINAL_VERIFICATION_v2.1.txt` - final complete verification output.

## Compatibility boundary

The application version is 2.1, while project schema remains `2.0` and rule-pack schema remains `2.0.0`. This is intentional: the fixes change calculation implementation, not the saved-project or rule-pack data shape. Existing v2.0 projects therefore do not require an artificial schema migration.

## Verification

Run:

```bash
bash tests/run_v21_verification.sh
```

The runner executes the v2.1 calculation, static, and server suites plus retained frozen-v1.9 hash, v1.9 rule-pack, v2.0 rule-pack-contract, and v2.0 project-migration regression checks.

## Engineering scope

This software remains a preliminary design tool. Cable ampacity is heuristic rather than a complete jurisdictional code-table calculation; AC cable impedance is resistive-only; the energy model is simplified rather than bankable; and protection coordination, fault/breaking capacity, earthing, structural, fire-code, and other construction-ready engineering require qualified project-specific review. Detailed limitations are listed in `ERROR_REPORT_v2.1.md`.
