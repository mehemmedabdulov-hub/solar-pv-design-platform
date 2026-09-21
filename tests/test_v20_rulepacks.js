"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "solar_pv_design_platform_v1.9_rules.js"));
require(path.join(root, "solar_pv_design_platform_v2.0_rulepacks.js"));

const v19 = globalThis.SolarPVRulePacks;
const contract = globalThis.SolarPVRulePackContract;
assert(v19 && contract);
assert.strictEqual(v19.version, "1.9.0");
assert.strictEqual(contract.version, "2.0.0-alpha.1");
assert.strictEqual(contract.RULE_PACK_SCHEMA_VERSION, "2.0.0");
assert.strictEqual(contract.deterministic, true);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hasError(result, code) { return (result.errors || []).some(item => item.code === code); }
function assertInvalid(pack, code, label) {
  const result = contract.validateRulePack(pack);
  assert.strictEqual(result.valid, false, `${label}: expected invalid`);
  if (code) assert(hasError(result, code), `${label}: expected ${code}, got ${JSON.stringify(result.errors)}`);
  return result;
}
function projectContext(context) {
  return {
    valid: context.valid,
    errors: [...context.errors],
    warnings: [...context.warnings],
    engineVersion: context.engineVersion,
    packId: context.packId,
    packVersion: context.packVersion,
    packLabel: context.packLabel,
    completeness: context.completeness,
    jurisdiction: context.jurisdiction,
    standardReference: context.standardReference,
    description: context.description,
    fingerprint: context.fingerprint,
    conductorMaterial: context.conductorMaterial,
    conductorMaterialLabel: context.conductorMaterialLabel,
    insulation: context.insulation,
    installationMethod: context.installationMethod,
    ambientTempC: context.ambientTempC,
    groupedCircuits: context.groupedCircuits,
    resistivityOhmMm2M: context.resistivityOhmMm2M,
    materialAmpacityFactor: context.materialAmpacityFactor,
    insulationFactor: context.insulationFactor,
    installationFactor: context.installationFactor,
    ambientFactor: context.ambientFactor,
    groupingFactor: context.groupingFactor,
    dcCurrentDensityAmm2: context.dcCurrentDensityAmm2,
    acCurrentDensityAmm2: context.acCurrentDensityAmm2,
    dcDesignCurrentFactor: context.dcDesignCurrentFactor,
    acDesignCurrentFactor: context.acDesignCurrentFactor,
    conductorTempFactor: context.conductorTempFactor,
    dcMaxVoltageDropPct: context.dcMaxVoltageDropPct,
    acMaxVoltageDropPct: context.acMaxVoltageDropPct,
    cableSizesMm2: [...context.cableSizesMm2],
    protectionRatingsA: [...context.protectionRatingsA],
    stringFuseParallelThreshold: context.stringFuseParallelThreshold,
    stringFuseDesignMultiplier: context.stringFuseDesignMultiplier,
    acBreakerDesignMultiplier: context.acBreakerDesignMultiplier,
    dcIsolatorDesignMultiplier: context.dcIsolatorDesignMultiplier,
    peRules: clone(context.peRules),
    spdDc: context.spdDc,
    spdAc: context.spdAc,
    minimumEdgeSetbackM: context.minimumEdgeSetbackM,
    minimumObstacleClearanceM: context.minimumObstacleClearanceM,
    accessFireNote: context.accessFireNote,
    trace: clone(context.trace)
  };
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.keys(value).reverse().forEach(key => { out[key] = reverseKeys(value[key]); });
  return out;
}

// Built-in v1.9 compatibility contracts are all valid and preserve legacy identity.
const v19Packs = v19.listRulePacks();
assert.strictEqual(v19Packs.length, 4);
const contractPacks = contract.listContractPacks().filter(item => item.compatibilityMode === "v1.9-adapter");
assert.strictEqual(contractPacks.length, 4);
for (const info of v19Packs) {
  const pack = contract.getContractPack(info.id);
  const validation = contract.validateRulePack(pack);
  assert.strictEqual(validation.valid, true, `${info.id}: ${JSON.stringify(validation.errors)}`);
  assert.strictEqual(pack.identity.packId, info.id);
  assert.strictEqual(pack.compatibility.legacyPackIdentity.id, info.id);
  assert.strictEqual(pack.compatibility.legacyPackIdentity.version, info.version);
  assert.strictEqual(pack.identity.claims.regulatoryComplianceClaim, "not-permitted");
  assert.strictEqual(pack.identity.claims.engineeringEvidence, "not-validated");
}

