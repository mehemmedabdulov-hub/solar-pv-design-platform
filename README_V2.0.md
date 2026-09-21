# Solar PV Design Platform v2.0 Alpha 1

**Release line:** controlled evolution of the frozen Solar PV Design Platform v1.9 Final baseline dated 28 August 2026  
**Application:** `2.0-alpha1` (server: `2.0.0-alpha.1`)  
**Project schema:** `2.0`  
**Formal rule-pack schema:** `2.0.0`  
**Frozen compatibility rule engine:** `1.9.0`

## Scope of Alpha 1

Alpha 1 formalizes the rule-pack ecosystem before any new standards formula or jurisdiction table is added. It adds a machine-validatable rule-pack contract, strict validation, explicit engineering units, capability declarations, deterministic canonicalization/fingerprints, safe import/export, constrained overlays, v1.9 compatibility adapters, and committed golden fixtures.

No IEC, NEC, utility, fire, structural, earthing, short-circuit, protection-coordination, SPD-coordination, or jurisdiction-specific table was invented or promoted to validated status in this release.

## Continuity from v1.9

The implementation is not a rewrite. The following frozen v1.9 runtime files remain byte-identical to the 28 August 2026 source-only archive and continue to own their established calculation/repository behavior:

- `solar_pv_design_platform_v1.9_repository.js`
- `solar_pv_design_platform_v1.9_geometry.js`
- `solar_pv_design_platform_v1.9_layout.js`
- `solar_pv_design_platform_v1.9_rules.js`
- `solar_pv_design_platform_v1.9_electrical.js`
- `solar_pv_design_platform_v1.9_energy.js`
- `solar_pv_design_platform_v1.9_worker.js`
- `solar_pv_design_platform_v1.9_server.py` remains in the tree for frozen regression testing.

The v1.9 core is also retained for reference/regression while the v2.0 shell uses the minimally changed `solar_pv_design_platform_v2.0_core.js`. Stable geometry/layout, string/MPPT, detailed electrical, energy, finance, immutable revision, repository, Worker/fallback, and engineering provenance paths are retained. The SQLite repository filename intentionally remains `.solar_pv_data/solar_pv_v17_alpha6.sqlite3`; no database migration is performed merely for the application version change.

## Runtime load order

The v2.0 application preserves the established modular dependency order and inserts the contract layer only where required:

```text
solar_pv_design_platform_v2.0_core.js
  -> solar_pv_design_platform_v1.9_repository.js
  -> solar_pv_design_platform_v1.9_geometry.js
  -> solar_pv_design_platform_v1.9_layout.js
  -> solar_pv_design_platform_v1.9_rules.js
  -> solar_pv_design_platform_v2.0_rulepacks.js
  -> solar_pv_design_platform_v1.9_electrical.js
  -> solar_pv_design_platform_v1.9_energy.js
  -> main inline application
```

The v1.9 rule engine still owns engineering calculations. The v2.0 rule-contract module validates and governs the rule basis before detailed electrical calculations use it.

## Formal rule-pack contract

The machine-readable schema is:

`schemas/solar_pv_rule_pack_schema_v2.0.0.json`

Version domains are intentionally separate:

| Domain | Alpha 1 value | Purpose |
| --- | --- | --- |
| Application | `2.0-alpha1` / server `2.0.0-alpha.1` | Product runtime |
| Project schema | `2.0` | Saved project structure |
| Rule engine | `1.9.0` | Frozen compatibility calculations |
| Rule-pack schema | `2.0.0` | Machine-validatable pack contract |
| Engineering pack version | Pack-specific SemVer | Engineering artifact identity |
| Canonicalization | `spvdp-rulepack-canonical-json-v1` | Deterministic pack representation |

A v2 pack declares immutable identity/version metadata, compatibility targets, engineering rule families, explicit units for all numeric engineering quantities, applicability/assumptions, evidence/test references, capability states, lifecycle/review/claim states, and an explicit overlay contract.

