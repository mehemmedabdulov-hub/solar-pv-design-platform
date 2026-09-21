"use strict";

/* Focused project-migration regression harness.

   The migration function is extracted verbatim from index.html so this test
   exercises the actual v2.0 inline project-migration logic without needing a
   browser DOM. Browser-only structure/geometry validation is covered by the
   retained application path/static checks; this harness supplies deterministic
   stubs only for those surrounding shell services. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
globalThis.window = globalThis;
require(path.join(ROOT, "solar_pv_design_platform_v1.9_rules.js"));
require(path.join(ROOT, "solar_pv_design_platform_v2.0_rulepacks.js"));

const v19 = globalThis.SolarPVRulePacks;
const contract = globalThis.SolarPVRulePackContract;

const APP_VERSION = "2.0-alpha1";
const PROJECT_SCHEMA_VERSION = "2.0";
const SUPPORTED_PROJECT_SCHEMA_VERSIONS = new Set([
  "2.0", "1.9", "1.8", "1.8-final", "1.8-rulepacks",
  "1.7-alpha6", "1.7-alpha5", "1.7-alpha4", "1.7-alpha3",
  "1.7-alpha2", "1.7-alpha1", "1.7", "1.6"
]);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cloneProjectSnapshot(snapshot) { return clone(snapshot); }
function validateProjectSnapshotStructure(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("snapshot object required");
  if (snapshot.form != null && (typeof snapshot.form !== "object" || Array.isArray(snapshot.form))) throw new Error("form object required");
  return true;
}
function verifyProjectSnapshotFingerprint(snapshot) {
  return snapshot.stateFingerprint
    ? { present: true, verified: true, stored: snapshot.stateFingerprint, calculated: snapshot.stateFingerprint }
    : { present: false, verified: false, stored: null, calculated: null };
}
function defaultEngineeringRuleConfiguration() {
  return {
    packId: v19.DEFAULT_RULE_PACK_ID,
    conductorMaterial: "copper",
    insulation: "xlpe90",
    installationMethod: "tray",
    ambientTempC: 40,
    groupedCircuits: 1,
    jurisdictionOverride: "",
    standardReferenceOverride: "",
    customOverlay: {},
    migratedFromLegacy: false,
    overlayPolicy: "strict-v2",
    legacyOverlayFingerprint: null
  };
}
function createProjectId() { return "P-MIGRATION-TEST"; }
function getCalculationEngineManifest() {
  return { architecture: "test-harness", engines: [], modules: [], sourceModules: [] };
}
function calculateProjectSnapshotFingerprint() { return "pv-migration-test"; }

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} not found in index.html`);
  const endMarker = `\nfunction ${nextName}(`;
  const end = source.indexOf(endMarker, start);
  assert(end > start, `${nextName} boundary not found after ${name}`);
  return source.slice(start, end).trim();
}

const indexText = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const migrateSource = extractFunction(indexText, "migrateProjectSnapshot", "restoreProjectSnapshot");
assert(migrateSource.includes("migrateV19EngineeringRuleConfiguration"));
assert(migrateSource.includes("sourceProjectSchema"));
// eslint-disable-next-line no-eval
eval(`${migrateSource}\nglobalThis.__migrateProjectSnapshot = migrateProjectSnapshot;`);
const migrateProjectSnapshot = globalThis.__migrateProjectSnapshot;

function baseSnapshot(schemaVersion) {
  return {
    schemaVersion,
    applicationVersion: schemaVersion,
    installation: "Rooftop Solar",
    form: {},
    roofFaces: [],
    exclusions: [],
    shadingObstructions: [],
    shadingImportHistory: [],
    layout: { panels: [], isCurrent: false }
  };
}

// v1.7 lineage without rule provenance is assigned the frozen legacy pack and
// preserves historical detailed-electrical inputs as legacy rule inputs.
{
  const snapshot = baseSnapshot("1.7-alpha6");
  snapshot.form = {
    designCurrentFactor: 1.3,
    conductorTempFactor: 1.15,
    dcMaxVoltageDropPct: 1.8,
    acMaxVoltageDropPct: 2.2,
    dcCurrentDensityAmm2: 4.8,
    acCurrentDensityAmm2: 4.1
  };
  const expected = v19.buildRuleContext({
    ...defaultEngineeringRuleConfiguration(),
    packId: v19.LEGACY_RULE_PACK_ID,
    migratedFromLegacy: true,
    legacyInputs: snapshot.form
  });
  const result = migrateProjectSnapshot(snapshot);
  assert.strictEqual(result.migrated, true);
  assert.strictEqual(result.sourceSchema, "1.7-alpha6");
  assert.strictEqual(result.snapshot.schemaVersion, "2.0");
  assert.strictEqual(result.snapshot.engineeringRules.packId, v19.LEGACY_RULE_PACK_ID);
  assert.strictEqual(result.snapshot.engineeringRules.provenance.fingerprint, expected.fingerprint);
  assert.strictEqual(result.snapshot.engineeringRules.migrationProvenance.sourceProjectSchema, "1.7-alpha6");
  assert.strictEqual(result.snapshot.engineeringRules.migrationProvenance.sourceRuleFingerprint, expected.fingerprint);
  assert.strictEqual(result.snapshot.stateFingerprint, "pv-migration-test");
}

// v1.8 aliases with explicit rule-pack configuration keep the selected pack and
// exact v1.9 compatibility fingerprint.
for (const schemaVersion of ["1.8", "1.8-final", "1.8-rulepacks"]) {
  const snapshot = baseSnapshot(schemaVersion);
  snapshot.engineeringRules = {
    packId: "SPVDP-HOT-CLIMATE-PRELIM-2026",
    conductorMaterial: "aluminum",
    insulation: "pvc70",
    installationMethod: "conduit",
    ambientTempC: 55,
    groupedCircuits: 6,
    customOverlay: {}
  };
  const before = v19.buildRuleContext(snapshot.engineeringRules);
  const result = migrateProjectSnapshot(snapshot);
  assert.strictEqual(result.snapshot.engineeringRules.packId, snapshot.engineeringRules.packId, schemaVersion);
  assert.strictEqual(result.snapshot.engineeringRules.provenance.fingerprint, before.fingerprint, schemaVersion);
  assert.strictEqual(result.snapshot.engineeringRules.migrationProvenance.sourceProjectSchema, schemaVersion);
}

// v1.9 stored fingerprint provenance is checked and retained as the compatibility basis.
{
  const snapshot = baseSnapshot("1.9");
  snapshot.projectId = "P-V19";
  snapshot.revisionNumber = 3;
  snapshot.parentRevisionFingerprint = "pv-parent";
  snapshot.engineeringRules = {
    packId: v19.DEFAULT_RULE_PACK_ID,
    conductorMaterial: "copper",
    insulation: "xlpe90",
    installationMethod: "tray",
    ambientTempC: 40,
    groupedCircuits: 2,
    customOverlay: { electrical: { dcMaxVoltageDropPct: 1.25 } }
  };
  const before = v19.buildRuleContext(snapshot.engineeringRules);
  snapshot.engineeringRules.provenance = { fingerprint: before.fingerprint };
  const result = migrateProjectSnapshot(snapshot);
  assert.strictEqual(result.snapshot.projectId, "P-V19");
  assert.strictEqual(result.snapshot.revisionNumber, 3);
  assert.strictEqual(result.snapshot.parentRevisionFingerprint, "pv-parent");
  assert.strictEqual(result.snapshot.engineeringRules.provenance.fingerprint, before.fingerprint);
  assert.strictEqual(result.snapshot.engineeringRules.provenance.rulePackSchemaVersion, contract.RULE_PACK_SCHEMA_VERSION);
  assert(/^rulepack-v2-sha256-[0-9a-f]{64}$/.test(result.snapshot.engineeringRules.provenance.contractFingerprint));
}

// A stored v1.9 fingerprint mismatch is rejected instead of silently changing basis.
{
  const snapshot = baseSnapshot("1.9");
  snapshot.engineeringRules = {
    ...defaultEngineeringRuleConfiguration(),
    provenance: { fingerprint: "rule-deadbeef" }
  };
  assert.throws(() => migrateProjectSnapshot(snapshot), /does not match the migrated compatibility basis/);
}

// Unknown project schemas remain fail-closed.
{
  const snapshot = baseSnapshot("9.9");
  assert.throws(() => migrateProjectSnapshot(snapshot), /Unsupported project schema/);
}

// Current schema is cloned without a migration rewrite.
{
  const snapshot = baseSnapshot("2.0");
  snapshot.projectId = "P-CURRENT";
  snapshot.revisionNumber = 0;
  snapshot.engineeringRules = defaultEngineeringRuleConfiguration();
  const result = migrateProjectSnapshot(snapshot);
  assert.strictEqual(result.migrated, false);
  assert.notStrictEqual(result.snapshot, snapshot);
  assert.deepStrictEqual(result.snapshot, snapshot);
}

console.log(JSON.stringify({
  ok: true,
  source: "index.html:migrateProjectSnapshot",
  supportedLegacySchemasTested: ["1.7-alpha6", "1.8", "1.8-final", "1.8-rulepacks", "1.9"],
  projectSchema: PROJECT_SCHEMA_VERSION,
  rulePackSchema: contract.RULE_PACK_SCHEMA_VERSION,
  ruleBasisDriftRejected: true,
  unknownSchemaRejected: true
}, null, 2));