// Representative native v2 fixture is contract-valid but remains non-validated.
const nativePath = path.join(__dirname, "fixtures", "v2.0_rulepacks", "spvdp_v20_contract_example.json");
const native = JSON.parse(fs.readFileSync(nativePath, "utf8"));
const nativeValidation = contract.validateRulePack(native);
assert.strictEqual(nativeValidation.valid, true, JSON.stringify(nativeValidation.errors));
assert(nativeValidation.warnings.some(item => item.code === "ENGINEERING_NOT_VALIDATED"));
assert.strictEqual(native.identity.claims.regulatoryComplianceClaim, "not-permitted");

// Semantic versions and compatibility boundary checks.
for (const value of ["0.0.0", "1.2.3", "2.0.0-alpha.1", "2.1.0+build.7", "10.20.30-rc.2+meta"]) {
  assert.strictEqual(contract.isValidSemanticVersion(value), true, value);
}
for (const value of ["1", "1.2", "01.2.3", "1.02.3", "v1.2.3", "1.2.3-", "1.2.3+", "1.2.3 alpha"]) {
  assert.strictEqual(contract.isValidSemanticVersion(value), false, value);
}

// Strict validator failures: missing metadata, versions, units/types/numbers, capabilities, families/evidence and unknown keys.
{
  const p = clone(native); delete p.identity.name; assertInvalid(p, "REQUIRED", "missing name");
}
{
  const p = clone(native); p.identity.rulePackSchemaVersion = "1.9.0"; assertInvalid(p, "INVALID_SCHEMA_VERSION", "schema version");
}
{
  const p = clone(native); p.identity.engineeringVersion = "1.0"; assertInvalid(p, "INVALID_SEMVER", "engineering semver");
}
{
  const p = clone(native); p.compatibility.applicationVersions = ["2.0"]; assertInvalid(p, "INVALID_SEMVER", "application semver");
}
{
  const p = clone(native); p.identity.packId = "bad id"; assertInvalid(p, "INVALID_PACK_ID", "pack id");
}
{
  const p = clone(native); const q = p.ruleFamilies.find(f => f.id === "voltage-drop-limits").data.dcMax; delete q.unit; assertInvalid(p, "REQUIRED", "missing unit");
}
{
  const p = clone(native); const q = p.ruleFamilies.find(f => f.id === "voltage-drop-limits").data.dcMax; q.unit = "volts"; assertInvalid(p, "INVALID_UNIT", "invalid unit");
}
{
  const p = clone(native); const q = p.ruleFamilies.find(f => f.id === "voltage-drop-limits").data.dcMax; q.value = "2"; assertInvalid(p, "INVALID_NUMBER", "wrong value type");
}
{
  const p = clone(native); const q = p.ruleFamilies.find(f => f.id === "voltage-drop-limits").data.dcMax; q.value = Infinity; assertInvalid(p, "INVALID_NUMBER", "non-finite value");
}
{
  const p = clone(native); p.capabilities["future-magic"] = {state:"implemented-preliminary",validationStatus:"not-validated",scope:"bad"}; assertInvalid(p, "UNSUPPORTED_CAPABILITY", "unsupported capability");
}
{
  const p = clone(native); delete p.capabilities["fault-current"]; assertInvalid(p, "REQUIRED_CAPABILITY", "missing explicit capability");
}
{
  const p = clone(native); p.capabilities["fault-current"].state = "implemented-preliminary"; assertInvalid(p, "INVALID_CAPABILITY_COMBINATION", "implemented capability without family");
}
{
  const p = clone(native); p.ruleFamilies[0].id = "unknown-engineering-family"; assertInvalid(p, "MALFORMED_RULE_FAMILY", "unknown family");
}
{
  const p = clone(native); p.ruleFamilies[0].evidence.sourceReferences = ["missing-source"]; assertInvalid(p, "INVALID_EVIDENCE", "bad evidence reference");
}
{
  const p = clone(native); p.ruleFamilies.find(f => f.id === "design-current").data.faultCurrentA = {value:1000,unit:"A"}; assertInvalid(p, "UNKNOWN_KEY", "unknown safety-critical engineering key");
}
{
  const p = clone(native); p.extensions["openai.spvdp:bad-number"] = 42; assertInvalid(p, "EXTENSION_ENGINEERING_NUMBER", "numeric metadata extension");
}
{
  const p = clone(native); p.overlay.allowedPaths.push("electrical.faultCurrentA"); assertInvalid(p, "INVALID_OVERLAY_PATH", "invalid overlay contract path");
}
{
  const p = clone(native); p.identity.claims.regulatoryComplianceClaim = "permitted"; assertInvalid(p, "INVALID_CLAIM_COMBINATION", "unreviewed compliance claim");
}
{
  // Structured validation output is deterministic even when object insertion order changes.
  const p = clone(native);
  delete p.identity.name;
  p.compatibility.applicationVersions = ["2.0"];
  p.unknownTopLevel = "rejected";
  const first = contract.validateRulePack(p);
  const second = contract.validateRulePack(reverseKeys(p));
  assert.deepStrictEqual(second, first);
  assert(first.errors.every(item => item.code && item.path && item.message && item.severity));
}

