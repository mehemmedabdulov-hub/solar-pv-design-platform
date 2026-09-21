# Calculation Audit - v2.0 Baseline vs v2.1 Fixed

## Result

All 16 independent numerical regression scenarios pass in v2.1. The suite deliberately includes values that the frozen v1.9/v2.0 behavior gets wrong, plus minimum/maximum boundary controls that verify the fixes did not simply bias results in one direction.

Machine-readable evidence: `CALCULATION_TEST_RESULTS_v2.1.json`.

## Before/expected/after comparison

| ID | Class | Test inputs | v2.0/v1.9 baseline | Independent expected result | v2.1 result | Status |
|---|---|---|---:|---:|---:|---|
| S1 | Minimum boundary | DC: 1 A, 0.5 m, 1000 V, 3% | 2.5 mm2 | 2.5 mm2 | 2.5 mm2 | PASS |
| S2 | Normal / thermal worst case | 14 modules, 563.36 V STC, 474.6308 V hot, 15.41 A, 100 m, 2% | 6 mm2 | 10 mm2 | 10 mm2 | PASS |
| S3 | Maximum / long run | DC: 15.49 A, 500 m, 400 V, 1% | helper unchanged | 95 mm2 | 95 mm2 | PASS |
| S4 | Edge combination | 27 panels, strings 13-14, 2 parallels/MPPT | 1 MPPT | 2 MPPT | 2 MPPT | PASS |
| S5 | Normal AC feeder | 25 kW rated, 27.5 kW max-active, 229.763 W cable loss | 0.919053819% | 0.835503472% | 0.835503472% | PASS |
| S6 | Uneven inverter loading | 35 kW + 5 kW, two 27.5 kW limits | 0 kW clipped | 7.5 kW | 7.5 kW | PASS |
| S6B | Edge inverter rating | 26 kW input, 25 kW rated, 27.5 kW max-active | 1 kW clipped | 0 kW | 0 kW | PASS |
| S7 | Unusual shading mix | 10 kW, beam .80, diffuse .15, ground .05, 50% direct obstruction | 5.0 kW | 6.0 kW | 6.0 kW | PASS |
| S7B | Loss accounting | 100 pre-clip, 10 clipped, 87.318 final after later losses | 10.27559136% | 10.0% | 10.0% | PASS |
| S8 | Normal ground layout | 1.134 x 2.382 m module, portrait, 25 deg tilt, 20 deg sun elevation | 4.924646649 m | 2.344479135 m | 2.344479135 m | PASS |
| S9 | Extreme finance | Cash flows [-100, 1600] | N/A | 1500% IRR | 1500% within solver tolerance | PASS |
| S10 | Normal energy metric | 160,000 kWh/y, 120 kWp DC, 100 kW AC | 15.22070015% | 18.26484018% AC CF | 18.26484018% | PASS |
| S11 | Unusual finance | Cash flows [-100, 360, -431, 171.6] | ~30% IRR | N/A, multiple IRRs | N/A | PASS |
| S11B | Input edge | 20.6-year analysis horizon | silently 21 years | invalid input | invalid input | PASS |
| S12 | Stale-state edge | 100 kWp, stale GHI 1800, PR .80 | 144,000 kWh/y | blocked | blocked | PASS |
| S13 | Normal fallback control | 100 kWp, manual GHI 1600, PR .80 | 128,000 kWh/y | 128,000 kWh/y | 128,000 kWh/y | PASS |

## Independent equations used for expected values

### DC voltage drop

For the preliminary two-conductor resistive DC model:

`DeltaV = 2 * L * I * rho * k / A`

`drop_pct = DeltaV / V_operating * 100`

For S2, the worst design operating-voltage basis is the hot Vmp, not STC Vmp. This is why 6 mm2 fails the 2% criterion at 474.6308 V and the next standard size, 10 mm2, is required.

### AC cable loss percentage

The detailed feeder current is sized from the larger active-power capability. Therefore the consistent aggregate percentage is:

`AC_loss_pct = total_AC_cable_loss_W / total_AC_sizing_power_W * 100`

For S5: `229.763454861 / 27500 * 100 = 0.835503472%`.

### Per-inverter clipping

For each inverter `i`:

`P_clip_i = max(0, P_unclipped_i - P_limit_i)`

Plant clipping is `sum(P_clip_i)`, not `max(0, sum(P_unclipped_i) - sum(P_limit_i))` when assignments are uneven.

### Direct-ray obstruction shade

The implemented geometry ray test establishes direct-sun blockage. For a shade fraction `s`:

`POA_after_geometry = beam * (1-s) + diffuse + ground`

S7 therefore gives `(0.8 * 0.5 + 0.15 + 0.05) * 10 = 6.0 kW` before the isolated downstream factors in that test.

### Clipping percentage

`clipping_pct = clipping_energy / inverter_energy_immediately_before_clipping * 100`

Later AC wiring or availability losses are not part of this denominator.

### Ground no-shadow pitch

For the across-row Grid-U chord `C`, array tilt `beta`, and design solar elevation `alpha`:

`pitch = C*cos(beta) + C*sin(beta)/tan(alpha)`

The chord `C` must be the orientation-aware panel dimension used on Grid-U by the packing engine.

### IRR

IRR solves:

`sum(CF_t / (1+r)^t) = 0`

S9 has the exact one-period solution `r = 15`. S11 is intentionally treated as undefined for a single reported IRR because its non-conventional cash-flow sequence has multiple roots.

### AC capacity factor

The UI now reports an explicitly named AC capacity factor:

`CF_AC = annual_AC_energy / (nominal_AC_capacity * 8760)`

For S10: `160000 / (100 * 8760) = 0.182648401826484` or `18.26484018%`.

### Simplified manual-resource fallback

Only when the user explicitly supplies manual annual GHI and no monthly resource is loaded:

`annual_energy = DC_kWp * annual_GHI * 0.80`

A value tagged `stale-resource` is not a valid current-site input and is blocked.

## Additional invalid-electrical-design guard

The old design-summary path used `electricalDesignResult.inverterQuantity || 1`. For a 5.5 kWp array with 1600 kWh/m2/y manual GHI, this could allow a plausible `5.5 * 1600 * 0.80 = 7,040 kWh/y` fallback after electrical topology failure. v2.1 requires an electrical pass/warning state plus a valid inverter quantity, and its energy engine independently rejects failed/missing inverter assignments. Static verification asserts those guards are wired into the replacement runtime.

## Final interpretation

The tests validate the corrected arithmetic and the engineering boundaries that can be verified deterministically from this source. They do not certify jurisdiction-specific electrical code compliance, structural adequacy, or bankable energy yield; those retained scope limitations are documented in `../ERROR_REPORT_v2.1.md`.
