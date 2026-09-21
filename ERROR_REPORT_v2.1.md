# ERROR_REPORT_v2.1

## Scope and validation method

This report records calculation and engineering-logic defects found while auditing `solar_pv_design_platform_v2.0_alpha1` and the fixes applied in `solar_pv_design_platform_v2.1`.

The review traced the layout, electrical, energy, financial, resource-state, and report paths. Existing v1.9/v2.0 regression tests were preserved and re-run, but they were not treated as proof of numerical correctness because they intentionally freeze prior behavior. Independent expected-value tests were added in `tests/test_v21_calculation_regressions.js` and their machine-readable before/after results are in `tests/CALCULATION_TEST_RESULTS_v2.1.json`.

All values below are representative deterministic test values. Floating-point differences below approximately 1e-9 are numerical solver tolerance, not calculation defects.

---

## E-01 - DC voltage-drop sizing used STC string voltage instead of worst-case hot operating voltage

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_electrical.js`, `calculateDetailedElectricalDesign()`, DC string and MPPT homerun cable calls (baseline lines around 561 and 599).
- Fixed: `solar_pv_design_platform_v2.1_electrical.js`, `calculateDetailedElectricalDesign()`.

**Input values used for testing:**
- 14 modules per string
- Module Vmp at STC: 40.24 V
- String Vmp at STC: 563.36 V
- Vmp temperature coefficient: -0.35 %/degC
- Maximum cell temperature: 70 degC
- Correct hot string Vmp: 474.6308 V
- Operating current: 15.41 A
- Design current: 20.325 A
- One-way conductor length: 100 m
- Maximum voltage drop: 2.0 %
- Current-density sizing basis: 5 A/mm2
- Temperature/derating factor: 1.2
- Copper resistivity: 0.0175 ohm*mm2/m

**Wrong calculation result:**
- Baseline selected 6 mm2 because voltage-drop sizing used 563.36 V.
- At the actual hot Vmp, that 6 mm2 conductor produces approximately 2.272 % drop, exceeding the 2.0 % design criterion.

**Correct calculation result:**
- 10 mm2.
- At 474.6308 V, 10 mm2 produces approximately 1.364 % drop.

**Explanation of why the error happens:**
Voltage-drop percentage is highest when operating voltage is lower for the same current and conductor resistance. The baseline used STC Vmp, even though the design already calculated temperature-corrected hot Vmp. That made the allowed voltage-drop volts too large and could select an undersized conductor.

**Fix applied:**
The v2.1 detailed electrical engine passes the string hot Vmp (`vmpHotV`) to DC string and MPPT-homerun voltage-drop sizing and reporting. The sizing equations themselves remain the same resistive preliminary model.

---

## E-02 - Unequal series string lengths could be paralleled on one MPPT

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_electrical.js`, `chooseStringPartition()` and MPPT assignment logic.
- Fixed: `solar_pv_design_platform_v2.1_electrical.js`, `chooseStringPartition()` and tracker grouping.

**Input values used for testing:**
- Panel count: 27
- Allowed string length: 13 to 14 modules
- Preferred string length: 13 to 14 modules
- Parallel string capacity per MPPT: 2

**Wrong calculation result:**
- Baseline partition: strings of 14 and 13 modules, reported as requiring only 1 MPPT.

**Correct calculation result:**
- 2 MPPTs: the 14-module string and 13-module string must not be paralleled on the same tracker input group.

**Explanation of why the error happens:**
The baseline MPPT count used only `ceil(stringCount / parallelCapacity)`. It did not require strings paralleled on a tracker to have the same series module count. Strings with different voltage operating points on one MPPT are an invalid preliminary assignment assumption.

**Fix applied:**
`chooseStringPartition()` now counts MPPT demand per string-length class. Assignment grouping includes module count (`groupKey|modules:N`) so only electrically matching series lengths can share an MPPT.

---