// Prototype-pollution keys are rejected at any nesting depth in imported packs.
for (const key of ["__proto__", "prototype", "constructor"]) {
  const text = `{"identity":{"packId":"X"},"nested":{"${key}":{"polluted":true}}}`;
  const parsed = contract.safeParseJson(text);
  assert.strictEqual(parsed.ok, false, key);
  assert(hasError(parsed, "UNSAFE_KEY"), `${key}: unsafe key not rejected`);
  assert.strictEqual({}.polluted, undefined);
}

// Unknown metadata is permitted only via namespaced, non-numeric extensions.
{
  const p = clone(native);
  p.extensions["vendor.example:review-note"] = { note: "draft", flags: [true, false], value: null };
  assert.strictEqual(contract.validateRulePack(p).valid, true);
}
{
  const p = clone(native); p.unknownTopLevel = "no"; assertInvalid(p, "UNKNOWN_KEY", "unknown top level");
}

// Overlay security model: approved path succeeds; unknown/immutable/prototype paths fail deterministically.
{
  const ok = contract.validateProjectOverlay({ electrical: { dcMaxVoltageDropPct: 1.5 }, site: { minimumEdgeSetbackM: 0.4 } });
  assert.strictEqual(ok.valid, true, JSON.stringify(ok.errors));
  assert.deepStrictEqual(ok.paths, ["electrical.dcMaxVoltageDropPct", "site.minimumEdgeSetbackM"]);
}
// Overlay values are strict: no string-to-number coercion and malformed engineering tables are rejected.
for (const [overlay, code, label] of [
  [{ electrical: { dcMaxVoltageDropPct: "1.5" } }, "INVALID_NUMBER", "numeric string must not be coerced"],
  [{ electrical: { cableSizesMm2: [2.5, "4", 6] } }, "INVALID_NUMBER", "mixed cable-size types"],
  [{ electrical: { cableSizesMm2: [2.5, 2.5, 4] } }, "MALFORMED_TABLE", "cable sizes must be strictly increasing"],
  [{ electrical: { ambientCorrection: [{ maxC: 40, factor: "0.91" }] } }, "INVALID_NUMBER", "correction factor numeric string"],
  [{ electrical: { groupingCorrection: [{ maxCircuits: 2, factor: 0.8 }, { maxCircuits: 1, factor: 0.7 }] } }, "MALFORMED_TABLE", "grouping thresholds must increase"],
  [{ electrical: { peRules: [{ phaseMaxMm2: 16, mode: "same" }, { phaseMaxMm2: 35, mode: "fixed" }] } }, "INVALID_NUMBER", "fixed PE row requires valueMm2"],
  [{ electrical: { peRules: [{ phaseMaxMm2: 16, mode: "invented" }] } }, "INVALID_ENUM", "unknown PE sizing mode"],
  [{ site: { minimumEdgeSetbackM: -0.1 } }, "INVALID_NUMBER", "negative setback"],
  [{ electrical: { spdDc: 1 } }, "TYPE_STRING", "prompt must be string"]
]) {
  const result = contract.validateProjectOverlay(overlay);
  assert.strictEqual(result.valid, false, label);
  assert(result.errors.some(item => item.code === code), `${label}: expected ${code}, got ${JSON.stringify(result.errors)}`);
}
for (const overlay of [
  { id: "ATTACK" },
  { version: "999" },
  { capabilities: { "fault-current": { state: "implemented-preliminary" } } },
  { electrical: { faultCurrentA: 1000 } },
  { identity: { packId: "ATTACK" } }
]) {
  const result = contract.validateProjectOverlay(overlay);
  assert.strictEqual(result.valid, false, JSON.stringify(overlay));
  assert(result.errors.some(item => ["IMMUTABLE_FIELD", "INVALID_OVERLAY_PATH"].includes(item.code)));
}
for (const key of ["__proto__", "prototype", "constructor"]) {
  const overlay = JSON.parse(`{"electrical":{"${key}":{"x":1}}}`);
  const result = contract.validateProjectOverlay(overlay);
  assert.strictEqual(result.valid, false, key);
  assert(result.errors.some(item => item.code === "UNSAFE_KEY" || item.code === "INVALID_OVERLAY_PATH"));
  assert.strictEqual({}.x, undefined);
}

