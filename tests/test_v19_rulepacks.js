"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const rulesPath = path.join(root, "solar_pv_design_platform_v1.9_rules.js");
const electricalPath = path.join(root, "solar_pv_design_platform_v1.9_electrical.js");

require(rulesPath);
const rules = globalThis.SolarPVRulePacks;
assert(rules, "SolarPVRulePacks global was not created");
assert.strictEqual(rules.version, "1.9.0");
assert.strictEqual(rules.deterministic, true);

const packs = rules.listRulePacks();
assert(packs.length >= 4, "Expected legacy + cumulative built-in rule packs");
for (const packInfo of packs) {
  const pack = rules.getRulePack(packInfo.id);
  const validation = rules.validateRulePack(pack);
  assert.strictEqual(validation.valid, true, `${packInfo.id}: ${validation.errors.join("; ")}`);
}

const baseConfig = {
  packId: rules.DEFAULT_RULE_PACK_ID,
  conductorMaterial: "copper",
  insulation: "xlpe90",
  installationMethod: "tray",
  ambientTempC: 40,
  groupedCircuits: 2,
  customOverlay: {}
};
const a = rules.buildRuleContext(baseConfig);
const b = rules.buildRuleContext(JSON.parse(JSON.stringify(baseConfig)));
assert.strictEqual(a.valid, true);
assert.strictEqual(a.fingerprint, b.fingerprint, "Equivalent configurations must fingerprint identically");
assert(a.trace.length >= 10, "Decision trace should expose resolved rule provenance");
assert(a.warnings.some(item => /preliminary/i.test(item)), "Safety limitation warning must be present");

const overlay = rules.buildRuleContext({
  ...baseConfig,
  customOverlay: {
    id: "MUST-NOT-REPLACE-BASE-ID",
    version: "999",
    electrical: { dcMaxVoltageDropPct: 1.25 }
  }
});
assert.strictEqual(overlay.packId, rules.DEFAULT_RULE_PACK_ID, "Overlay must not replace base pack identity");
assert.notStrictEqual(overlay.packVersion, "999", "Overlay must not replace base pack version");
assert.strictEqual(overlay.dcMaxVoltageDropPct, 1.25);
assert.notStrictEqual(overlay.fingerprint, a.fingerprint, "Material overlay changes must change fingerprint");

const protoOverlay = JSON.parse('{"__proto__":{"polluted":true},"electrical":{"acMaxVoltageDropPct":1.5}}');
const hardened = rules.buildRuleContext({ ...baseConfig, customOverlay: protoOverlay });
assert.strictEqual({}.polluted, undefined, "Rule overlay must not pollute Object.prototype");
assert.strictEqual(hardened.acMaxVoltageDropPct, 1.5);

const cool = rules.buildRuleContext({ ...baseConfig, ambientTempC: 25, groupedCircuits: 1, installationMethod: "open_air" });
const hotGrouped = rules.buildRuleContext({ ...baseConfig, ambientTempC: 55, groupedCircuits: 6, installationMethod: "conduit" });
assert(hotGrouped.dcCurrentDensityAmm2 < cool.dcCurrentDensityAmm2, "Derating must reduce resolved DC density");
assert(hotGrouped.acCurrentDensityAmm2 < cool.acCurrentDensityAmm2, "Derating must reduce resolved AC density");

const copper = rules.buildRuleContext(baseConfig);
const aluminum = rules.buildRuleContext({ ...baseConfig, conductorMaterial: "aluminum" });
assert(aluminum.resistivityOhmMm2M > copper.resistivityOhmMm2M, "Aluminium resistivity should exceed copper in built-in preliminary packs");
assert(aluminum.dcCurrentDensityAmm2 < copper.dcCurrentDensityAmm2, "Aluminium ampacity heuristic should be more conservative than copper");

assert.strictEqual(rules.suggestProtectiveEarthSize(10, copper.peRules, copper.cableSizesMm2), 10);
assert.strictEqual(rules.suggestProtectiveEarthSize(25, copper.peRules, copper.cableSizesMm2), 16);
assert.strictEqual(rules.suggestProtectiveEarthSize(50, copper.peRules, copper.cableSizesMm2), 25);