### Claim boundary

The contract separates these states rather than inferring one from another:

1. software implementation;
2. deterministic software tests;
3. validated engineering evidence;
4. independent engineering review;
5. permission to make a regulatory/compliance claim.

The v1.9 compatibility packs are software-implemented and regression-tested, but their engineering evidence remains `not-validated`, independent review remains incomplete/not reviewed, and regulatory compliance claims remain not permitted.

## Deterministic validation and canonicalization

Validation is strict and structured. Errors contain deterministic `code`, `path`, `message`, and `severity` fields. The validator rejects malformed metadata, invalid semantic versions, missing/invalid units, wrong engineering value types, non-finite values, malformed tables/evidence, unsupported capabilities, unknown engineering keys, forbidden overlay paths, immutable identity changes, and the prototype-pollution keys `__proto__`, `prototype`, and `constructor`.

The canonicalization pipeline is:

```text
pack object
  -> strict validation
  -> normalization of semantically unordered contract arrays
  -> recursive lexicographic object-key ordering
  -> compact UTF-8 canonical JSON
  -> SHA-256
```

Canonicalization does not silently coerce engineering values. `-0` is normalized to `0`; non-finite values are rejected. Semantically ordered engineering tables retain their declared row order and are separately validated for monotonicity where required.

### Fingerprint namespaces

Historical v1.9 fingerprints are preserved unchanged as `rule-xxxxxxxx` values and remain the compatibility fingerprint for historical projects/calculations.

Formal v2 contract artifacts use a separate versioned namespace:

```text
rulepack-v2-sha256-<64 lowercase hex digits>
```

Algorithm identifier:

`spvdp-rulepack-canonical-json-v1+sha256`

This prevents a v2 contract fingerprint from being confused with a historical v1.9 resolved-rule fingerprint.

## v1.9 compatibility freeze and golden fixtures

Committed compatibility fixtures are in:

`tests/fixtures/v1.9_rulepacks_golden/`

They cover all four built-in v1.9 packs and capture pack validation, resolved engineering values, correction factors, material properties, voltage-drop/design-current behavior, warnings/errors, rule traces, provenance, legacy fingerprints, standard-size selection, and PE sizing helpers.

The committed base compatibility fingerprints are:

| v1.9 pack | Frozen base compatibility fingerprint |
| --- | --- |
| `SPVDP-CONSERVATIVE-PRELIM-2026` | `rule-3076459a` |
| `SPVDP-GLOBAL-PRELIM-2026` | `rule-7cf5c696` |
| `SPVDP-HOT-CLIMATE-PRELIM-2026` | `rule-aaf831c0` |
| `SPVDP-LEGACY-V17` | `rule-953c401d` |

The generator `tests/generate_v19_golden_fixtures.js` exists to make provenance reproducible; committed golden outputs must not be updated simply to suppress a regression.

## Safe project overlays

Alpha 1 replaces unrestricted v1.9 overlay assumptions with an explicit allow-list over the supported v1.9 compatibility fields. Engineering values are type/range/table validated before the frozen v1.9 deep merge executes. Numeric strings are rejected rather than coerced.

Project overlays cannot replace pack identity/version/schema, provenance, lifecycle/review/claim state, compatibility declarations, capability declarations, or the overlay policy itself. Unknown engineering paths and prototype-pollution keys are rejected.

Historical v1.9 overlays that used legacy metadata-only paths can migrate in a `legacy-v1.9-frozen` mode. Their migration-time overlay fingerprint is persisted and later mutation is rejected. Clearing such an overlay returns the project to the strict v2 allow-list policy.

## Capability flags

The contract explicitly declares capability state. Presence of related values is never treated as proof that a deeper engineering domain exists.

The frozen v1.9 preliminary paths are represented as implemented-preliminary where they actually exist. Deeper domains such as standards ampacity, fault current, breaking capacity, disconnection time, protection coordination, detailed earthing, and SPD coordination remain explicitly unsupported/not validated in Alpha 1. No fabricated result is returned for those domains.