// Canonicalization/fingerprints ignore object-key insertion order, are repeatable, and match Node SHA-256.
const canonical1 = contract.canonicalizeRulePack(native);
const canonical2 = contract.canonicalizeRulePack(reverseKeys(native));
assert.strictEqual(canonical1, canonical2);
const fp1 = contract.calculateRulePackFingerprint(native);
const fp2 = contract.calculateRulePackFingerprint(reverseKeys(native));
assert.strictEqual(fp1, fp2);
assert.strictEqual(fp1, contract.calculateRulePackFingerprint(native));
assert.strictEqual(fp1, `${contract.FINGERPRINT_PREFIX}${crypto.createHash("sha256").update(canonical1, "utf8").digest("hex")}`);

// Export/import/canonicalize round trip and tamper detection.
const exported = contract.exportRulePack(native);
const imported = contract.importRulePackJson(exported);
assert.strictEqual(imported.ok, true, JSON.stringify(imported.errors));
assert.strictEqual(imported.fingerprint, fp1);
assert.strictEqual(imported.canonicalJson, canonical1);
assert.strictEqual(contract.canonicalizeRulePack(imported.pack), canonical1);
assert.strictEqual(contract.exportRulePack(imported.pack), exported);
{
  const envelope = JSON.parse(exported);
  envelope.pack.identity.description += " tampered";
  const tampered = contract.importRulePackJson(JSON.stringify(envelope));
  assert.strictEqual(tampered.ok, false);
  assert(hasError(tampered, "FINGERPRINT_MISMATCH"));
}
{
  const malformed = contract.importRulePackJson("{not json");
  assert.strictEqual(malformed.ok, false);
  assert(hasError(malformed, "PARSE_ERROR"));
}

// Duplicate identity registration is rejected and cannot replace immutable packs.
{
  const first = contract.registerImportedRulePack(exported);
  assert.strictEqual(first.ok, true, JSON.stringify(first.errors));
  const second = contract.registerImportedRulePack(exported);
  assert.strictEqual(second.ok, false);
  assert(hasError(second, "DUPLICATE_PACK_IDENTITY"));
  const builtinExport = contract.exportRulePack(contract.getContractPack(v19.DEFAULT_RULE_PACK_ID));
  const builtinRegister = contract.registerImportedRulePack(builtinExport);
  assert.strictEqual(builtinRegister.ok, false);
  assert(hasError(builtinRegister, "DUPLICATE_PACK_IDENTITY"));
}

// Capability boundaries do not infer unsupported studies from related preliminary values.
{
  const ctx = contract.buildV19CompatibilityContext({ packId: v19.DEFAULT_RULE_PACK_ID, customOverlay: {} });
  assert.strictEqual(ctx.valid, true);
  const compatibility = contract.evaluateCompatibility(ctx);
  assert.strictEqual(compatibility.compatible, true);
  assert.strictEqual(compatibility.state, "compatible");
  for (const id of ["fault-current", "breaking-capacity", "disconnection-time", "protection-coordination", "earthing", "spd-coordination", "ampacity"]) {
    const state = contract.getCapabilityState(ctx, id);
    assert.strictEqual(state.state, "unsupported", id);
    assert.strictEqual(state.validationStatus, "not-validated", id);
  }
  assert.strictEqual(contract.getCapabilityState(ctx, "conductor-sizing").state, "implemented-preliminary");
}
{
  const incompatible = clone(native);
  incompatible.compatibility.applicationVersions = ["9.9.9"];
  assert.strictEqual(contract.validateRulePack(incompatible).valid, true);
  const state = contract.evaluateCompatibility(incompatible);
  assert.strictEqual(state.compatible, false);
  assert.strictEqual(state.state, "incompatible");
  assert(state.reasons.some(reason => /application/.test(reason)));
}