const legacy = rules.buildRuleContext({
  packId: rules.LEGACY_RULE_PACK_ID,
  legacyInputs: {
    designCurrentFactor: 1.3,
    conductorTempFactor: 1.15,
    dcMaxVoltageDropPct: 1.8,
    acMaxVoltageDropPct: 2.2,
    dcCurrentDensityAmm2: 4.8,
    acCurrentDensityAmm2: 4.1
  }
});
assert.strictEqual(legacy.dcDesignCurrentFactor, 1.3);
assert.strictEqual(legacy.acDesignCurrentFactor, 1.3);
assert.strictEqual(legacy.conductorTempFactor, 1.15);
assert.strictEqual(legacy.dcMaxVoltageDropPct, 1.8);
assert.strictEqual(legacy.acMaxVoltageDropPct, 2.2);
assert.strictEqual(legacy.dcCurrentDensityAmm2, 4.8);
assert.strictEqual(legacy.acCurrentDensityAmm2, 4.1);

const comparisons = rules.compareRuleContexts([
  { ...baseConfig, scenarioLabel: "Base" },
  { ...baseConfig, ambientTempC: 55, groupedCircuits: 6, scenarioLabel: "Hot/grouped" }
]);
assert.strictEqual(comparisons.length, 2);
assert.strictEqual(comparisons[0].valid, true);
assert.notStrictEqual(comparisons[0].fingerprint, comparisons[1].fingerprint);

// Pure electrical sizing functions are tested in a VM because the browser engine
// intentionally exposes only its module manifest, not every helper as a Node export.
const sandbox = {
  console,
  globalThis: null,
  document: { getElementById: () => ({ value: "0" }) },
  STANDARD_CABLE_SIZES_MM2: [...rules.STANDARD_CABLE_SIZES_MM2],
  STANDARD_PROTECTION_RATINGS_A: [...rules.STANDARD_PROTECTION_RATINGS_A],
  COPPER_RESISTIVITY_OHM_MM2_M: 0.0175,
  SolarPVRulePacks: rules
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(electricalPath, "utf8"), sandbox, { filename: electricalPath });

const copperR = sandbox.conductorResistanceOhm(100, 10, 1.2, 0.0175);
const aluminumR = sandbox.conductorResistanceOhm(100, 10, 1.2, 0.0282);
assert(Math.abs(copperR - 0.21) < 1e-12);
assert(aluminumR > copperR);

const dcCopper = sandbox.chooseDcCableSize({
  operatingCurrentA: 13,
  designCurrentA: 16.25,
  protectionA: 20,
  oneWayLengthM: 40,
  operatingVoltageV: 600,
  maxDropPct: 2,
  currentDensity: copper.dcCurrentDensityAmm2,
  tempFactor: copper.conductorTempFactor,
  resistivityOhmMm2M: copper.resistivityOhmMm2M,
  standardCableSizesMm2: copper.cableSizesMm2
});
const dcAluminum = sandbox.chooseDcCableSize({
  operatingCurrentA: 13,
  designCurrentA: 16.25,
  protectionA: 20,
  oneWayLengthM: 40,
  operatingVoltageV: 600,
  maxDropPct: 2,
  currentDensity: aluminum.dcCurrentDensityAmm2,
  tempFactor: aluminum.conductorTempFactor,
  resistivityOhmMm2M: aluminum.resistivityOhmMm2M,
  standardCableSizesMm2: aluminum.cableSizesMm2
});
assert(dcCopper.sizeMm2);
assert(dcAluminum.sizeMm2);
assert(dcAluminum.requiredSize > dcCopper.requiredSize, "Aluminium should require a larger preliminary section for the same circuit basis");

const ac = sandbox.chooseAcCableSize({
  operatingCurrentA: 72,
  designCurrentA: 90,
  breakerA: 100,
  oneWayLengthM: 35,
  lineVoltageV: 400,
  maxDropPct: copper.acMaxVoltageDropPct,
  currentDensity: copper.acCurrentDensityAmm2,
  tempFactor: copper.conductorTempFactor,
  resistivityOhmMm2M: copper.resistivityOhmMm2M,
  standardCableSizesMm2: copper.cableSizesMm2
});
assert(ac.sizeMm2);
assert(ac.dropPct <= copper.acMaxVoltageDropPct + 1e-9);
assert(ac.capacityA + 1e-9 >= 100);

console.log(JSON.stringify({
  ok: true,
  rulePacks: packs.length,
  baseFingerprint: a.fingerprint,
  overlayFingerprint: overlay.fingerprint,
  baseDcDensity: a.dcCurrentDensityAmm2,
  hotGroupedDcDensity: hotGrouped.dcCurrentDensityAmm2,
  dcCopperSizeMm2: dcCopper.sizeMm2,
  dcAluminumSizeMm2: dcAluminum.sizeMm2,
  acCableSizeMm2: ac.sizeMm2
}, null, 2));
