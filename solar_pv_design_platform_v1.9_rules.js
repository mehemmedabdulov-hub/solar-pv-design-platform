"use strict";

/* Solar PV Design Platform v1.9 - engineering rule-pack engine
   v1.8 cumulative feature: explicit, versioned engineering rule packs.
   v1.9 additions: validated project overlays, deterministic fingerprints,
   scenario comparison support, and rule-decision trace provenance.

   IMPORTANT: Built-in packs are preliminary engineering defaults. They are
   intentionally NOT represented as complete implementations of any electrical,
   fire, structural, utility, or jurisdictional code. */

(function initSolarPVRulePacks(global) {
  const RULE_ENGINE_VERSION = "1.9.0";
  const DEFAULT_RULE_PACK_ID = "SPVDP-GLOBAL-PRELIM-2026";
  const LEGACY_RULE_PACK_ID = "SPVDP-LEGACY-V17";
  const STANDARD_CABLE_SIZES_MM2 = Object.freeze([2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400]);
  const STANDARD_PROTECTION_RATINGS_A = Object.freeze([6, 10, 12, 15, 16, 20, 25, 30, 32, 35, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600]);

  function freezeDeep(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
  }

  const RULE_PACKS = freezeDeep({
    [LEGACY_RULE_PACK_ID]: {
      id: LEGACY_RULE_PACK_ID,
      version: "1.7-compat",
      label: "Legacy v1.7 preliminary inputs",
      jurisdiction: "Project-defined / legacy",
      standardReference: "Legacy deterministic v1.7 preliminary heuristics",
      completeness: "legacy-preliminary",
      description: "Uses the v1.7 detailed-electrical form inputs directly. This compatibility pack is applied automatically when an older project is migrated without explicit rule-pack provenance.",
      electrical: {
        designCurrentFactorDc: 1.25,
        designCurrentFactorAc: 1.25,
        baseCurrentDensityDcAmm2: 5,
        baseCurrentDensityAcAmm2: 4,
        dcMaxVoltageDropPct: 2,
        acMaxVoltageDropPct: 2,
        conductorResistanceTempFactor: 1.2,
        conductorMaterials: {
          copper: { label: "Copper", resistivityOhmMm2M: 0.0175, ampacityFactor: 1.0 },
          aluminum: { label: "Aluminium", resistivityOhmMm2M: 0.0282, ampacityFactor: 0.80 }
        },
        insulationAmpacityFactors: { pvc70: 0.90, xlpe90: 1.0 },
        installationMethodFactors: { open_air: 1.0, tray: 0.90, conduit: 0.82, buried: 0.78 },
        ambientCorrection: [{ maxC: 30, factor: 1.0 }, { maxC: 40, factor: 0.91 }, { maxC: 50, factor: 0.82 }, { maxC: 60, factor: 0.71 }, { maxC: 80, factor: 0.55 }],
        groupingCorrection: [{ maxCircuits: 1, factor: 1.0 }, { maxCircuits: 2, factor: 0.80 }, { maxCircuits: 3, factor: 0.70 }, { maxCircuits: 4, factor: 0.65 }, { maxCircuits: 6, factor: 0.57 }, { maxCircuits: 9, factor: 0.50 }, { maxCircuits: 99, factor: 0.45 }],
        cableSizesMm2: STANDARD_CABLE_SIZES_MM2,
        protectionRatingsA: STANDARD_PROTECTION_RATINGS_A,
        stringFuseParallelThreshold: 2,
        stringFuseDesignMultiplier: 1.0,
        acBreakerDesignMultiplier: 1.0,
        dcIsolatorDesignMultiplier: 1.0,
        peRules: [{ phaseMaxMm2: 16, mode: "same" }, { phaseMaxMm2: 35, mode: "fixed", valueMm2: 16 }, { phaseMaxMm2: 10000, mode: "factor", factor: 0.5 }],
        spdDc: "Type 2 DC SPD preliminary",
        spdAc: "Type 2 AC SPD preliminary"
      },
      site: {
        minimumEdgeSetbackM: 0,
        minimumObstacleClearanceM: 0,
        accessFireNote: "No rule-pack setback override; use project geometry inputs and verify jurisdiction-specific access/fire requirements."
      }
    },
    "SPVDP-GLOBAL-PRELIM-2026": {
      id: "SPVDP-GLOBAL-PRELIM-2026",
      version: "1.0.0",
      label: "Global preliminary engineering defaults",
      jurisdiction: "Generic / project-specific verification required",
      standardReference: "IEC/NEC-style engineering concepts; not a complete implementation of either standard",
      completeness: "preliminary",
      description: "Balanced preliminary defaults for deterministic concept design. Final ampacity tables, protection coordination, earthing, SPD, access/fire and local code checks remain project-specific.",
      electrical: {
        designCurrentFactorDc: 1.25,
        designCurrentFactorAc: 1.25,
        baseCurrentDensityDcAmm2: 5.0,
        baseCurrentDensityAcAmm2: 4.5,
        dcMaxVoltageDropPct: 2.0,
        acMaxVoltageDropPct: 2.0,
        conductorResistanceTempFactor: 1.20,
        conductorMaterials: {
          copper: { label: "Copper", resistivityOhmMm2M: 0.0175, ampacityFactor: 1.0 },
          aluminum: { label: "Aluminium", resistivityOhmMm2M: 0.0282, ampacityFactor: 0.80 }
        },
        insulationAmpacityFactors: { pvc70: 0.90, xlpe90: 1.0 },
        installationMethodFactors: { open_air: 1.0, tray: 0.90, conduit: 0.82, buried: 0.78 },
        ambientCorrection: [{ maxC: 25, factor: 1.03 }, { maxC: 30, factor: 1.0 }, { maxC: 35, factor: 0.96 }, { maxC: 40, factor: 0.91 }, { maxC: 45, factor: 0.87 }, { maxC: 50, factor: 0.82 }, { maxC: 55, factor: 0.76 }, { maxC: 60, factor: 0.71 }, { maxC: 80, factor: 0.55 }],
        groupingCorrection: [{ maxCircuits: 1, factor: 1.0 }, { maxCircuits: 2, factor: 0.80 }, { maxCircuits: 3, factor: 0.70 }, { maxCircuits: 4, factor: 0.65 }, { maxCircuits: 6, factor: 0.57 }, { maxCircuits: 9, factor: 0.50 }, { maxCircuits: 99, factor: 0.45 }],
        cableSizesMm2: STANDARD_CABLE_SIZES_MM2,
        protectionRatingsA: STANDARD_PROTECTION_RATINGS_A,
        stringFuseParallelThreshold: 2,
        stringFuseDesignMultiplier: 1.0,
        acBreakerDesignMultiplier: 1.0,
        dcIsolatorDesignMultiplier: 1.0,
        peRules: [{ phaseMaxMm2: 16, mode: "same" }, { phaseMaxMm2: 35, mode: "fixed", valueMm2: 16 }, { phaseMaxMm2: 10000, mode: "factor", factor: 0.5 }],
        spdDc: "Type 2 DC SPD preliminary; confirm array voltage, lightning exposure and coordination",
        spdAc: "Type 2 AC SPD preliminary; confirm service category, lightning exposure and coordination"
      },
      site: {
        minimumEdgeSetbackM: 0.30,
        minimumObstacleClearanceM: 0.30,
        accessFireNote: "Concept-design minimum only; jurisdiction/project fire access and maintenance pathways can require larger setbacks."
      }
    },
    "SPVDP-HOT-CLIMATE-PRELIM-2026": {
      id: "SPVDP-HOT-CLIMATE-PRELIM-2026",
      version: "1.0.0",
      label: "Hot-climate preliminary defaults",
      jurisdiction: "Generic hot-climate concept design",
      standardReference: "Project-specific code verification required; conservative temperature emphasis",
      completeness: "preliminary",
      description: "Preliminary pack with stronger ambient-temperature sensitivity and lower baseline current-density assumptions for hot routing environments.",
      electrical: {
        designCurrentFactorDc: 1.25,
        designCurrentFactorAc: 1.25,
        baseCurrentDensityDcAmm2: 4.5,
        baseCurrentDensityAcAmm2: 4.0,
        dcMaxVoltageDropPct: 1.5,
        acMaxVoltageDropPct: 1.5,
        conductorResistanceTempFactor: 1.25,
        conductorMaterials: {
          copper: { label: "Copper", resistivityOhmMm2M: 0.0175, ampacityFactor: 1.0 },
          aluminum: { label: "Aluminium", resistivityOhmMm2M: 0.0282, ampacityFactor: 0.78 }
        },
        insulationAmpacityFactors: { pvc70: 0.86, xlpe90: 1.0 },
        installationMethodFactors: { open_air: 1.0, tray: 0.88, conduit: 0.78, buried: 0.74 },
        ambientCorrection: [{ maxC: 25, factor: 1.05 }, { maxC: 30, factor: 1.0 }, { maxC: 35, factor: 0.94 }, { maxC: 40, factor: 0.87 }, { maxC: 45, factor: 0.79 }, { maxC: 50, factor: 0.71 }, { maxC: 55, factor: 0.61 }, { maxC: 60, factor: 0.50 }, { maxC: 80, factor: 0.40 }],
        groupingCorrection: [{ maxCircuits: 1, factor: 1.0 }, { maxCircuits: 2, factor: 0.78 }, { maxCircuits: 3, factor: 0.68 }, { maxCircuits: 4, factor: 0.62 }, { maxCircuits: 6, factor: 0.54 }, { maxCircuits: 9, factor: 0.48 }, { maxCircuits: 99, factor: 0.42 }],
        cableSizesMm2: STANDARD_CABLE_SIZES_MM2,
        protectionRatingsA: STANDARD_PROTECTION_RATINGS_A,
        stringFuseParallelThreshold: 2,
        stringFuseDesignMultiplier: 1.0,
        acBreakerDesignMultiplier: 1.0,
        dcIsolatorDesignMultiplier: 1.0,
        peRules: [{ phaseMaxMm2: 16, mode: "same" }, { phaseMaxMm2: 35, mode: "fixed", valueMm2: 16 }, { phaseMaxMm2: 10000, mode: "factor", factor: 0.5 }],
        spdDc: "Type 2 DC SPD preliminary; verify voltage, exposure and local lightning requirements",
        spdAc: "Type 2 AC SPD preliminary; verify service category and local lightning requirements"
      },
      site: {
        minimumEdgeSetbackM: 0.40,
        minimumObstacleClearanceM: 0.40,
        accessFireNote: "Concept-design minimum only; verify local access/fire pathways and thermal-maintenance requirements."
      }
    },
    "SPVDP-CONSERVATIVE-PRELIM-2026": {
      id: "SPVDP-CONSERVATIVE-PRELIM-2026",
      version: "1.0.0",
      label: "Conservative commercial preliminary defaults",
      jurisdiction: "Generic commercial concept design",
      standardReference: "Conservative project-screening assumptions; full applicable standard not implemented",
      completeness: "preliminary",
      description: "A more conservative concept-design pack with tighter voltage-drop limits, lower current-density assumptions and larger access/setback prompts.",
      electrical: {
        designCurrentFactorDc: 1.30,
        designCurrentFactorAc: 1.25,
        baseCurrentDensityDcAmm2: 4.0,
        baseCurrentDensityAcAmm2: 3.5,
        dcMaxVoltageDropPct: 1.0,
        acMaxVoltageDropPct: 1.0,
        conductorResistanceTempFactor: 1.25,
        conductorMaterials: {
          copper: { label: "Copper", resistivityOhmMm2M: 0.0175, ampacityFactor: 1.0 },
          aluminum: { label: "Aluminium", resistivityOhmMm2M: 0.0282, ampacityFactor: 0.75 }
        },
        insulationAmpacityFactors: { pvc70: 0.84, xlpe90: 0.98 },
        installationMethodFactors: { open_air: 0.95, tray: 0.85, conduit: 0.75, buried: 0.70 },
        ambientCorrection: [{ maxC: 25, factor: 1.0 }, { maxC: 30, factor: 0.96 }, { maxC: 35, factor: 0.91 }, { maxC: 40, factor: 0.85 }, { maxC: 45, factor: 0.78 }, { maxC: 50, factor: 0.70 }, { maxC: 55, factor: 0.60 }, { maxC: 60, factor: 0.50 }, { maxC: 80, factor: 0.40 }],
        groupingCorrection: [{ maxCircuits: 1, factor: 1.0 }, { maxCircuits: 2, factor: 0.75 }, { maxCircuits: 3, factor: 0.65 }, { maxCircuits: 4, factor: 0.60 }, { maxCircuits: 6, factor: 0.52 }, { maxCircuits: 9, factor: 0.46 }, { maxCircuits: 99, factor: 0.40 }],
        cableSizesMm2: STANDARD_CABLE_SIZES_MM2,
        protectionRatingsA: STANDARD_PROTECTION_RATINGS_A,
        stringFuseParallelThreshold: 2,
        stringFuseDesignMultiplier: 1.0,
        acBreakerDesignMultiplier: 1.0,
        dcIsolatorDesignMultiplier: 1.0,
        peRules: [{ phaseMaxMm2: 16, mode: "same" }, { phaseMaxMm2: 35, mode: "fixed", valueMm2: 16 }, { phaseMaxMm2: 10000, mode: "factor", factor: 0.5 }],
        spdDc: "Type 2 DC SPD preliminary; project-specific coordination required",
        spdAc: "Type 2 AC SPD preliminary; project-specific coordination required"
      },
      site: {
        minimumEdgeSetbackM: 0.60,
        minimumObstacleClearanceM: 0.50,
        accessFireNote: "Conservative concept-design prompt only; actual fire/access pathways must come from the applicable jurisdiction and project conditions."
      }
    }
  });

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  const BLOCKED_OVERLAY_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  function deepMerge(base, overlay) {
    if (!isPlainObject(overlay)) return deepClone(base);
    const result = isPlainObject(base) ? deepClone(base) : {};
    Object.entries(overlay).forEach(([key, value]) => {
      if (BLOCKED_OVERLAY_KEYS.has(key)) return;
      if (isPlainObject(value) && isPlainObject(result[key])) result[key] = deepMerge(result[key], value);
      else result[key] = deepClone(value);
    });
    return result;
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    if (typeof value === "number" && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value);
  }

  function fnv1a32Hex(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function calculateRulePackFingerprint(value) {
    return `rule-${fnv1a32Hex(stableStringify(value))}`;
  }

  function listRulePacks() {
    return Object.values(RULE_PACKS).map(pack => ({
      id: pack.id,
      version: pack.version,
      label: pack.label,
      jurisdiction: pack.jurisdiction,
      standardReference: pack.standardReference,
      completeness: pack.completeness,
      description: pack.description
    }));
  }

  function getRulePack(packId = DEFAULT_RULE_PACK_ID) {
    return RULE_PACKS[packId] || RULE_PACKS[DEFAULT_RULE_PACK_ID];
  }

  function finiteInRange(value, minimum, maximum) {
    return Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
  }

  function validateRulePack(pack) {
    const errors = [];
    const warnings = [];
    if (!isPlainObject(pack)) return { valid: false, errors: ["Rule pack must be an object."], warnings };
    ["id", "version", "label", "jurisdiction", "standardReference"].forEach(key => {
      if (!String(pack[key] || "").trim()) errors.push(`Rule pack is missing '${key}'.`);
    });
    const e = pack.electrical || {};
    if (!finiteInRange(e.designCurrentFactorDc, 1, 3)) errors.push("DC design-current factor must be between 1 and 3.");
    if (!finiteInRange(e.designCurrentFactorAc, 1, 3)) errors.push("AC design-current factor must be between 1 and 3.");
    if (!finiteInRange(e.baseCurrentDensityDcAmm2, 0.25, 20)) errors.push("Base DC current density must be between 0.25 and 20 A/mm².");
    if (!finiteInRange(e.baseCurrentDensityAcAmm2, 0.25, 20)) errors.push("Base AC current density must be between 0.25 and 20 A/mm².");
    if (!finiteInRange(e.dcMaxVoltageDropPct, 0.1, 20)) errors.push("DC voltage-drop limit must be between 0.1% and 20%.");
    if (!finiteInRange(e.acMaxVoltageDropPct, 0.1, 20)) errors.push("AC voltage-drop limit must be between 0.1% and 20%.");
    if (!finiteInRange(e.conductorResistanceTempFactor, 1, 3)) errors.push("Conductor resistance temperature factor must be between 1 and 3.");
    if (!Array.isArray(e.cableSizesMm2) || !e.cableSizesMm2.length || e.cableSizesMm2.some(value => !finiteInRange(value, 0.5, 2000))) errors.push("Cable-size table must be a non-empty numeric array.");
    if (!Array.isArray(e.protectionRatingsA) || !e.protectionRatingsA.length || e.protectionRatingsA.some(value => !finiteInRange(value, 1, 10000))) errors.push("Protection ratings must be a non-empty numeric array.");
    ["ambientCorrection", "groupingCorrection", "peRules"].forEach(key => {
      if (!Array.isArray(e[key]) || !e[key].length) errors.push(`Electrical rule '${key}' must be a non-empty array.`);
    });
    if (!isPlainObject(e.conductorMaterials) || !Object.keys(e.conductorMaterials).length) errors.push("At least one conductor material is required.");
    if (!isPlainObject(e.installationMethodFactors) || !Object.keys(e.installationMethodFactors).length) errors.push("At least one installation-method factor is required.");
    if (!isPlainObject(e.insulationAmpacityFactors) || !Object.keys(e.insulationAmpacityFactors).length) errors.push("At least one insulation factor is required.");
    if (!String(pack.completeness || "").includes("preliminary") && pack.id !== LEGACY_RULE_PACK_ID) warnings.push("Rule pack completeness does not explicitly state that it is preliminary; do not imply full code compliance without independent validation.");
    return { valid: !errors.length, errors, warnings };
  }

  function resolveThresholdFactor(table, value, thresholdKey) {
    const numeric = Number(value);
    const sorted = [...(Array.isArray(table) ? table : [])].sort((a, b) => Number(a[thresholdKey]) - Number(b[thresholdKey]));
    const row = sorted.find(item => numeric <= Number(item[thresholdKey])) || sorted[sorted.length - 1];
    return row ? Number(row.factor) : 1;
  }

  function nextStandardValue(values, required) {
    return [...values].map(Number).sort((a, b) => a - b).find(value => value + 1e-9 >= required) ?? null;
  }

  function suggestProtectiveEarthSize(phaseSizeMm2, rules, cableSizes = STANDARD_CABLE_SIZES_MM2) {
    if (!Number.isFinite(Number(phaseSizeMm2)) || Number(phaseSizeMm2) <= 0) return null;
    const phase = Number(phaseSizeMm2);
    const row = (rules || []).find(item => phase <= Number(item.phaseMaxMm2));
    if (!row) return null;
    let raw = phase;
    if (row.mode === "fixed") raw = Number(row.valueMm2);
    else if (row.mode === "factor") raw = phase * Number(row.factor);
    return nextStandardValue(cableSizes, raw);
  }

  function normalizeConfiguration(config = {}) {
    return {
      packId: String(config.packId || DEFAULT_RULE_PACK_ID),
      conductorMaterial: String(config.conductorMaterial || "copper"),
      insulation: String(config.insulation || "xlpe90"),
      installationMethod: String(config.installationMethod || "tray"),
      ambientTempC: Number.isFinite(Number(config.ambientTempC)) ? Number(config.ambientTempC) : 40,
      groupedCircuits: Math.max(1, Math.floor(Number(config.groupedCircuits) || 1)),
      jurisdictionOverride: String(config.jurisdictionOverride || "").trim(),
      standardReferenceOverride: String(config.standardReferenceOverride || "").trim(),
      customOverlay: isPlainObject(config.customOverlay) ? deepClone(config.customOverlay) : {},
      migratedFromLegacy: !!config.migratedFromLegacy,
      legacyInputs: isPlainObject(config.legacyInputs) ? deepClone(config.legacyInputs) : {}
    };
  }

  function buildRuleContext(rawConfig = {}) {
    const config = normalizeConfiguration(rawConfig);
    const requestedBase = RULE_PACKS[config.packId] || RULE_PACKS[DEFAULT_RULE_PACK_ID];
    const merged = deepMerge(requestedBase, config.customOverlay);
    // Identity/version of a project overlay stays tied to the base pack; overlays are
    // provenance, not silent replacement packs.
    merged.id = requestedBase.id;
    merged.version = requestedBase.version;
    merged.label = requestedBase.label;
    const validation = validateRulePack(merged);
    const e = merged.electrical || {};
    const warnings = [...validation.warnings];
    const errors = [...validation.errors];
    const material = e.conductorMaterials?.[config.conductorMaterial] || e.conductorMaterials?.copper || Object.values(e.conductorMaterials || {})[0];
    if (!material) errors.push(`Conductor material '${config.conductorMaterial}' is unavailable in this rule pack.`);
    const insulationFactor = Number(e.insulationAmpacityFactors?.[config.insulation]);
    if (!Number.isFinite(insulationFactor) || insulationFactor <= 0) errors.push(`Insulation '${config.insulation}' is unavailable in this rule pack.`);
    const installationFactor = Number(e.installationMethodFactors?.[config.installationMethod]);
    if (!Number.isFinite(installationFactor) || installationFactor <= 0) errors.push(`Installation method '${config.installationMethod}' is unavailable in this rule pack.`);
    const ambientFactor = resolveThresholdFactor(e.ambientCorrection, config.ambientTempC, "maxC");
    const groupingFactor = resolveThresholdFactor(e.groupingCorrection, config.groupedCircuits, "maxCircuits");
    const materialAmpacityFactor = Number(material?.ampacityFactor || 0);
    if (config.ambientTempC > 60) warnings.push("Ambient temperature exceeds 60°C; verify equipment/conductor temperature ratings and routing with the applicable standard/manufacturer data.");
    if (config.groupedCircuits > 9) warnings.push("More than nine grouped circuits are represented by the last configured grouping factor; verify the actual installation method and applicable ampacity table.");
    if (Object.keys(config.customOverlay).length) warnings.push("A project-specific JSON overlay modifies the built-in rule pack. Review the exported overlay and fingerprint as part of engineering QA.");
    warnings.push("Rule-pack results remain preliminary: short-circuit duty, breaking capacity, disconnection time, full earthing design, manufacturer coordination, and complete jurisdictional compliance still require independent verification.");

    let dcDensity = Number(e.baseCurrentDensityDcAmm2) * materialAmpacityFactor * insulationFactor * installationFactor * ambientFactor * groupingFactor;
    let acDensity = Number(e.baseCurrentDensityAcAmm2) * materialAmpacityFactor * insulationFactor * installationFactor * ambientFactor * groupingFactor;
    let dcDesignFactor = Number(e.designCurrentFactorDc);
    let acDesignFactor = Number(e.designCurrentFactorAc);
    let dcDrop = Number(e.dcMaxVoltageDropPct);
    let acDrop = Number(e.acMaxVoltageDropPct);
    let tempResistanceFactor = Number(e.conductorResistanceTempFactor);

    if (requestedBase.id === LEGACY_RULE_PACK_ID && isPlainObject(config.legacyInputs)) {
      const legacy = config.legacyInputs;
      if (finiteInRange(legacy.designCurrentFactor, 1, 3)) dcDesignFactor = acDesignFactor = Number(legacy.designCurrentFactor);
      if (finiteInRange(legacy.dcCurrentDensityAmm2, 0.25, 20)) dcDensity = Number(legacy.dcCurrentDensityAmm2);
      if (finiteInRange(legacy.acCurrentDensityAmm2, 0.25, 20)) acDensity = Number(legacy.acCurrentDensityAmm2);
      if (finiteInRange(legacy.dcMaxVoltageDropPct, 0.1, 20)) dcDrop = Number(legacy.dcMaxVoltageDropPct);
      if (finiteInRange(legacy.acMaxVoltageDropPct, 0.1, 20)) acDrop = Number(legacy.acMaxVoltageDropPct);
      if (finiteInRange(legacy.conductorTempFactor, 1, 3)) tempResistanceFactor = Number(legacy.conductorTempFactor);
    }

    const provenancePayload = {
      engineVersion: RULE_ENGINE_VERSION,
      pack: { id: merged.id, version: merged.version, label: merged.label, jurisdiction: config.jurisdictionOverride || merged.jurisdiction, standardReference: config.standardReferenceOverride || merged.standardReference },
      configuration: { conductorMaterial: config.conductorMaterial, insulation: config.insulation, installationMethod: config.installationMethod, ambientTempC: config.ambientTempC, groupedCircuits: config.groupedCircuits },
      overlay: config.customOverlay,
      resolved: { dcDesignFactor, acDesignFactor, dcDensity, acDensity, dcDrop, acDrop, tempResistanceFactor, ambientFactor, groupingFactor, installationFactor, insulationFactor, materialAmpacityFactor }
    };
    const fingerprint = calculateRulePackFingerprint(provenancePayload);
    const jurisdiction = config.jurisdictionOverride || merged.jurisdiction;
    const standardReference = config.standardReferenceOverride || merged.standardReference;
    const trace = [
      { rule: "Rule pack", source: `${merged.id}@${merged.version}`, value: merged.label, basis: merged.description },
      { rule: "Jurisdiction metadata", source: config.jurisdictionOverride ? "Project override" : "Rule pack", value: jurisdiction, basis: "Provenance only; does not certify code compliance." },
      { rule: "Standard/reference metadata", source: config.standardReferenceOverride ? "Project override" : "Rule pack", value: standardReference, basis: "Reference metadata; complete applicable-standard implementation is not claimed." },
      { rule: "Conductor material", source: "Project configuration", value: material?.label || config.conductorMaterial, basis: `Resistivity ${Number(material?.resistivityOhmMm2M || 0).toFixed(4)} Ω·mm²/m; ampacity factor ${materialAmpacityFactor.toFixed(3)}.` },
      { rule: "Ambient correction", source: `${merged.id}@${merged.version}`, value: ambientFactor.toFixed(3), basis: `${config.ambientTempC.toFixed(1)}°C design ambient.` },
      { rule: "Grouping correction", source: `${merged.id}@${merged.version}`, value: groupingFactor.toFixed(3), basis: `${config.groupedCircuits} grouped circuit(s).` },
      { rule: "Installation correction", source: `${merged.id}@${merged.version}`, value: installationFactor.toFixed(3), basis: config.installationMethod },
      { rule: "Insulation correction", source: `${merged.id}@${merged.version}`, value: insulationFactor.toFixed(3), basis: config.insulation },
      { rule: "Resolved DC current density", source: requestedBase.id === LEGACY_RULE_PACK_ID ? "Legacy project input" : "Rule-pack factors", value: `${dcDensity.toFixed(3)} A/mm²`, basis: "Preliminary current-density sizing heuristic after configured correction factors." },
      { rule: "Resolved AC current density", source: requestedBase.id === LEGACY_RULE_PACK_ID ? "Legacy project input" : "Rule-pack factors", value: `${acDensity.toFixed(3)} A/mm²`, basis: "Preliminary current-density sizing heuristic after configured correction factors." },
      { rule: "Voltage-drop limits", source: requestedBase.id === LEGACY_RULE_PACK_ID ? "Legacy project input" : `${merged.id}@${merged.version}`, value: `DC ${dcDrop.toFixed(2)}% / AC ${acDrop.toFixed(2)}%`, basis: "Maximum circuit voltage-drop assumptions." },
      { rule: "Design-current factors", source: requestedBase.id === LEGACY_RULE_PACK_ID ? "Legacy project input" : `${merged.id}@${merged.version}`, value: `DC ${dcDesignFactor.toFixed(3)} / AC ${acDesignFactor.toFixed(3)}`, basis: "Preliminary sizing multipliers; verify applicable continuous-current and PV source-circuit rules." },
      { rule: "SPD basis", source: `${merged.id}@${merged.version}`, value: `${e.spdDc}; ${e.spdAc}`, basis: "Preliminary SPD type prompt only; final voltage/lightning/coordination study required." },
      { rule: "Access / setback prompt", source: `${merged.id}@${merged.version}`, value: `edge ≥ ${Number(merged.site?.minimumEdgeSetbackM || 0).toFixed(2)} m; obstacle ≥ ${Number(merged.site?.minimumObstacleClearanceM || 0).toFixed(2)} m`, basis: merged.site?.accessFireNote || "Project-specific verification required." },
      { rule: "Rule fingerprint", source: `SolarPVRulePacks ${RULE_ENGINE_VERSION}`, value: fingerprint, basis: "Deterministic fingerprint of resolved rule-pack configuration and project overlay." }
    ];

    return {
      valid: !errors.length,
      errors,
      warnings,
      engineVersion: RULE_ENGINE_VERSION,
      packId: merged.id,
      packVersion: merged.version,
      packLabel: merged.label,
      completeness: merged.completeness,
      jurisdiction,
      standardReference,
      description: merged.description,
      fingerprint,
      config,
      mergedPack: merged,
      conductorMaterial: config.conductorMaterial,
      conductorMaterialLabel: material?.label || config.conductorMaterial,
      insulation: config.insulation,
      installationMethod: config.installationMethod,
      ambientTempC: config.ambientTempC,
      groupedCircuits: config.groupedCircuits,
      resistivityOhmMm2M: Number(material?.resistivityOhmMm2M || 0.0175),
      materialAmpacityFactor,
      insulationFactor,
      installationFactor,
      ambientFactor,
      groupingFactor,
      dcCurrentDensityAmm2: dcDensity,
      acCurrentDensityAmm2: acDensity,
      dcDesignCurrentFactor: dcDesignFactor,
      acDesignCurrentFactor: acDesignFactor,
      conductorTempFactor: tempResistanceFactor,
      dcMaxVoltageDropPct: dcDrop,
      acMaxVoltageDropPct: acDrop,
      cableSizesMm2: [...(e.cableSizesMm2 || STANDARD_CABLE_SIZES_MM2)],
      protectionRatingsA: [...(e.protectionRatingsA || STANDARD_PROTECTION_RATINGS_A)],
      stringFuseParallelThreshold: Math.max(2, Math.floor(Number(e.stringFuseParallelThreshold) || 2)),
      stringFuseDesignMultiplier: Number(e.stringFuseDesignMultiplier || 1),
      acBreakerDesignMultiplier: Number(e.acBreakerDesignMultiplier || 1),
      dcIsolatorDesignMultiplier: Number(e.dcIsolatorDesignMultiplier || 1),
      peRules: deepClone(e.peRules || []),
      spdDc: String(e.spdDc || "DC SPD project-specific"),
      spdAc: String(e.spdAc || "AC SPD project-specific"),
      minimumEdgeSetbackM: Number(merged.site?.minimumEdgeSetbackM || 0),
      minimumObstacleClearanceM: Number(merged.site?.minimumObstacleClearanceM || 0),
      accessFireNote: String(merged.site?.accessFireNote || "Project-specific access/fire verification required."),
      trace
    };
  }

  function compareRuleContexts(configurations) {
    return (Array.isArray(configurations) ? configurations : []).map(config => {
      const context = buildRuleContext(config);
      return {
        label: String(config?.scenarioLabel || context.packLabel),
        packId: context.packId,
        packVersion: context.packVersion,
        fingerprint: context.fingerprint,
        valid: context.valid,
        dcCurrentDensityAmm2: context.dcCurrentDensityAmm2,
        acCurrentDensityAmm2: context.acCurrentDensityAmm2,
        dcMaxVoltageDropPct: context.dcMaxVoltageDropPct,
        acMaxVoltageDropPct: context.acMaxVoltageDropPct,
        dcDesignCurrentFactor: context.dcDesignCurrentFactor,
        acDesignCurrentFactor: context.acDesignCurrentFactor,
        warnings: [...context.warnings],
        errors: [...context.errors]
      };
    });
  }

  global.SolarPVRulePacks = Object.freeze({
    version: RULE_ENGINE_VERSION,
    deterministic: true,
    DEFAULT_RULE_PACK_ID,
    LEGACY_RULE_PACK_ID,
    STANDARD_CABLE_SIZES_MM2,
    STANDARD_PROTECTION_RATINGS_A,
    listRulePacks,
    getRulePack,
    validateRulePack,
    normalizeConfiguration,
    buildRuleContext,
    compareRuleContexts,
    calculateRulePackFingerprint,
    nextStandardValue,
    suggestProtectiveEarthSize
  });
})(globalThis);