## E-03 - AC wiring-loss percentage used a denominator inconsistent with feeder sizing power

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_electrical.js`, `calculateDetailedElectricalDesign()`, baseline line around 693.
- Fixed: `solar_pv_design_platform_v2.1_electrical.js`, `calculateDetailedElectricalDesign()`, `totalAcSizingPowerKW`.

**Input values used for testing:**
- Inverter rated AC power: 25 kW
- Inverter maximum active power: 27.5 kW
- System voltage: 400 V three-phase
- Power factor: 0.9
- One-way length: 30 m
- Cable: 16 mm2
- Calculated cable loss: 229.763454861 W

**Wrong calculation result:**
- Baseline loss percentage: 229.763454861 / 25,000 * 100 = 0.919053819 %.

**Correct calculation result:**
- The same feeder was sized at 27.5 kW, so loss percentage on the same rated-power sizing basis is 229.763454861 / 27,500 * 100 = 0.835503472 %.

**Explanation of why the error happens:**
Current sizing used the larger of rated AC power and maximum active power, but the displayed aggregate loss percentage divided by nominal rated AC power only. Numerator and denominator therefore described different operating bases.

**Fix applied:**
v2.1 accumulates `totalAcSizingPowerKW` using the same per-inverter power basis used for feeder-current sizing, then uses it for the aggregate AC loss percentage.

---

## E-04 - Plant-level clipping allowed spare capacity on one inverter to hide overload on another

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_energy.js`, `calculateEnergySimulation()`, plant-level `Math.min(inverterUnclippedKW, totalAcCapacityKW)`.
- Fixed: `solar_pv_design_platform_v2.1_energy.js`, `calculatePerInverterClipping()` and `calculateEnergySimulation()`.

**Input values used for testing:**
- Inverter 1 net DC-converted power before clipping: 35 kW
- Inverter 2 net DC-converted power before clipping: 5 kW
- Each inverter export limit: 27.5 kW

**Wrong calculation result:**
- Baseline aggregated plant power = 40 kW and total plant capacity = 55 kW.
- Reported clipping = 0 kW.

**Correct calculation result:**
- Inverter 1 clips 35 - 27.5 = 7.5 kW.
- Inverter 2 clips 0 kW.
- Total clipping = 7.5 kW.

**Explanation of why the error happens:**
Physical clipping occurs at each inverter. Aggregating the DC-side power first incorrectly permits unused headroom on one inverter to offset an overload assigned to another inverter.

**Fix applied:**
The energy engine now groups panels by their actual `inverterNumber`, computes each inverter's net power separately, applies each inverter limit separately, and only then sums plant output.

---

## E-05 - Energy clipping used nominal rated AC power instead of the configured maximum active-power capability

**Location/file/function:**
- Baseline: `index.html` / `solar_pv_design_platform_v1.9_energy.js`, caller supplied total nominal inverter AC capacity to the clipping model.
- Fixed: `solar_pv_design_platform_v2.1_energy.js`, per-inverter clipping limit construction.

**Input values used for testing:**
- Net inverter-converted power: 26 kW
- Nominal inverter AC power: 25 kW
- Configured maximum active power: 27.5 kW

**Wrong calculation result:**
- Baseline clipping: 1.0 kW.

**Correct calculation result:**
- 0.0 kW, because 26 kW is below the configured 27.5 kW active-power capability.

**Explanation of why the error happens:**
The electrical design already distinguishes nominal AC power from maximum active power, but the old energy model clipped at nominal capacity. This made the energy model inconsistent with the inverter capability used by detailed feeder sizing.

**Fix applied:**
For each inverter, v2.1 uses `max(acPowerKW, maxActivePowerKW)` as the active-power clipping limit.

---