// Unknown v1.9 pack identity is rejected instead of silently falling back.
{
  const result = contract.buildV19CompatibilityContext({ packId: "SPVDP-NOT-REAL", customOverlay: {} });
  assert.strictEqual(result.valid, false);
  assert(result.validationErrors.some(item => item.code === "UNKNOWN_PACK_ID"));
}

// Golden compatibility: frozen v1.9 output and v2 adapter output both equal all committed goldens.
const goldenDir = path.join(__dirname, "fixtures", "v1.9_rulepacks_golden");
const goldenFiles = fs.readdirSync(goldenDir).filter(name => name.endsWith(".golden.json")).sort();
assert.strictEqual(goldenFiles.length, 4);
const goldenSummary = [];
for (const filename of goldenFiles) {
  const golden = JSON.parse(fs.readFileSync(path.join(goldenDir, filename), "utf8"));
  assert.strictEqual(golden.sourceRuleEngineVersion, "1.9.0");
  const currentPack = v19.getRulePack(golden.packInfo.id);
  assert.deepStrictEqual(v19.validateRulePack(currentPack), golden.validation, `${filename} validation drift`);
  const invalidPack = clone(currentPack);
  invalidPack.electrical.cableSizesMm2 = [];
  assert.deepStrictEqual(v19.validateRulePack(invalidPack), golden.invalidValidationProbe, `${filename} invalid validation drift`);
  for (const caseName of ["base", "alternate", "safeOverlay"]) {
    const fixtureCase = golden.cases[caseName];
    const oldContext = v19.buildRuleContext(clone(fixtureCase.config));
    const newContext = contract.buildV19CompatibilityContext(clone(fixtureCase.config));
    assert.deepStrictEqual(projectContext(oldContext), fixtureCase.context, `${filename}/${caseName}: frozen v1.9 golden drift`);
    assert.deepStrictEqual(projectContext(newContext), fixtureCase.context, `${filename}/${caseName}: v2 compatibility drift`);
    assert.strictEqual(newContext.contract.rulePackSchemaVersion, "2.0.0");
    assert.strictEqual(newContext.contract.compatibilityMode, "v1.9-adapter");
  }
  const base = v19.buildRuleContext(clone(golden.cases.base.config));
  assert.strictEqual(v19.nextStandardValue(base.cableSizesMm2, 17), golden.helpers.nextCableAt17Mm2);
  assert.strictEqual(v19.nextStandardValue(base.protectionRatingsA, 91), golden.helpers.nextProtectionAt91A);
  assert.strictEqual(v19.suggestProtectiveEarthSize(10, base.peRules, base.cableSizesMm2), golden.helpers.pe10Mm2);
  assert.strictEqual(v19.suggestProtectiveEarthSize(25, base.peRules, base.cableSizesMm2), golden.helpers.pe25Mm2);
  assert.strictEqual(v19.suggestProtectiveEarthSize(50, base.peRules, base.cableSizesMm2), golden.helpers.pe50Mm2);
  assert.strictEqual(v19.suggestProtectiveEarthSize(95, base.peRules, base.cableSizesMm2), golden.helpers.pe95Mm2);
  goldenSummary.push({ packId: golden.packInfo.id, baseFingerprint: golden.cases.base.context.fingerprint });
}