## Pack import/export

`SolarPVRulePackContract.exportRulePack(pack)` creates deterministic machine-readable JSON containing the formal schema/versioned metadata and a contract fingerprint. `importRulePackJson(text)` safely parses, rejects unsafe keys, validates the schema/semantic fields, canonicalizes the pack, and verifies the envelope fingerprint.

The invariant tested in Alpha 1 is:

```text
export -> import -> canonicalize
```

with identical semantic pack content and identical formal contract fingerprint after the round trip.

Imported native v2 packs are staged in the in-memory contract registry after validation. They are **not** silently activated as calculation packs. Alpha 1 calculations remain pinned to the frozen v1.9 compatibility engine/packs.

## Project persistence and migration

Project schema `2.0` extends engineering-rule provenance with the rule-pack schema version, formal contract fingerprint/algorithm, compatibility state, lifecycle/claim state, capability state, evidence references, overlay policy, and migration provenance.

Supported v1.7/v1.8/v1.9 inputs continue through the existing project migration path. Older projects without explicit rule configuration are assigned the legacy v1.7 compatibility pack. v1.9 source fingerprints are rebuilt/verified and migration is rejected on rule-basis drift. Unknown project schemas are rejected rather than guessed.

Historical immutable revisions are not rewritten in place; a migrated project state becomes the basis of a new current-schema save/commit.

See `V2.0_MIGRATION_NOTES.md` for details.

## Deliverable provenance

The existing electrical design remains the source of SLD, BOM, and engineering reports. Alpha 1 extends those deliverables with formal rule-contract provenance, including rule schema, contract fingerprint, compatibility/lifecycle state, evidence/review/claim status, capability state, evidence references, and project-overlay provenance while preserving the v1.9 rule fingerprint and decision trace.

## Run

```bash
python3 solar_pv_design_platform_v2.0_server.py --port 8000
```

Then open `http://127.0.0.1:8000/` where the execution environment permits local browser navigation. The browser UI still uses the existing Leaflet 1.9.4, Leaflet Draw 1.0.4, and Turf 7.3.0 public CDN dependencies; dependency vendoring is intentionally deferred to a later production-hardening phase.

## Verification

From this directory:

```bash
python3 tests/test_v19_static.py
node tests/test_v19_rulepacks.js
python3 tests/test_v19_server.py
python3 tests/test_v20_static.py
python3 tests/test_v20_frozen_v19_hashes.py
node tests/test_v20_rulepacks.js
node tests/test_v20_project_migration.js
node tests/test_v20_deliverable_provenance.js
python3 tests/test_v20_server.py
```

`tests/BASELINE_RESULTS_BEFORE_V2_EDITS.txt` records the untouched v1.9 baseline run. `tests/ACCEPTANCE_RESULTS_v2.0_ALPHA1.txt` records the final Alpha 1 acceptance pass and browser limitation/smoke status.

## Browser UAT status

The build environment contains Chromium, but administrator policy blocks both local HTTP and `file:` navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR` before the application page is requested. Therefore no full UI/browser UAT pass is claimed from this coding session. A real Chromium JavaScript-runtime smoke did load the frozen v1.9 rule engine and the v2 contract module directly and passed fingerprint/import-export/overlay/capability checks, but that is not a substitute for workflow UAT.

## Engineering claim status

**Implemented/tested in software:** rule-pack contract, validator, canonicalization, formal fingerprint, import/export, overlay policy, capability states, v1.9 compatibility adapter/goldens, migration/provenance plumbing.

**Not independently engineering validated in Alpha 1:** the preliminary engineering values inherited from v1.9.

**Not implemented/validated:** new standards/jurisdiction tables, prospective short-circuit studies, breaking capacity, coordination/disconnection studies, detailed earthing/PE adiabatic studies, SPD coordination, and standards ampacity tables.

**Regulatory/compliance claim:** not permitted by Alpha 1.

No test, no claim.