## E-06 - 3D obstruction shading incorrectly removed diffuse and ground-reflected irradiance

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_energy.js`, `calculateEnergySimulation()`, geometry shade multiplication after total POA/temperature adjustment (baseline lines around 226-227).
- Fixed: `solar_pv_design_platform_v2.1_energy.js`, `calculateGeometryAdjustedGroupPower()`.

**Input values used for testing:**
- DC capacity: 10 kW
- POA direct beam: 0.80 kW/m2
- POA diffuse: 0.15 kW/m2
- POA ground-reflected: 0.05 kW/m2
- Geometry shade fraction: 50 %
- Ambient temperature: 25 degC
- NOCT: 45 degC
- Pmax temperature coefficient: 0 for this isolation test

**Wrong calculation result:**
- Baseline: (0.80 + 0.15 + 0.05) * 10 * (1 - 0.5) = 5.0 kW.

**Correct calculation result:**
- Direct beam after obstruction = 0.80 * (1 - 0.5) = 0.40 kW/m2.
- Diffuse and ground terms remain 0.15 + 0.05 kW/m2 in this direct-ray obstruction model.
- Correct group power = (0.40 + 0.15 + 0.05) * 10 = 6.0 kW.

**Explanation of why the error happens:**
The geometry engine tests direct sun rays to determine obstruction shade. That result is a direct-beam blockage fraction; it is not a sky-view-factor or diffuse-radiation obstruction model. Multiplying all POA by that fraction removed energy the geometry calculation never established as blocked.

**Fix applied:**
v2.1 applies geometric obstruction shade to the direct beam only. Diffuse and ground-reflected components remain in the shaded portion, and temperature is evaluated consistently for illuminated and shaded fractions.

---

## E-07 - Clipping percentage denominator included downstream AC and availability losses

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_energy.js`, monthly and annual `clippingPct` calculations (baseline lines around 270 and 280).
- Fixed: `solar_pv_design_platform_v2.1_energy.js`, `calculateClippingPercent()`.

**Input values used for testing:**
- Inverter energy immediately before clipping: 100 units
- Energy removed by clipping: 10 units
- Final AC energy after later AC-wiring/availability losses: 87.318 units

**Wrong calculation result:**
- Baseline: 10 / (87.318 + 10) * 100 = 10.27559136 %.

**Correct calculation result:**
- 10 / 100 * 100 = 10.0 %.

**Explanation of why the error happens:**
A clipping percentage must compare clipping loss with energy at the clipping boundary. The baseline reconstructed its denominator from final downstream AC energy plus clipping, so unrelated later losses changed the clipping percentage.

**Fix applied:**
v2.1 explicitly accumulates inverter energy immediately before clipping (`inverterUnclipped`) and calculates clipping percentage as `clipping / inverterUnclipped * 100`.

---

## E-08 - Ground no-shadow row pitch used module length regardless of layout orientation

**Location/file/function:**
- Baseline: `index.html`, `calculateRecommendedGroundPitch()` (baseline lines around 2692-2700) and `solar_pv_design_platform_v1.9_layout.js` Grid-U dimensions.
- Fixed: `solar_pv_design_platform_v2.1_layout.js`, `getPanelGridDimensions()` and `calculateGroundNoShadowPitch()`; `index.html` uses the same Grid-U chord definition.

**Input values used for testing:**
- Module width: 1.134 m
- Module length: 2.382 m
- Orientation: Portrait
- Tilt: 25 deg
- Design solar elevation: 20 deg

**Wrong calculation result:**
- Baseline used the 2.382 m module length as the pitch chord for every orientation.
- Baseline calculated pitch: 4.924646649 m.

**Correct calculation result:**
- For portrait in this layout engine, the Grid-U across-row chord is the 1.134 m module width.
- Correct pitch: 1.134*cos(25 deg) + 1.134*sin(25 deg)/tan(20 deg) = 2.344479135 m.

**Explanation of why the error happens:**
The spacing formula operated on a fixed module dimension while the panel packing engine changes the Grid-U panel dimension with portrait/landscape orientation. The physical chord and the spacing axis were therefore inconsistent.