// Migration keeps v1.7/v1.8/v1.9 rule basis, including legacy compatibility behavior.
{
  // v1.7 projects without explicit rule provenance migrate through the legacy compatibility pack.
  const config = clone(JSON.parse(fs.readFileSync(path.join(goldenDir, "spvdp_legacy_v17.golden.json"), "utf8")).cases.base.config);
  config.migratedFromLegacy = true;
  const before = v19.buildRuleContext(config);
  const migration = contract.migrateV19EngineeringRuleConfiguration(config, config.legacyInputs);
  assert.strictEqual(migration.ok, true, JSON.stringify(migration.errors));
  assert.strictEqual(migration.context.packId, v19.LEGACY_RULE_PACK_ID);
  assert.strictEqual(migration.context.fingerprint, before.fingerprint);
  assert.strictEqual(migration.provenance.sourceRuleFingerprint, before.fingerprint);
  assert.strictEqual(migration.configuration.migratedFromLegacy, true);
}
{
  // v1.8 rule-pack configurations already carrying an explicit pack retain their exact resolved basis.
  const config = clone(JSON.parse(fs.readFileSync(path.join(goldenDir, "spvdp_hot_climate_prelim_2026.golden.json"), "utf8")).cases.alternate.config);
  const before = v19.buildRuleContext(config);
  const migration = contract.migrateV19EngineeringRuleConfiguration(config, {});
  assert.strictEqual(migration.ok, true, JSON.stringify(migration.errors));
  assert.strictEqual(migration.context.packId, config.packId);
  assert.strictEqual(migration.context.fingerprint, before.fingerprint);
  assert.strictEqual(migration.provenance.sourceRuleFingerprint, before.fingerprint);
}
{
  const config = clone(JSON.parse(fs.readFileSync(path.join(goldenDir, "spvdp_global_prelim_2026.golden.json"), "utf8")).cases.safeOverlay.config);
  const before = v19.buildRuleContext(config);
  const migration = contract.migrateV19EngineeringRuleConfiguration(config, config.legacyInputs || {});
  assert.strictEqual(migration.ok, true, JSON.stringify(migration.errors));
  assert.strictEqual(migration.context.fingerprint, before.fingerprint);
  assert.strictEqual(migration.configuration.overlayPolicy, "strict-v2");
}
{
  const config = {
    packId: v19.DEFAULT_RULE_PACK_ID,
    conductorMaterial: "copper",
    insulation: "xlpe90",
    installationMethod: "tray",
    ambientTempC: 40,
    groupedCircuits: 1,
    customOverlay: { jurisdiction: "Historical v1.9 metadata only" }
  };
  const before = v19.buildRuleContext(config);
  const migration = contract.migrateV19EngineeringRuleConfiguration(config, {});
  assert.strictEqual(migration.ok, true, JSON.stringify(migration.errors));
  assert.strictEqual(migration.configuration.overlayPolicy, "legacy-v1.9-frozen");
  assert(/^rule-/.test(migration.configuration.legacyOverlayFingerprint));
  assert.strictEqual(migration.context.fingerprint, before.fingerprint);
  const mutated = clone(migration.configuration);
  mutated.customOverlay.jurisdiction += " changed";
  const changed = contract.buildV19CompatibilityContext(mutated);
  assert.strictEqual(changed.valid, false);
  assert(changed.validationErrors.some(item => item.code === "FROZEN_OVERLAY_CHANGED"));
}
{
  const attack = contract.migrateV19EngineeringRuleConfiguration({ packId: v19.DEFAULT_RULE_PACK_ID, customOverlay: { id: "ATTACK" } }, {});
  assert.strictEqual(attack.ok, false);
  assert(hasError(attack, "IMMUTABLE_FIELD"));
}
{
  const attackOverlay = JSON.parse('{"electrical":{"__proto__":{"polluted":true}}}');
  const attack = contract.migrateV19EngineeringRuleConfiguration({ packId: v19.DEFAULT_RULE_PACK_ID, customOverlay: attackOverlay }, {});
  assert.strictEqual(attack.ok, false);
  assert(hasError(attack, "UNSAFE_KEY"));
  assert.strictEqual({}.polluted, undefined);
}

console.log(JSON.stringify({
  ok: true,
  rulePackSchemaVersion: contract.RULE_PACK_SCHEMA_VERSION,
  compatibilityPacks: v19Packs.length,
  goldenFixtures: goldenFiles.length,
  nativeFixtureFingerprint: fp1,
  canonicalBytes: Buffer.byteLength(canonical1, "utf8"),
  goldenSummary,
  unsupportedCapability: contract.getCapabilityState(contract.buildV19CompatibilityContext({packId:v19.DEFAULT_RULE_PACK_ID,customOverlay:{}}), "fault-current")
}, null, 2));
