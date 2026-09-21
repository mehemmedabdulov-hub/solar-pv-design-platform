"use strict";

// Manual fixture generator for the frozen v1.9 compatibility baseline.
// Do not run this to "fix" a failing golden test. Review and version any
// intentional engineering-result change before regenerating fixtures.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "solar_pv_design_platform_v1.9_rules.js"));
const rules = globalThis.SolarPVRulePacks;

const outDir = path.join(__dirname, "fixtures", "v1.9_rulepacks_golden");
fs.mkdirSync(outDir, { recursive: true });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

const packs = rules.listRulePacks();
for (const info of packs) {
  const baseConfig = {
    packId: info.id,
    conductorMaterial: "copper",
    insulation: "xlpe90",
    installationMethod: "tray",
    ambientTempC: 40,
    groupedCircuits: 2,
    customOverlay: {}
  };
  if (info.id === rules.LEGACY_RULE_PACK_ID) {
    baseConfig.legacyInputs = {
      designCurrentFactor: 1.3,
      conductorTempFactor: 1.15,
      dcMaxVoltageDropPct: 1.8,
      acMaxVoltageDropPct: 2.2,
      dcCurrentDensityAmm2: 4.8,
      acCurrentDensityAmm2: 4.1
    };
  }

  const alternateConfig = {
    ...baseConfig,
    conductorMaterial: "aluminum",
    insulation: "pvc70",
    installationMethod: "conduit",
    ambientTempC: 55,
    groupedCircuits: 6
  };

  const overlayConfig = {
    ...baseConfig,
    customOverlay: {
      electrical: {
        dcMaxVoltageDropPct: 1.25,
        acMaxVoltageDropPct: 1.75
      },
      site: {
        minimumEdgeSetbackM: 0.45
      }
    }
  };

  const pack = rules.getRulePack(info.id);
  const invalidPack = clone(pack);
  invalidPack.electrical.cableSizesMm2 = [];

  const base = rules.buildRuleContext(baseConfig);
  const alternate = rules.buildRuleContext(alternateConfig);
  const overlay = rules.buildRuleContext(overlayConfig);

  const fixture = {
    fixtureVersion: "1.0.0",
    sourceApplicationVersion: "1.9",
    sourceRuleEngineVersion: rules.version,
    generatedFrom: "solar_pv_design_platform_v1.9_rules.js",
    packInfo: info,
    validation: rules.validateRulePack(pack),
    invalidValidationProbe: rules.validateRulePack(invalidPack),
    cases: {
      base: { config: baseConfig, context: projectContext(base) },
      alternate: { config: alternateConfig, context: projectContext(alternate) },
      safeOverlay: { config: overlayConfig, context: projectContext(overlay) }
    },
    helpers: {
      nextCableAt17Mm2: rules.nextStandardValue(base.cableSizesMm2, 17),
      nextProtectionAt91A: rules.nextStandardValue(base.protectionRatingsA, 91),
      pe10Mm2: rules.suggestProtectiveEarthSize(10, base.peRules, base.cableSizesMm2),
      pe25Mm2: rules.suggestProtectiveEarthSize(25, base.peRules, base.cableSizesMm2),
      pe50Mm2: rules.suggestProtectiveEarthSize(50, base.peRules, base.cableSizesMm2),
      pe95Mm2: rules.suggestProtectiveEarthSize(95, base.peRules, base.cableSizesMm2)
    }
  };

  const filename = `${info.id.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.golden.json`;
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(fixture, null, 2) + "\n", "utf8");
  console.log(filename);
}