**Fix applied:**
The layout engine now exposes a single orientation-aware Grid-U dimension helper and the ground-pitch calculation uses that same chord. Tilted ground arrays also constrain the row-axis candidate so Grid-U is consistent with the configured array azimuth/tilt direction. When orientation is not yet fixed, the UI uses a conservative dimension.

---

## E-09 - IRR solver rejected valid IRRs above 1000 percent

**Location/file/function:**
- Baseline: `index.html`, `calculateIrr()`, fixed upper bracket `high = 10`.
- Fixed: `solar_pv_design_platform_v2.1_finance.js`, `calculateIrr()`.

**Input values used for testing:**
- Cash flows: [-100, 1600]

**Wrong calculation result:**
- Baseline result: N/A (`null`) because the solver stopped at a 1000 % upper rate and failed to bracket the root.

**Correct calculation result:**
- IRR = 15.0 decimal = 1500 %.
- v2.1 numerical result: approximately 14.999999999985448.

**Explanation of why the error happens:**
For a one-period cash flow, -100 + 1600/(1+r) = 0 gives r = 15. The old hard-coded upper bound of 10 could not contain that root.

**Fix applied:**
The solver now expands the positive bracket dynamically, with a bounded numerical safety ceiling, instead of assuming all valid IRRs are below 1000 %.

---

## E-10 - Reported capacity factor used DC array kWp while the metric was labeled as plant capacity factor

**Location/file/function:**
- Baseline: `solar_pv_design_platform_v1.9_energy.js`, `capacityFactor = annual.acEnergy / (dcCapacityKW * 8760)`.
- Fixed: `solar_pv_design_platform_v2.1_energy.js`, `calculateAcCapacityFactor()` and `index.html` label `AC Capacity Factor`.

**Input values used for testing:**
- Annual AC energy: 160,000 kWh
- DC nameplate: 120 kWp
- AC nameplate: 100 kW

**Wrong calculation result:**
- Baseline: 160,000 / (120 * 8760) = 15.22070015 %.

**Correct calculation result:**
- AC capacity factor: 160,000 / (100 * 8760) = 18.26484018 %.

**Explanation of why the error happens:**
Specific yield and performance ratio appropriately normalize by DC kWp, but capacity factor conventionally needs an explicit capacity basis. The old UI did not state a DC basis and mixed an AC-energy numerator with DC nameplate denominator.

**Fix applied:**
The displayed metric is explicitly `AC Capacity Factor` and uses total nominal inverter AC capacity. DC kWp remains the basis for specific yield and PR.

---

## E-11 - IRR solver could report one arbitrary root for non-conventional cash flows with multiple IRRs

**Location/file/function:**
- Baseline: `index.html`, `calculateIrr()`.
- Fixed: `solar_pv_design_platform_v2.1_finance.js`, `calculateIrr()`.

**Input values used for testing:**
- Cash flows: [-100, 360, -431, 171.6]

**Wrong calculation result:**
- Baseline returned approximately 0.3000000046 (30 %), implying a single IRR.
- The same cash flow has roots near 10 %, 20 %, and 30 %.

**Correct calculation result:**
- N/A (`null`) because a single IRR is not a well-defined decision metric for this cash-flow sign pattern.

**Explanation of why the error happens:**
A bracketed root finder can return one root without detecting that the NPV polynomial has other economically relevant roots. Reporting that one value as "the IRR" is misleading.

**Fix applied:**
v2.1 counts cash-flow sign changes before solving and returns N/A unless the conventional cash-flow pattern supports a unique IRR under the implemented model.

---

## E-12 - Fractional financial analysis years were silently rounded to a different project horizon

**Location/file/function:**
- Baseline: `index.html`, `getFinancialInputs()`, `Math.round(Number(...financeAnalysisYears...))`.
- Fixed: `index.html` plus `solar_pv_design_platform_v2.1_finance.js`, `isValidAnalysisYears()`.

**Input values used for testing:**
- Analysis horizon entered: 20.6 years

**Wrong calculation result:**
- Baseline silently changed 20.6 to 21 years and calculated 21 annual cash-flow periods.

**Correct calculation result:**
- Input rejected as invalid. The analysis horizon must be an explicit integer from 1 through 50 years.

**Explanation of why the error happens:**
Silently changing a financial assumption alters NPV, lifetime energy, LCOE, and cumulative cash flow without informing the user.

**Fix applied:**
The raw numeric input is retained and strict integer/range validation is applied. No rounding is performed.

---

## E-13 - Stale irradiation from prior coordinates could be reused for energy and financial output

**Location/file/function:**
- Baseline: `index.html`, location invalidation plus `updateDesignResults()` and `calculateFinancialAnalysis()` fallback paths.
- Fixed: `solar_pv_design_platform_v2.1_finance.js`, `calculateSimpleAnnualEnergyFallback()`; `index.html` callers.

**Input values used for testing:**
- DC capacity: 100 kWp
- Prior-site annual GHI remaining in field: 1800 kWh/m2/year
- Resource source state: `stale-resource`
- Monthly resource loaded: false
- Simplified PR fallback: 0.80

**Wrong calculation result:**
- Baseline fallback: 100 * 1800 * 0.80 = 144,000 kWh/year, despite the GHI belonging to the previous coordinates.

**Correct calculation result:**
- No annual-energy or finance result is produced from stale resource data; the user must load/enter valid resource data for the current site.

**Explanation of why the error happens:**
The UI correctly marked the old GHI as stale after a location change, but downstream fallback arithmetic ignored that provenance state and treated the numeric field as valid.

**Fix applied:**
The fallback helper now permits simplified annual-GHI energy only when no monthly resource is present and the irradiation source is explicitly `manual`. `stale-resource` is blocked.

---

## E-14 - Failed electrical design could still produce plausible energy/fallback output using one assumed inverter

**Location/file/function:**
- Baseline: `index.html`, `updateDesignResults()`, `effectiveInverterQuantity = electricalDesignResult.inverterQuantity || 1` and subsequent energy/fallback calculation.
- Fixed: `index.html` and `solar_pv_design_platform_v2.1_energy.js`, electrical-readiness gating and assignment validation.

**Input values used for testing:**
Representative failure case:
- 10 modules at 550 W = 5.5 kWp
- No valid string/MPPT assignment from the electrical design
- Manual annual GHI: 1600 kWh/m2/year
- Simplified PR fallback: 0.80

**Wrong calculation result:**
- Baseline could assume 1 inverter and continue to a plausible fallback energy result: 5.5 * 1600 * 0.80 = 7,040 kWh/year, even though no valid electrical topology existed.

**Correct calculation result:**
- Energy and downstream financial output are blocked until the electrical design passes or has an explicitly permitted warning state with valid inverter/string assignments.

**Explanation of why the error happens:**
`inverterQuantity || 1` converted an electrical-design failure/missing quantity into a fabricated one-inverter plant. This decoupled energy output from whether the generated PV design was electrically feasible.

**Fix applied:**
The v2.1 UI requires electrical readiness and a valid inverter quantity before energy simulation. The energy engine also rejects missing inverter assignments, preventing the caller from bypassing the check.

---

## Verification scenarios

The automated suite contains 16 deterministic scenarios, covering minimum, normal, maximum/long-run, edge, and unusual inputs:

| ID | Scenario | Baseline | Expected | v2.1 |
|---|---|---:|---:|---:|
| S1 | Minimum-boundary DC cable | 2.5 mm2 | 2.5 mm2 | 2.5 mm2 |
| S2 | Hot-voltage DC cable | 6 mm2 | 10 mm2 | 10 mm2 |
| S3 | 500 m tight-drop DC cable | same helper | 95 mm2 | 95 mm2 |
| S4 | Mixed 14/13-module strings | 1 MPPT | 2 MPPT | 2 MPPT |
| S5 | AC loss denominator | 0.919053819 % | 0.835503472 % | 0.835503472 % |
| S6 | Uneven inverter loading | 0 kW clip | 7.5 kW | 7.5 kW |
| S6B | Max-active clipping basis | 1 kW clip | 0 kW | 0 kW |
| S7 | Direct-only geometry shade | 5.0 kW | 6.0 kW | 6.0 kW |
| S7B | Clipping percent | 10.27559136 % | 10.0 % | 10.0 % |
| S8 | Portrait ground pitch | 4.924646649 m | 2.344479135 m | 2.344479135 m |
| S9 | 1500 % IRR | N/A | 1500 % | 1500 % within tolerance |
| S10 | AC capacity factor | 15.22070015 % | 18.26484018 % | 18.26484018 % |
| S11 | Multiple-IRR cash flow | 30 % | N/A | N/A |
| S11B | 20.6-year horizon | 21 years | invalid | invalid |
| S12 | Stale resource fallback | 144,000 kWh | blocked | blocked |
| S13 | Intentional manual fallback | 128,000 kWh | 128,000 kWh | 128,000 kWh |

See `tests/CALCULATION_AUDIT_BEFORE_AFTER_v2.1.md` and `tests/CALCULATION_TEST_RESULTS_v2.1.json` for reproducible detail.

## Formula areas reviewed with no defect found in the implemented preliminary model

- DC resistive voltage-drop equation: `2 * L * I * rho * k / A`.
- DC resistive cable loss: `I^2 * R` over the two-conductor loop.
- Three-phase resistive AC voltage drop: `sqrt(3) * L * I * rho * k / A`.
- Three-phase resistive conductor loss: `3 * I^2 * R_phase`.
- Linear temperature correction for module Voc/Vmp using the configured manufacturer coefficients.
- MPPT voltage-window and maximum-DC-voltage checks at the configured cold/hot cell temperatures.
- Isotropic diffuse/ground POA geometry, simple NOCT cell-temperature approximation, and linear Pmax temperature coefficient as preliminary energy-model assumptions.
- Monthly daily-mean irradiation multiplied by month-day counts; February 28.25 days is intentionally a long-term climatological mean.
- CAPEX, contingency, tariff escalation, module degradation, annual OPEX escalation, discounted cash flow, NPV, discounted-energy LCOE, and fractional payback interpolation.

## Retained model limitations - not represented as code defects

v2.1 improves correctness within the application's declared preliminary-design scope. It does not turn the application into a code-compliance or bankable-energy tool. Important retained limitations are:

1. Cable ampacity is a configurable current-density heuristic, not jurisdiction-specific conductor ampacity tables with all installation, ambient, grouping, burial, insulation, and code derating factors.
2. AC voltage drop is resistive only; cable reactance and full complex impedance are not modeled.
3. Energy simulation uses representative-day/monthly climatology, isotropic sky/ground transposition, a simplified NOCT model, and configured constant inverter efficiency. It is not a bankable hourly/8760 production model.
4. Detailed electrical wiring loss can be synchronized to energy as a constant rated-power percentage. Energy does not recompute cable I^2R at every simulation timestep.
5. Ground no-shadow pitch uses the configured design solar elevation and row geometry; terrain aspect/slope projection into the solar/shadow plane is not modeled.
6. Site/map packing is plan-geometry based and is not a complete 3D surface-projection/structural model.
7. Geometric obstruction shading is a sampled direct-ray model. It does not model module substring/bypass-diode electrical behavior or diffuse sky-view obstruction by all objects.
8. Full protection coordination, prospective fault current, breaking capacity, earthing design, arc-flash, fire-code access, structural verification, and jurisdictional construction compliance are outside the implemented calculation scope.

The UI/report wording continues to identify these outputs as preliminary and not construction-ready.
