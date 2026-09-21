"use strict";

/* Solar PV Design Platform v2.0 Alpha 1 - formal rule-pack contract.

   This module intentionally does NOT add new engineering formulas or standards
   data. It wraps the frozen v1.9 SolarPVRulePacks engine with a versioned,
   deterministic contract for validation, canonicalization, import/export,
   capability declaration, evidence metadata and constrained project overlays.

   v1.9 engineering calculations and the legacy rule-xxxxxxxx fingerprint remain
   owned by solar_pv_design_platform_v1.9_rules.js. Native v2 contract artifacts
   use a separate versioned SHA-256 fingerprint namespace. */

(function initSolarPVRulePackContract(global) {
  const CONTRACT_MODULE_VERSION = "2.0.0-alpha.1";
  const RULE_PACK_SCHEMA_VERSION = "2.0.0";
  const CANONICALIZATION_VERSION = "spvdp-rulepack-canonical-json-v1";
  const FINGERPRINT_ALGORITHM = `${CANONICALIZATION_VERSION}+sha256`;
  const FINGERPRINT_PREFIX = "rulepack-v2-sha256-";
  const V19_ENGINE_VERSION = "1.9.0";

  const v19 = global.SolarPVRulePacks;
  if (!v19 || v19.version !== V19_ENGINE_VERSION) {
    throw new Error("SolarPVRulePackContract v2.0 requires the frozen SolarPVRulePacks v1.9.0 module to load first.");
  }

  const BLOCKED_KEYS = Object.freeze(["__proto__", "prototype", "constructor"]);
  const BLOCKED_KEY_SET = new Set(BLOCKED_KEYS);

  const UNIT_IDS = Object.freeze([
    "ratio",
    "A_per_mm2",
    "percent",
    "ohm_mm2_per_m",
    "degC",
    "mm2",
    "A",
    "m",
    "count"
  ]);
  const UNIT_SET = new Set(UNIT_IDS);

  const CAPABILITY_IDS = Object.freeze([
    "design-current",
    "current-density-sizing",
    "ampacity",
    "voltage-drop",
    "conductor-sizing",
    "protective-conductor-sizing",
    "protection-selection",
    "fault-current",
    "breaking-capacity",
    "disconnection-time",
    "protection-coordination",
    "earthing",
    "spd-prompt",
    "spd-coordination",
    "access-fire-constraints"
  ]);
  const CAPABILITY_SET = new Set(CAPABILITY_IDS);

  const CAPABILITY_STATES = new Set([
    "implemented-preliminary",
    "disabled",
    "unsupported",
    "not-implemented"
  ]);
  const CAPABILITY_VALIDATION_STATES = new Set(["not-validated", "validated"]);

  const FAMILY_IDS = Object.freeze([
    "design-current",
    "current-density-heuristic",
    "voltage-drop-limits",
    "conductor-resistance",
    "conductor-materials",
    "insulation-correction",
    "installation-correction",
    "ambient-correction",
    "grouping-correction",
    "cable-size-table",
    "protection-rating-table",
    "protection-prompts",
    "protective-earth-sizing",
    "spd-prompts",
    "site-access-prompts"
  ]);
  const FAMILY_SET = new Set(FAMILY_IDS);

  const FAMILY_CAPABILITY = Object.freeze({
    "design-current": "design-current",
    "current-density-heuristic": "current-density-sizing",
    "voltage-drop-limits": "voltage-drop",
    "conductor-resistance": "conductor-sizing",
    "conductor-materials": "conductor-sizing",
    "insulation-correction": "conductor-sizing",
    "installation-correction": "conductor-sizing",
    "ambient-correction": "conductor-sizing",
    "grouping-correction": "conductor-sizing",
    "cable-size-table": "conductor-sizing",
    "protection-rating-table": "protection-selection",
    "protection-prompts": "protection-selection",
    "protective-earth-sizing": "protective-conductor-sizing",
    "spd-prompts": "spd-prompt",
    "site-access-prompts": "access-fire-constraints"
  });

  const STRICT_V19_OVERLAY_ALLOWED_PATHS = Object.freeze([
    "electrical.designCurrentFactorDc",
    "electrical.designCurrentFactorAc",
    "electrical.baseCurrentDensityDcAmm2",
    "electrical.baseCurrentDensityAcAmm2",
    "electrical.dcMaxVoltageDropPct",
    "electrical.acMaxVoltageDropPct",
    "electrical.conductorResistanceTempFactor",
    "electrical.conductorMaterials.copper.resistivityOhmMm2M",
    "electrical.conductorMaterials.copper.ampacityFactor",
    "electrical.conductorMaterials.aluminum.resistivityOhmMm2M",
    "electrical.conductorMaterials.aluminum.ampacityFactor",
    "electrical.insulationAmpacityFactors.pvc70",
    "electrical.insulationAmpacityFactors.xlpe90",
    "electrical.installationMethodFactors.open_air",
    "electrical.installationMethodFactors.tray",
    "electrical.installationMethodFactors.conduit",
    "electrical.installationMethodFactors.buried",
    "electrical.ambientCorrection",
    "electrical.groupingCorrection",
    "electrical.cableSizesMm2",
    "electrical.protectionRatingsA",
    "electrical.stringFuseParallelThreshold",
    "electrical.stringFuseDesignMultiplier",
    "electrical.acBreakerDesignMultiplier",
    "electrical.dcIsolatorDesignMultiplier",
    "electrical.peRules",
    "electrical.spdDc",
    "electrical.spdAc",
    "site.minimumEdgeSetbackM",
    "site.minimumObstacleClearanceM",
    "site.accessFireNote"
  ].sort());
  const STRICT_V19_OVERLAY_ALLOWED_SET = new Set(STRICT_V19_OVERLAY_ALLOWED_PATHS);

  const LEGACY_FROZEN_METADATA_PATHS = Object.freeze([
    "jurisdiction",
    "standardReference",
    "description",
    "completeness"
  ]);
  const LEGACY_FROZEN_METADATA_SET = new Set(LEGACY_FROZEN_METADATA_PATHS);

  const OVERLAY_FORBIDDEN_PATHS = Object.freeze([
    "id",
    "version",
    "label",
    "identity",
    "identity.packId",
    "identity.engineeringVersion",
    "identity.rulePackSchemaVersion",
    "identity.provenance",
    "identity.lifecycleStatus",
    "identity.claims",
    "compatibility",
    "capabilities",
    "overlay"
  ]);

  const SAFETY_RESTRICTIONS = Object.freeze([
    "reject-unknown-engineering-paths",
    "reject-prototype-pollution-keys",
    "immutable-pack-identity",
    "immutable-capability-declarations",
    "immutable-review-provenance"
  ]);
  const SAFETY_RESTRICTION_SET = new Set(SAFETY_RESTRICTIONS);

  const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  const PROJECT_SCHEMA_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-.][0-9A-Za-z.-]+)?$/;
  const PACK_ID_RE = /^[A-Z0-9][A-Z0-9._-]{2,127}$/;
  const TOKEN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const MAP_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  const EXTENSION_KEY_RE = /^[a-z0-9][a-z0-9.-]{1,63}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function deepCloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function errorRecord(code, path, message, severity = "error") {
    return { code, path, message, severity };
  }

  function addError(errors, code, path, message, severity = "error") {
    errors.push(errorRecord(code, path, message, severity));
  }

  function sortedObjectKeys(value) {
    return Object.keys(value || {}).sort((a, b) => a.localeCompare(b));
  }

  function scanUnsafeKeys(value, path = "$", errors = []) {
    if (!value || typeof value !== "object") return errors;
    if (Array.isArray(value)) {
      value.forEach((item, index) => scanUnsafeKeys(item, `${path}[${index}]`, errors));
      return errors;
    }
    for (const key of sortedObjectKeys(value)) {
      if (BLOCKED_KEY_SET.has(key)) {
        addError(errors, "UNSAFE_KEY", `${path}.${key}`, `Key '${key}' is forbidden because it can participate in prototype-pollution attacks.`);
      }
      scanUnsafeKeys(value[key], `${path}.${key}`, errors);
    }
    return errors;
  }

  function validateKnownKeys(object, allowed, path, errors) {
    if (!isPlainObject(object)) return;
    const allowedSet = new Set(allowed);
    for (const key of sortedObjectKeys(object)) {
      if (!allowedSet.has(key)) {
        addError(errors, "UNKNOWN_KEY", `${path}.${key}`, `Unknown key '${key}' is not permitted by rule-pack schema ${RULE_PACK_SCHEMA_VERSION}.`);
      }
    }
  }

  function requireObject(value, path, errors) {
    if (!isPlainObject(value)) {
      addError(errors, "TYPE_OBJECT", path, "Expected a JSON object.");
      return false;
    }
    return true;
  }

  function requireNonEmptyString(value, path, errors) {
    if (typeof value !== "string" || !value.trim()) {
      addError(errors, "REQUIRED", path, "Expected a non-empty string.");
      return false;
    }
    return true;
  }

  function requireArray(value, path, errors, allowEmpty = false) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
      addError(errors, "TYPE_ARRAY", path, allowEmpty ? "Expected an array." : "Expected a non-empty array.");
      return false;
    }
    return true;
  }

  function validateSemver(value, path, errors) {
    if (!requireNonEmptyString(value, path, errors)) return false;
    if (!SEMVER_RE.test(value)) {
      addError(errors, "INVALID_SEMVER", path, `Expected a Semantic Version 2.0.0 value; received '${value}'.`);
      return false;
    }
    return true;
  }

  function validateQuantity(value, expectedUnit, path, errors, options = {}) {
    if (!requireObject(value, path, errors)) return false;
    validateKnownKeys(value, ["value", "unit"], path, errors);
    if (!Object.prototype.hasOwnProperty.call(value, "value")) addError(errors, "REQUIRED", `${path}.value`, "Quantity value is required.");
    if (!Object.prototype.hasOwnProperty.call(value, "unit")) addError(errors, "REQUIRED", `${path}.unit`, "Quantity unit is required.");
    if (!Number.isFinite(value.value)) {
      addError(errors, "INVALID_NUMBER", `${path}.value`, "Engineering quantity must be a finite JSON number; string coercion is not permitted.");
    } else {
      if (options.integer && !Number.isInteger(value.value)) addError(errors, "INVALID_NUMBER", `${path}.value`, "Engineering quantity must be an integer.");
      if (options.min != null && value.value < options.min) addError(errors, "INVALID_NUMBER", `${path}.value`, `Engineering quantity must be >= ${options.min}.`);
      if (options.max != null && value.value > options.max) addError(errors, "INVALID_NUMBER", `${path}.value`, `Engineering quantity must be <= ${options.max}.`);
    }
    if (typeof value.unit !== "string" || !UNIT_SET.has(value.unit)) {
      addError(errors, "INVALID_UNIT", `${path}.unit`, `Unit must be one of: ${UNIT_IDS.join(", ")}.`);
    } else if (expectedUnit && value.unit !== expectedUnit) {
      addError(errors, "INVALID_UNIT", `${path}.unit`, `Expected unit '${expectedUnit}', received '${value.unit}'.`);
    }
    return true;
  }

  function validateMetadataExtensionValue(value, path, errors) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      addError(errors, "EXTENSION_ENGINEERING_NUMBER", path, "Numeric values are not allowed in metadata extensions; engineering quantities belong in validated rule families with explicit units.");
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => validateMetadataExtensionValue(item, `${path}[${index}]`, errors));
      return;
    }
    if (isPlainObject(value)) {
      for (const key of sortedObjectKeys(value)) validateMetadataExtensionValue(value[key], `${path}.${key}`, errors);
      return;
    }
    addError(errors, "INVALID_EXTENSION_VALUE", path, "Metadata extensions must contain JSON strings, booleans, nulls, arrays or objects only.");
  }

  function validateIdentity(identity, errors) {
    const path = "$.identity";
    if (!requireObject(identity, path, errors)) return;
    validateKnownKeys(identity, ["packId", "engineeringVersion", "rulePackSchemaVersion", "name", "description", "lifecycleStatus", "claims", "provenance"], path, errors);

    if (requireNonEmptyString(identity.packId, `${path}.packId`, errors) && !PACK_ID_RE.test(identity.packId)) {
      addError(errors, "INVALID_PACK_ID", `${path}.packId`, "Pack ID must be 3-128 characters using uppercase A-Z, digits, dot, underscore or hyphen.");
    }
    validateSemver(identity.engineeringVersion, `${path}.engineeringVersion`, errors);
    if (identity.rulePackSchemaVersion !== RULE_PACK_SCHEMA_VERSION) {
      addError(errors, "INVALID_SCHEMA_VERSION", `${path}.rulePackSchemaVersion`, `Only rule-pack schema ${RULE_PACK_SCHEMA_VERSION} is supported by this Alpha 1 validator.`);
    }
    requireNonEmptyString(identity.name, `${path}.name`, errors);
    requireNonEmptyString(identity.description, `${path}.description`, errors);
    if (!new Set(["draft", "preliminary", "validated", "retired", "legacy-compatibility"]).has(identity.lifecycleStatus)) {
      addError(errors, "INVALID_ENUM", `${path}.lifecycleStatus`, "Lifecycle status must be draft, preliminary, validated, retired, or legacy-compatibility.");
    }

    const claims = identity.claims;
    if (requireObject(claims, `${path}.claims`, errors)) {
      validateKnownKeys(claims, ["softwareImplementation", "deterministicTests", "engineeringEvidence", "independentReview", "regulatoryComplianceClaim"], `${path}.claims`, errors);
      const enums = [
        ["softwareImplementation", new Set(["implemented", "partial", "scaffold-only"])],
        ["deterministicTests", new Set(["not-defined", "defined", "passing"])],
        ["engineeringEvidence", new Set(["not-validated", "validated"])],
        ["independentReview", new Set(["not-completed", "completed"])],
        ["regulatoryComplianceClaim", new Set(["not-permitted", "permitted"])]
      ];
      for (const [key, allowed] of enums) {
        if (!allowed.has(claims[key])) addError(errors, "INVALID_ENUM", `${path}.claims.${key}`, `Invalid claim status '${claims[key]}'.`);
      }
      if (claims.regulatoryComplianceClaim === "permitted") {
        if (claims.deterministicTests !== "passing" || claims.engineeringEvidence !== "validated" || claims.independentReview !== "completed" || identity.lifecycleStatus !== "validated") {
          addError(errors, "INVALID_CLAIM_COMBINATION", `${path}.claims.regulatoryComplianceClaim`, "A permitted regulatory/compliance claim requires passing deterministic tests, validated engineering evidence, completed independent review, and validated lifecycle status.");
        }
      }
      if (identity.lifecycleStatus === "validated" && (claims.engineeringEvidence !== "validated" || claims.independentReview !== "completed")) {
        addError(errors, "INVALID_CLAIM_COMBINATION", `${path}.lifecycleStatus`, "A validated lifecycle status requires validated engineering evidence and completed independent review.");
      }
    }

    const provenance = identity.provenance;
    if (requireObject(provenance, `${path}.provenance`, errors)) {
      validateKnownKeys(provenance, ["sourceReferences"], `${path}.provenance`, errors);
      if (requireArray(provenance.sourceReferences, `${path}.provenance.sourceReferences`, errors)) {
        const ids = new Set();
        provenance.sourceReferences.forEach((source, index) => {
          const sourcePath = `${path}.provenance.sourceReferences[${index}]`;
          if (!requireObject(source, sourcePath, errors)) return;
          validateKnownKeys(source, ["id", "type", "title", "locator"], sourcePath, errors);
          for (const key of ["id", "type", "title", "locator"]) requireNonEmptyString(source[key], `${sourcePath}.${key}`, errors);
          if (typeof source.id === "string") {
            if (!TOKEN_ID_RE.test(source.id)) addError(errors, "INVALID_EVIDENCE", `${sourcePath}.id`, "Evidence source ID contains unsupported characters.");
            if (ids.has(source.id)) addError(errors, "DUPLICATE_ID", `${sourcePath}.id`, `Duplicate evidence source ID '${source.id}'.`);
            ids.add(source.id);
          }
        });
      }
    }
  }

  function validateCompatibility(compatibility, errors) {
    const path = "$.compatibility";
    if (!requireObject(compatibility, path, errors)) return;
    validateKnownKeys(compatibility, ["applicationVersions", "ruleEngineVersions", "projectSchemaVersions", "compatibilityMode", "legacyPackIdentity", "deprecatedBy", "migrationNotes"], path, errors);

    for (const [key, validator] of [
      ["applicationVersions", validateSemver],
      ["ruleEngineVersions", validateSemver]
    ]) {
      if (requireArray(compatibility[key], `${path}.${key}`, errors)) {
        const seen = new Set();
        compatibility[key].forEach((item, index) => {
          validator(item, `${path}.${key}[${index}]`, errors);
          if (seen.has(item)) addError(errors, "DUPLICATE_ID", `${path}.${key}[${index}]`, `Duplicate compatibility version '${item}'.`);
          seen.add(item);
        });
      }
    }
    if (requireArray(compatibility.projectSchemaVersions, `${path}.projectSchemaVersions`, errors)) {
      const seen = new Set();
      compatibility.projectSchemaVersions.forEach((item, index) => {
        if (typeof item !== "string" || !PROJECT_SCHEMA_RE.test(item)) addError(errors, "INVALID_VERSION", `${path}.projectSchemaVersions[${index}]`, `Invalid project schema version '${item}'.`);
        if (seen.has(item)) addError(errors, "DUPLICATE_ID", `${path}.projectSchemaVersions[${index}]`, `Duplicate project schema version '${item}'.`);
        seen.add(item);
      });
    }
    if (!new Set(["native-v2", "v1.9-adapter"]).has(compatibility.compatibilityMode)) {
      addError(errors, "INVALID_ENUM", `${path}.compatibilityMode`, "Compatibility mode must be native-v2 or v1.9-adapter.");
    }
    if (compatibility.legacyPackIdentity != null) {
      const legacyPath = `${path}.legacyPackIdentity`;
      if (requireObject(compatibility.legacyPackIdentity, legacyPath, errors)) {
        validateKnownKeys(compatibility.legacyPackIdentity, ["id", "version"], legacyPath, errors);
        requireNonEmptyString(compatibility.legacyPackIdentity.id, `${legacyPath}.id`, errors);
        requireNonEmptyString(compatibility.legacyPackIdentity.version, `${legacyPath}.version`, errors);
      }
    }
    if (compatibility.deprecatedBy != null && typeof compatibility.deprecatedBy !== "string") addError(errors, "TYPE_STRING", `${path}.deprecatedBy`, "deprecatedBy must be a string or null.");
    if (compatibility.migrationNotes != null && typeof compatibility.migrationNotes !== "string") addError(errors, "TYPE_STRING", `${path}.migrationNotes`, "migrationNotes must be a string or null.");
  }

  function validateCapabilities(capabilities, errors) {
    const path = "$.capabilities";
    if (!requireObject(capabilities, path, errors)) return;
    const keys = sortedObjectKeys(capabilities);
    for (const id of keys) {
      if (!CAPABILITY_SET.has(id)) addError(errors, "UNSUPPORTED_CAPABILITY", `${path}.${id}`, `Unsupported capability declaration '${id}'.`);
    }
    for (const id of CAPABILITY_IDS) {
      if (!Object.prototype.hasOwnProperty.call(capabilities, id)) {
        addError(errors, "REQUIRED_CAPABILITY", `${path}.${id}`, `Capability '${id}' must be declared explicitly, even when unsupported.`);
        continue;
      }
      const capability = capabilities[id];
      const capabilityPath = `${path}.${id}`;
      if (!requireObject(capability, capabilityPath, errors)) continue;
      validateKnownKeys(capability, ["state", "validationStatus", "scope"], capabilityPath, errors);
      if (!CAPABILITY_STATES.has(capability.state)) addError(errors, "INVALID_CAPABILITY", `${capabilityPath}.state`, `Unsupported capability state '${capability.state}'.`);
      if (!CAPABILITY_VALIDATION_STATES.has(capability.validationStatus)) addError(errors, "INVALID_CAPABILITY", `${capabilityPath}.validationStatus`, `Unsupported capability validation state '${capability.validationStatus}'.`);
      requireNonEmptyString(capability.scope, `${capabilityPath}.scope`, errors);
      if (capability.validationStatus === "validated" && new Set(["unsupported", "not-implemented", "disabled"]).has(capability.state)) {
        addError(errors, "INVALID_CAPABILITY_COMBINATION", capabilityPath, "An unsupported, disabled or not-implemented capability cannot be marked validated.");
      }
    }
  }

  function validateFamilyMetadata(family, path, errors, sourceIds) {
    validateKnownKeys(family, ["id", "capability", "applicability", "assumptions", "implementationStatus", "validationStatus", "reviewStatus", "evidence", "data"], path, errors);
    if (!FAMILY_SET.has(family.id)) addError(errors, "MALFORMED_RULE_FAMILY", `${path}.id`, `Unsupported rule-family identifier '${family.id}'.`);
    const expectedCapability = FAMILY_CAPABILITY[family.id];
    if (family.capability !== expectedCapability) addError(errors, "INVALID_CAPABILITY_COMBINATION", `${path}.capability`, `Rule family '${family.id}' must bind to capability '${expectedCapability}'.`);

    const applicability = family.applicability;
    if (requireObject(applicability, `${path}.applicability`, errors)) {
      validateKnownKeys(applicability, ["scope", "conditions"], `${path}.applicability`, errors);
      requireNonEmptyString(applicability.scope, `${path}.applicability.scope`, errors);
      if (requireArray(applicability.conditions, `${path}.applicability.conditions`, errors, true)) {
        applicability.conditions.forEach((item, index) => {
          if (typeof item !== "string") addError(errors, "TYPE_STRING", `${path}.applicability.conditions[${index}]`, "Applicability condition must be a string.");
        });
      }
    }
    if (requireArray(family.assumptions, `${path}.assumptions`, errors, true)) {
      family.assumptions.forEach((item, index) => {
        if (typeof item !== "string") addError(errors, "TYPE_STRING", `${path}.assumptions[${index}]`, "Assumption must be a string.");
      });
    }
    if (!new Set(["implemented", "partial", "scaffold-only"]).has(family.implementationStatus)) addError(errors, "INVALID_ENUM", `${path}.implementationStatus`, `Invalid implementation status '${family.implementationStatus}'.`);
    if (!new Set(["not-validated", "validated"]).has(family.validationStatus)) addError(errors, "INVALID_ENUM", `${path}.validationStatus`, `Invalid validation status '${family.validationStatus}'.`);
    if (!new Set(["not-reviewed", "independent-review-complete"]).has(family.reviewStatus)) addError(errors, "INVALID_ENUM", `${path}.reviewStatus`, `Invalid review status '${family.reviewStatus}'.`);
    if (family.validationStatus === "validated" && family.reviewStatus !== "independent-review-complete") addError(errors, "INVALID_CLAIM_COMBINATION", path, "A validated rule family requires completed independent review.");

    const evidence = family.evidence;
    if (requireObject(evidence, `${path}.evidence`, errors)) {
      validateKnownKeys(evidence, ["sourceReferences", "testIds"], `${path}.evidence`, errors);
      if (requireArray(evidence.sourceReferences, `${path}.evidence.sourceReferences`, errors)) {
        evidence.sourceReferences.forEach((id, index) => {
          if (typeof id !== "string" || !sourceIds.has(id)) addError(errors, "INVALID_EVIDENCE", `${path}.evidence.sourceReferences[${index}]`, `Evidence reference '${id}' is not declared in pack provenance.`);
        });
      }
      if (requireArray(evidence.testIds, `${path}.evidence.testIds`, errors)) {
        const seen = new Set();
        evidence.testIds.forEach((id, index) => {
          if (typeof id !== "string" || !TOKEN_ID_RE.test(id)) addError(errors, "INVALID_EVIDENCE", `${path}.evidence.testIds[${index}]`, `Invalid test ID '${id}'.`);
          if (seen.has(id)) addError(errors, "DUPLICATE_ID", `${path}.evidence.testIds[${index}]`, `Duplicate test ID '${id}'.`);
          seen.add(id);
        });
      }
    }
  }

  function validateFactorMap(map, path, errors) {
    if (!requireObject(map, path, errors)) return;
    const keys = sortedObjectKeys(map);
    if (!keys.length) addError(errors, "REQUIRED", path, "At least one factor entry is required.");
    for (const key of keys) {
      if (!MAP_KEY_RE.test(key)) addError(errors, "INVALID_ID", `${path}.${key}`, `Unsupported factor identifier '${key}'.`);
      validateQuantity(map[key], "ratio", `${path}.${key}`, errors, { min: 0.000001, max: 1000 });
    }
  }

  function validateFamilyData(family, path, errors) {
    const dataPath = `${path}.data`;
    const data = family.data;
    if (!requireObject(data, dataPath, errors)) return;

    switch (family.id) {
      case "design-current":
        validateKnownKeys(data, ["dcFactor", "acFactor"], dataPath, errors);
        validateQuantity(data.dcFactor, "ratio", `${dataPath}.dcFactor`, errors, { min: 1, max: 3 });
        validateQuantity(data.acFactor, "ratio", `${dataPath}.acFactor`, errors, { min: 1, max: 3 });
        break;
      case "current-density-heuristic":
        validateKnownKeys(data, ["dcBase", "acBase"], dataPath, errors);
        validateQuantity(data.dcBase, "A_per_mm2", `${dataPath}.dcBase`, errors, { min: 0.25, max: 20 });
        validateQuantity(data.acBase, "A_per_mm2", `${dataPath}.acBase`, errors, { min: 0.25, max: 20 });
        break;
      case "voltage-drop-limits":
        validateKnownKeys(data, ["dcMax", "acMax"], dataPath, errors);
        validateQuantity(data.dcMax, "percent", `${dataPath}.dcMax`, errors, { min: 0.1, max: 20 });
        validateQuantity(data.acMax, "percent", `${dataPath}.acMax`, errors, { min: 0.1, max: 20 });
        break;
      case "conductor-resistance":
        validateKnownKeys(data, ["temperatureFactor"], dataPath, errors);
        validateQuantity(data.temperatureFactor, "ratio", `${dataPath}.temperatureFactor`, errors, { min: 1, max: 3 });
        break;
      case "conductor-materials": {
        validateKnownKeys(data, ["materials"], dataPath, errors);
        const materialsPath = `${dataPath}.materials`;
        if (!requireObject(data.materials, materialsPath, errors)) break;
        const materialKeys = sortedObjectKeys(data.materials);
        if (!materialKeys.length) addError(errors, "REQUIRED", materialsPath, "At least one conductor material is required.");
        for (const key of materialKeys) {
          const materialPath = `${materialsPath}.${key}`;
          if (!MAP_KEY_RE.test(key)) addError(errors, "INVALID_ID", materialPath, `Unsupported conductor-material identifier '${key}'.`);
          const material = data.materials[key];
          if (!requireObject(material, materialPath, errors)) continue;
          validateKnownKeys(material, ["label", "resistivity", "ampacityFactor"], materialPath, errors);
          requireNonEmptyString(material.label, `${materialPath}.label`, errors);
          validateQuantity(material.resistivity, "ohm_mm2_per_m", `${materialPath}.resistivity`, errors, { min: 0.0000001, max: 10 });
          validateQuantity(material.ampacityFactor, "ratio", `${materialPath}.ampacityFactor`, errors, { min: 0.000001, max: 10 });
        }
        break;
      }
      case "insulation-correction":
      case "installation-correction":
        validateKnownKeys(data, ["factors"], dataPath, errors);
        validateFactorMap(data.factors, `${dataPath}.factors`, errors);
        break;
      case "ambient-correction": {
        validateKnownKeys(data, ["rows"], dataPath, errors);
        if (!requireArray(data.rows, `${dataPath}.rows`, errors)) break;
        let previous = -Infinity;
        data.rows.forEach((row, index) => {
          const rowPath = `${dataPath}.rows[${index}]`;
          if (!requireObject(row, rowPath, errors)) return;
          validateKnownKeys(row, ["maxTemperature", "factor"], rowPath, errors);
          validateQuantity(row.maxTemperature, "degC", `${rowPath}.maxTemperature`, errors, { min: -100, max: 200 });
          validateQuantity(row.factor, "ratio", `${rowPath}.factor`, errors, { min: 0.000001, max: 10 });
          const current = row?.maxTemperature?.value;
          if (Number.isFinite(current) && current <= previous) addError(errors, "MALFORMED_TABLE", `${rowPath}.maxTemperature.value`, "Ambient thresholds must be strictly increasing and unique.");
          if (Number.isFinite(current)) previous = current;
        });
        break;
      }
      case "grouping-correction": {
        validateKnownKeys(data, ["rows"], dataPath, errors);
        if (!requireArray(data.rows, `${dataPath}.rows`, errors)) break;
        let previous = -Infinity;
        data.rows.forEach((row, index) => {
          const rowPath = `${dataPath}.rows[${index}]`;
          if (!requireObject(row, rowPath, errors)) return;
          validateKnownKeys(row, ["maxCircuits", "factor"], rowPath, errors);
          validateQuantity(row.maxCircuits, "count", `${rowPath}.maxCircuits`, errors, { min: 1, max: 100000, integer: true });
          validateQuantity(row.factor, "ratio", `${rowPath}.factor`, errors, { min: 0.000001, max: 10 });
          const current = row?.maxCircuits?.value;
          if (Number.isFinite(current) && current <= previous) addError(errors, "MALFORMED_TABLE", `${rowPath}.maxCircuits.value`, "Grouping thresholds must be strictly increasing and unique.");
          if (Number.isFinite(current)) previous = current;
        });
        break;
      }
      case "cable-size-table":
      case "protection-rating-table": {
        const key = family.id === "cable-size-table" ? "sizes" : "ratings";
        const unit = family.id === "cable-size-table" ? "mm2" : "A";
        validateKnownKeys(data, [key], dataPath, errors);
        if (!requireArray(data[key], `${dataPath}.${key}`, errors)) break;
        let previous = -Infinity;
        data[key].forEach((quantity, index) => {
          const quantityPath = `${dataPath}.${key}[${index}]`;
          validateQuantity(quantity, unit, quantityPath, errors, { min: 0.000001, max: 1000000 });
          const current = quantity?.value;
          if (Number.isFinite(current) && current <= previous) addError(errors, "MALFORMED_TABLE", `${quantityPath}.value`, `${key} must be strictly increasing and unique.`);
          if (Number.isFinite(current)) previous = current;
        });
        break;
      }
      case "protection-prompts":
        validateKnownKeys(data, ["stringFuseParallelThreshold", "stringFuseDesignMultiplier", "acBreakerDesignMultiplier", "dcIsolatorDesignMultiplier"], dataPath, errors);
        validateQuantity(data.stringFuseParallelThreshold, "count", `${dataPath}.stringFuseParallelThreshold`, errors, { min: 1, max: 10000, integer: true });
        validateQuantity(data.stringFuseDesignMultiplier, "ratio", `${dataPath}.stringFuseDesignMultiplier`, errors, { min: 0.000001, max: 100 });
        validateQuantity(data.acBreakerDesignMultiplier, "ratio", `${dataPath}.acBreakerDesignMultiplier`, errors, { min: 0.000001, max: 100 });
        validateQuantity(data.dcIsolatorDesignMultiplier, "ratio", `${dataPath}.dcIsolatorDesignMultiplier`, errors, { min: 0.000001, max: 100 });
        break;
      case "protective-earth-sizing": {
        validateKnownKeys(data, ["rows"], dataPath, errors);
        if (!requireArray(data.rows, `${dataPath}.rows`, errors)) break;
        let previous = -Infinity;
        data.rows.forEach((row, index) => {
          const rowPath = `${dataPath}.rows[${index}]`;
          if (!requireObject(row, rowPath, errors)) return;
          const mode = row.mode;
          const allowedKeys = mode === "fixed" ? ["phaseMax", "mode", "fixedSize"] : mode === "factor" ? ["phaseMax", "mode", "factor"] : ["phaseMax", "mode"];
          validateKnownKeys(row, allowedKeys, rowPath, errors);
          validateQuantity(row.phaseMax, "mm2", `${rowPath}.phaseMax`, errors, { min: 0.000001, max: 1000000 });
          if (!new Set(["same", "fixed", "factor"]).has(mode)) addError(errors, "MALFORMED_TABLE", `${rowPath}.mode`, `Unsupported PE sizing mode '${mode}'.`);
          if (mode === "fixed") validateQuantity(row.fixedSize, "mm2", `${rowPath}.fixedSize`, errors, { min: 0.000001, max: 1000000 });
          if (mode === "factor") validateQuantity(row.factor, "ratio", `${rowPath}.factor`, errors, { min: 0.000001, max: 1000 });
          const current = row?.phaseMax?.value;
          if (Number.isFinite(current) && current <= previous) addError(errors, "MALFORMED_TABLE", `${rowPath}.phaseMax.value`, "PE phase-size thresholds must be strictly increasing and unique.");
          if (Number.isFinite(current)) previous = current;
        });
        break;
      }
      case "spd-prompts":
        validateKnownKeys(data, ["dcPrompt", "acPrompt"], dataPath, errors);
        requireNonEmptyString(data.dcPrompt, `${dataPath}.dcPrompt`, errors);
        requireNonEmptyString(data.acPrompt, `${dataPath}.acPrompt`, errors);
        break;
      case "site-access-prompts":
        validateKnownKeys(data, ["minimumEdgeSetback", "minimumObstacleClearance", "note"], dataPath, errors);
        validateQuantity(data.minimumEdgeSetback, "m", `${dataPath}.minimumEdgeSetback`, errors, { min: 0, max: 1000 });
        validateQuantity(data.minimumObstacleClearance, "m", `${dataPath}.minimumObstacleClearance`, errors, { min: 0, max: 1000 });
        requireNonEmptyString(data.note, `${dataPath}.note`, errors);
        break;
      default:
        addError(errors, "MALFORMED_RULE_FAMILY", `${path}.id`, `No data validator exists for rule family '${family.id}'.`);
    }
  }

  function validateRuleFamilies(ruleFamilies, capabilities, provenance, errors) {
    const path = "$.ruleFamilies";
    if (!requireArray(ruleFamilies, path, errors)) return;
    const sourceIds = new Set((provenance?.sourceReferences || []).map(item => item?.id).filter(Boolean));
    const ids = new Set();
    const sortedFamilies = [...ruleFamilies].sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
    for (let index = 0; index < sortedFamilies.length; index += 1) {
      const family = sortedFamilies[index];
      const familyPath = `${path}[${index}]`;
      if (!requireObject(family, familyPath, errors)) continue;
      validateFamilyMetadata(family, familyPath, errors, sourceIds);
      if (ids.has(family.id)) addError(errors, "DUPLICATE_ID", `${familyPath}.id`, `Duplicate rule-family identifier '${family.id}'.`);
      ids.add(family.id);
      const capability = capabilities?.[family.capability];
      if (capability && new Set(["unsupported", "disabled", "not-implemented"]).has(capability.state)) {
        addError(errors, "INVALID_CAPABILITY_COMBINATION", `${familyPath}.capability`, `Rule family '${family.id}' cannot be present while capability '${family.capability}' is '${capability.state}'.`);
      }
      validateFamilyData(family, familyPath, errors);
    }

    for (const capabilityId of CAPABILITY_IDS) {
      const state = capabilities?.[capabilityId]?.state;
      if (state === "implemented-preliminary") {
        const hasFamily = ruleFamilies.some(family => family?.capability === capabilityId);
        if (!hasFamily) addError(errors, "INVALID_CAPABILITY_COMBINATION", `$.capabilities.${capabilityId}`, `Capability '${capabilityId}' is implemented-preliminary but has no rule family.`);
      }
    }
  }

  function validateOverlayContract(overlay, errors) {
    const path = "$.overlay";
    if (!requireObject(overlay, path, errors)) return;
    validateKnownKeys(overlay, ["allowedPaths", "forbiddenPaths", "unknownKeyBehavior", "safetyCriticalRestrictions"], path, errors);
    if (requireArray(overlay.allowedPaths, `${path}.allowedPaths`, errors, true)) {
      const seen = new Set();
      overlay.allowedPaths.forEach((item, index) => {
        if (typeof item !== "string" || !STRICT_V19_OVERLAY_ALLOWED_SET.has(item)) addError(errors, "INVALID_OVERLAY_PATH", `${path}.allowedPaths[${index}]`, `Overlay path '${item}' is not in the Alpha 1 compatibility allow-list.`);
        if (seen.has(item)) addError(errors, "DUPLICATE_ID", `${path}.allowedPaths[${index}]`, `Duplicate overlay path '${item}'.`);
        seen.add(item);
      });
    }
    if (requireArray(overlay.forbiddenPaths, `${path}.forbiddenPaths`, errors)) {
      const required = new Set(OVERLAY_FORBIDDEN_PATHS);
      overlay.forbiddenPaths.forEach((item, index) => {
        if (typeof item !== "string") addError(errors, "TYPE_STRING", `${path}.forbiddenPaths[${index}]`, "Forbidden overlay path must be a string.");
        required.delete(item);
      });
      for (const missing of [...required].sort()) addError(errors, "REQUIRED", `${path}.forbiddenPaths`, `Required immutable/forbidden path '${missing}' is missing from the overlay contract.`);
    }
    if (overlay.unknownKeyBehavior !== "reject") addError(errors, "INVALID_OVERLAY_POLICY", `${path}.unknownKeyBehavior`, "Unknown project overlay keys must be rejected.");
    if (requireArray(overlay.safetyCriticalRestrictions, `${path}.safetyCriticalRestrictions`, errors)) {
      const seen = new Set();
      overlay.safetyCriticalRestrictions.forEach((item, index) => {
        if (!SAFETY_RESTRICTION_SET.has(item)) addError(errors, "INVALID_OVERLAY_POLICY", `${path}.safetyCriticalRestrictions[${index}]`, `Unsupported safety restriction '${item}'.`);
        seen.add(item);
      });
      for (const required of SAFETY_RESTRICTIONS) if (!seen.has(required)) addError(errors, "REQUIRED", `${path}.safetyCriticalRestrictions`, `Safety restriction '${required}' is required.`);
    }
  }

  function validateRulePack(pack) {
    const errors = [];
    const warnings = [];
    if (!requireObject(pack, "$", errors)) return { valid: false, errors, warnings, schemaVersion: RULE_PACK_SCHEMA_VERSION };
    scanUnsafeKeys(pack, "$", errors);
    validateKnownKeys(pack, ["identity", "compatibility", "capabilities", "ruleFamilies", "overlay", "extensions"], "$", errors);
    validateIdentity(pack.identity, errors);
    validateCompatibility(pack.compatibility, errors);
    validateCapabilities(pack.capabilities, errors);
    validateRuleFamilies(pack.ruleFamilies, pack.capabilities, pack.identity?.provenance, errors);
    validateOverlayContract(pack.overlay, errors);

    if (pack.extensions != null) {
      const path = "$.extensions";
      if (requireObject(pack.extensions, path, errors)) {
        for (const key of sortedObjectKeys(pack.extensions)) {
          if (!EXTENSION_KEY_RE.test(key)) addError(errors, "INVALID_EXTENSION_KEY", `${path}.${key}`, "Metadata extension keys must be namespaced as 'vendor.example:key'.");
          validateMetadataExtensionValue(pack.extensions[key], `${path}.${key}`, errors);
        }
      }
    }

    if (pack.identity?.claims?.engineeringEvidence !== "validated") {
      warnings.push(errorRecord("ENGINEERING_NOT_VALIDATED", "$.identity.claims.engineeringEvidence", "Engineering evidence is not validated; the pack must not be presented as construction-ready compliance.", "warning"));
    }
    if (pack.identity?.claims?.independentReview !== "completed") {
      warnings.push(errorRecord("INDEPENDENT_REVIEW_NOT_COMPLETE", "$.identity.claims.independentReview", "Independent engineering review is not complete.", "warning"));
    }
    return { valid: errors.length === 0, errors, warnings, schemaVersion: RULE_PACK_SCHEMA_VERSION };
  }

  function normalizeRulePack(pack) {
    const validation = validateRulePack(pack);
    if (!validation.valid) {
      const error = new Error(`Rule pack failed schema ${RULE_PACK_SCHEMA_VERSION} validation.`);
      error.code = "RULE_PACK_INVALID";
      error.validation = validation;
      throw error;
    }
    const normalized = deepCloneJson(pack);
    normalized.identity.provenance.sourceReferences.sort((a, b) => a.id.localeCompare(b.id));
    normalized.compatibility.applicationVersions.sort();
    normalized.compatibility.ruleEngineVersions.sort();
    normalized.compatibility.projectSchemaVersions.sort();
    normalized.ruleFamilies.sort((a, b) => a.id.localeCompare(b.id));
    normalized.ruleFamilies.forEach(family => {
      family.evidence.sourceReferences.sort();
      family.evidence.testIds.sort();
    });
    normalized.overlay.allowedPaths.sort();
    normalized.overlay.forbiddenPaths.sort();
    normalized.overlay.safetyCriticalRestrictions.sort();
    return normalized;
  }

  function canonicalStringify(value) {
    if (value === null) return "null";
    if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Canonical JSON does not permit non-finite numbers.");
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
    if (isPlainObject(value)) {
      return `{${sortedObjectKeys(value).map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
    }
    throw new Error(`Canonical JSON cannot represent value of type '${typeof value}'.`);
  }

  // Synchronous SHA-256 for deterministic browser/Node fingerprints. Input is UTF-8.
  function sha256Hex(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const maxWord = Math.pow(2, 32);
    let result = "";
    const words = [];
    const asciiBitLength = unescape(encodeURIComponent(ascii)).length * 8;
    const utf8 = unescape(encodeURIComponent(ascii));
    let hash = sha256Hex.h = sha256Hex.h || [];
    let k = sha256Hex.k = sha256Hex.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate += 1) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    let padded = utf8 + "\x80";
    while ((padded.length % 64) !== 56) padded += "\x00";
    for (let i = 0; i < padded.length; i += 1) {
      const j = padded.charCodeAt(i);
      if (j >> 8) throw new Error("SHA-256 internal UTF-8 conversion failed.");
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = Math.floor(asciiBitLength / maxWord);
    words[words.length] = asciiBitLength;

    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash.slice(0);
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i += 1) {
        const i2 = i + j;
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i += 1) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i += 1) {
      for (let j = 3; j + 1; j -= 1) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  function canonicalizeRulePack(pack) {
    const normalized = normalizeRulePack(pack);
    return canonicalStringify(normalized);
  }

  function calculateRulePackFingerprint(pack) {
    return `${FINGERPRINT_PREFIX}${sha256Hex(canonicalizeRulePack(pack))}`;
  }

  function q(value, unit) { return { value: Number(value), unit }; }

  function makeFamily(id, sourceRefId, testId, data, overrides = {}) {
    return {
      id,
      capability: FAMILY_CAPABILITY[id],
      applicability: {
        scope: overrides.scope || "Preliminary concept-design compatibility behavior retained from Solar PV Design Platform v1.9.",
        conditions: overrides.conditions || []
      },
      assumptions: overrides.assumptions || ["No construction-ready standards-compliance claim is made by this compatibility family."],
      implementationStatus: "implemented",
      validationStatus: "not-validated",
      reviewStatus: "not-reviewed",
      evidence: { sourceReferences: [sourceRefId], testIds: [testId] },
      data
    };
  }

  function makeCapabilities() {
    const unsupportedScope = "Not implemented or validated in v2.0 Alpha 1; no result may be fabricated from this capability.";
    const map = {};
    for (const id of CAPABILITY_IDS) map[id] = { state: "unsupported", validationStatus: "not-validated", scope: unsupportedScope };
    map["design-current"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 preliminary design-current multipliers only." };
    map["current-density-sizing"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 current-density sizing heuristic only; not a standards ampacity table." };
    map["voltage-drop"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 deterministic preliminary voltage-drop limit checks." };
    map["conductor-sizing"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 conductor material/resistance/correction-factor and standard-size heuristic." };
    map["protective-conductor-sizing"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 simple PE sizing heuristic only; no adiabatic or earthing-system study." };
    map["protection-selection"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 standard-rating and multiplier prompts only; no breaking-capacity or coordination study." };
    map["spd-prompt"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 textual SPD prompt only; no SPD coordination capability." };
    map["access-fire-constraints"] = { state: "implemented-preliminary", validationStatus: "not-validated", scope: "v1.9 concept-design setback/access prompts only; no jurisdiction compliance claim." };
    return map;
  }

  function adaptV19RulePack(packId) {
    const info = v19.listRulePacks().find(item => item.id === packId);
    if (!info) throw new Error(`Unknown frozen v1.9 rule pack '${packId}'.`);
    const pack = v19.getRulePack(packId);
    const sourceRefId = `v19-pack:${pack.id}:${pack.version}`;
    const testId = `V19-GOLDEN:${pack.id}`;
    const e = pack.electrical;
    const engineeringVersion = SEMVER_RE.test(pack.version) ? pack.version : "1.7.0-compat";

    const contract = {
      identity: {
        packId: pack.id,
        engineeringVersion,
        rulePackSchemaVersion: RULE_PACK_SCHEMA_VERSION,
        name: pack.label,
        description: pack.description,
        lifecycleStatus: pack.id === v19.LEGACY_RULE_PACK_ID ? "legacy-compatibility" : "preliminary",
        claims: {
          softwareImplementation: "implemented",
          deterministicTests: "passing",
          engineeringEvidence: "not-validated",
          independentReview: "not-completed",
          regulatoryComplianceClaim: "not-permitted"
        },
        provenance: {
          sourceReferences: [{
            id: sourceRefId,
            type: "internal-compatibility-source",
            title: "Solar PV Design Platform v1.9 frozen built-in rule pack",
            locator: `${pack.id}@${pack.version}`
          }]
        }
      },
      compatibility: {
        applicationVersions: ["1.9.0", CONTRACT_MODULE_VERSION],
        ruleEngineVersions: [V19_ENGINE_VERSION],
        projectSchemaVersions: ["1.9", "2.0"],
        compatibilityMode: "v1.9-adapter",
        legacyPackIdentity: { id: pack.id, version: pack.version },
        deprecatedBy: null,
        migrationNotes: "Engineering values are adapted without changing the frozen v1.9 rule-context calculation or legacy rule fingerprint."
      },
      capabilities: makeCapabilities(),
      ruleFamilies: [
        makeFamily("design-current", sourceRefId, testId, { dcFactor: q(e.designCurrentFactorDc, "ratio"), acFactor: q(e.designCurrentFactorAc, "ratio") }),
        makeFamily("current-density-heuristic", sourceRefId, testId, { dcBase: q(e.baseCurrentDensityDcAmm2, "A_per_mm2"), acBase: q(e.baseCurrentDensityAcAmm2, "A_per_mm2") }),
        makeFamily("voltage-drop-limits", sourceRefId, testId, { dcMax: q(e.dcMaxVoltageDropPct, "percent"), acMax: q(e.acMaxVoltageDropPct, "percent") }),
        makeFamily("conductor-resistance", sourceRefId, testId, { temperatureFactor: q(e.conductorResistanceTempFactor, "ratio") }),
        makeFamily("conductor-materials", sourceRefId, testId, {
          materials: Object.fromEntries(Object.entries(e.conductorMaterials).map(([id, material]) => [id, {
            label: material.label,
            resistivity: q(material.resistivityOhmMm2M, "ohm_mm2_per_m"),
            ampacityFactor: q(material.ampacityFactor, "ratio")
          }]))
        }),
        makeFamily("insulation-correction", sourceRefId, testId, { factors: Object.fromEntries(Object.entries(e.insulationAmpacityFactors).map(([id, value]) => [id, q(value, "ratio")])) }),
        makeFamily("installation-correction", sourceRefId, testId, { factors: Object.fromEntries(Object.entries(e.installationMethodFactors).map(([id, value]) => [id, q(value, "ratio")])) }),
        makeFamily("ambient-correction", sourceRefId, testId, { rows: e.ambientCorrection.map(row => ({ maxTemperature: q(row.maxC, "degC"), factor: q(row.factor, "ratio") })) }),
        makeFamily("grouping-correction", sourceRefId, testId, { rows: e.groupingCorrection.map(row => ({ maxCircuits: q(row.maxCircuits, "count"), factor: q(row.factor, "ratio") })) }),
        makeFamily("cable-size-table", sourceRefId, testId, { sizes: e.cableSizesMm2.map(value => q(value, "mm2")) }),
        makeFamily("protection-rating-table", sourceRefId, testId, { ratings: e.protectionRatingsA.map(value => q(value, "A")) }),
        makeFamily("protection-prompts", sourceRefId, testId, {
          stringFuseParallelThreshold: q(e.stringFuseParallelThreshold, "count"),
          stringFuseDesignMultiplier: q(e.stringFuseDesignMultiplier, "ratio"),
          acBreakerDesignMultiplier: q(e.acBreakerDesignMultiplier, "ratio"),
          dcIsolatorDesignMultiplier: q(e.dcIsolatorDesignMultiplier, "ratio")
        }),
        makeFamily("protective-earth-sizing", sourceRefId, testId, {
          rows: e.peRules.map(row => {
            const adapted = { phaseMax: q(row.phaseMaxMm2, "mm2"), mode: row.mode };
            if (row.mode === "fixed") adapted.fixedSize = q(row.valueMm2, "mm2");
            if (row.mode === "factor") adapted.factor = q(row.factor, "ratio");
            return adapted;
          })
        }),
        makeFamily("spd-prompts", sourceRefId, testId, { dcPrompt: e.spdDc, acPrompt: e.spdAc }),
        makeFamily("site-access-prompts", sourceRefId, testId, {
          minimumEdgeSetback: q(pack.site.minimumEdgeSetbackM, "m"),
          minimumObstacleClearance: q(pack.site.minimumObstacleClearanceM, "m"),
          note: pack.site.accessFireNote
        })
      ],
      overlay: {
        allowedPaths: [...STRICT_V19_OVERLAY_ALLOWED_PATHS],
        forbiddenPaths: [...OVERLAY_FORBIDDEN_PATHS],
        unknownKeyBehavior: "reject",
        safetyCriticalRestrictions: [...SAFETY_RESTRICTIONS]
      },
      extensions: {
        "openai.spvdp:compatibility-note": "This contract artifact adapts frozen v1.9 preliminary behavior; it does not add or validate engineering standards content."
      }
    };

    const validation = validateRulePack(contract);
    if (!validation.valid) throw new Error(`Internal v1.9 compatibility adapter generated an invalid v2 contract: ${validation.errors.map(item => `${item.path}: ${item.message}`).join("; ")}`);
    return normalizeRulePack(contract);
  }

  const BUILTIN_CONTRACT_PACKS = new Map();
  for (const info of v19.listRulePacks()) {
    const pack = adaptV19RulePack(info.id);
    BUILTIN_CONTRACT_PACKS.set(`${pack.identity.packId}@${pack.identity.engineeringVersion}`, pack);
  }
  const IMPORTED_CONTRACT_PACKS = new Map();

  function findBuiltinContractPack(packId) {
    const matches = [...BUILTIN_CONTRACT_PACKS.values()].filter(pack => pack.identity.packId === packId);
    return matches[0] || null;
  }

  function getContractPack(packId, engineeringVersion = null) {
    if (engineeringVersion) {
      const key = `${packId}@${engineeringVersion}`;
      return deepCloneJson(IMPORTED_CONTRACT_PACKS.get(key) || BUILTIN_CONTRACT_PACKS.get(key) || null);
    }
    const imported = [...IMPORTED_CONTRACT_PACKS.values()].find(pack => pack.identity.packId === packId);
    return deepCloneJson(imported || findBuiltinContractPack(packId));
  }

  function listContractPacks() {
    return [...BUILTIN_CONTRACT_PACKS.values(), ...IMPORTED_CONTRACT_PACKS.values()]
      .map(pack => ({
        packId: pack.identity.packId,
        engineeringVersion: pack.identity.engineeringVersion,
        rulePackSchemaVersion: pack.identity.rulePackSchemaVersion,
        name: pack.identity.name,
        lifecycleStatus: pack.identity.lifecycleStatus,
        compatibilityMode: pack.compatibility.compatibilityMode,
        fingerprint: calculateRulePackFingerprint(pack),
        imported: IMPORTED_CONTRACT_PACKS.has(`${pack.identity.packId}@${pack.identity.engineeringVersion}`)
      }))
      .sort((a, b) => `${a.packId}@${a.engineeringVersion}`.localeCompare(`${b.packId}@${b.engineeringVersion}`));
  }

  function makeImportResult(ok, data = {}) {
    return { ok, errors: [], warnings: [], ...data };
  }

  function safeParseJson(text) {
    try {
      const parsed = JSON.parse(String(text));
      const unsafe = scanUnsafeKeys(parsed);
      if (unsafe.length) return makeImportResult(false, { errors: unsafe });
      return makeImportResult(true, { value: parsed });
    } catch (error) {
      return makeImportResult(false, { errors: [errorRecord("PARSE_ERROR", "$", `Invalid JSON: ${error.message}`)] });
    }
  }

  function exportRulePack(pack) {
    const normalized = normalizeRulePack(pack);
    const fingerprint = calculateRulePackFingerprint(normalized);
    const envelope = {
      format: "solar-pv-rule-pack",
      formatVersion: "1.0.0",
      fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
      fingerprint,
      pack: normalized
    };
    return canonicalStringify(envelope) + "\n";
  }

  function importRulePackJson(text, options = {}) {
    const parsed = safeParseJson(text);
    if (!parsed.ok) return parsed;
    let candidate = parsed.value;
    let expectedFingerprint = options.expectedFingerprint || null;
    if (isPlainObject(candidate) && candidate.format === "solar-pv-rule-pack") {
      validateKnownKeys(candidate, ["format", "formatVersion", "fingerprintAlgorithm", "fingerprint", "pack"], "$", parsed.errors);
      if (candidate.formatVersion !== "1.0.0") addError(parsed.errors, "INVALID_FORMAT_VERSION", "$.formatVersion", `Unsupported export format version '${candidate.formatVersion}'.`);
      if (candidate.fingerprintAlgorithm !== FINGERPRINT_ALGORITHM) addError(parsed.errors, "INVALID_FINGERPRINT_ALGORITHM", "$.fingerprintAlgorithm", `Unsupported fingerprint algorithm '${candidate.fingerprintAlgorithm}'.`);
      if (typeof candidate.fingerprint !== "string" || !candidate.fingerprint.startsWith(FINGERPRINT_PREFIX)) addError(parsed.errors, "INVALID_FINGERPRINT", "$.fingerprint", "Export fingerprint is missing or malformed.");
      expectedFingerprint = expectedFingerprint || candidate.fingerprint;
      candidate = candidate.pack;
    }
    if (parsed.errors.length) return makeImportResult(false, { errors: parsed.errors });
    const validation = validateRulePack(candidate);
    if (!validation.valid) return makeImportResult(false, { errors: validation.errors, warnings: validation.warnings });
    const normalized = normalizeRulePack(candidate);
    const canonicalJson = canonicalStringify(normalized);
    const fingerprint = `${FINGERPRINT_PREFIX}${sha256Hex(canonicalJson)}`;
    if (expectedFingerprint && fingerprint !== expectedFingerprint) {
      return makeImportResult(false, {
        errors: [errorRecord("FINGERPRINT_MISMATCH", "$.fingerprint", `Expected ${expectedFingerprint}, calculated ${fingerprint}.`)],
        warnings: validation.warnings
      });
    }
    return makeImportResult(true, { pack: normalized, canonicalJson, fingerprint, warnings: validation.warnings });
  }

  function registerImportedRulePack(textOrPack) {
    let imported;
    if (typeof textOrPack === "string") imported = importRulePackJson(textOrPack);
    else {
      const validation = validateRulePack(textOrPack);
      if (!validation.valid) return makeImportResult(false, { errors: validation.errors, warnings: validation.warnings });
      const pack = normalizeRulePack(textOrPack);
      imported = makeImportResult(true, { pack, canonicalJson: canonicalStringify(pack), fingerprint: calculateRulePackFingerprint(pack), warnings: validation.warnings });
    }
    if (!imported.ok) return imported;
    const key = `${imported.pack.identity.packId}@${imported.pack.identity.engineeringVersion}`;
    if (BUILTIN_CONTRACT_PACKS.has(key) || IMPORTED_CONTRACT_PACKS.has(key)) {
      return makeImportResult(false, {
        errors: [errorRecord("DUPLICATE_PACK_IDENTITY", "$.identity", `Pack identity '${key}' is already registered and is immutable.`)]
      });
    }
    IMPORTED_CONTRACT_PACKS.set(key, imported.pack);
    return { ...imported, registered: true };
  }

  function flattenOverlayLeafPaths(value, path = "", output = []) {
    if (!isPlainObject(value)) {
      if (path) output.push({ path, value });
      return output;
    }
    const keys = sortedObjectKeys(value);
    if (!keys.length && path) output.push({ path, value });
    for (const key of keys) {
      const next = path ? `${path}.${key}` : key;
      if (STRICT_V19_OVERLAY_ALLOWED_SET.has(next) || LEGACY_FROZEN_METADATA_SET.has(next)) output.push({ path: next, value: value[key] });
      else flattenOverlayLeafPaths(value[key], next, output);
    }
    return output;
  }

  function isForbiddenOverlayPath(path) {
    return OVERLAY_FORBIDDEN_PATHS.some(forbidden => path === forbidden || path.startsWith(`${forbidden}.`));
  }

  function validateOverlayNumber(value, path, errors, options = {}) {
    if (!Number.isFinite(value)) {
      addError(errors, "INVALID_NUMBER", `$.customOverlay.${path}`, "Overlay engineering quantities must be finite JSON numbers; string coercion is not permitted.");
      return;
    }
    if (options.integer && !Number.isInteger(value)) addError(errors, "INVALID_NUMBER", `$.customOverlay.${path}`, "Overlay engineering quantity must be an integer.");
    if (options.min != null && value < options.min) addError(errors, "INVALID_NUMBER", `$.customOverlay.${path}`, `Overlay engineering quantity must be >= ${options.min}.`);
    if (options.max != null && value > options.max) addError(errors, "INVALID_NUMBER", `$.customOverlay.${path}`, `Overlay engineering quantity must be <= ${options.max}.`);
  }

  function validateOverlayString(value, path, errors, allowEmpty = false) {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) addError(errors, "TYPE_STRING", `$.customOverlay.${path}`, allowEmpty ? "Overlay value must be a string." : "Overlay value must be a non-empty string.");
  }

  function validateStrictIncreasingNumericArray(value, path, errors, options = {}) {
    if (!Array.isArray(value) || !value.length) {
      addError(errors, "MALFORMED_TABLE", `$.customOverlay.${path}`, "Overlay table must be a non-empty array.");
      return;
    }
    let previous = -Infinity;
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      validateOverlayNumber(item, itemPath, errors, options);
      if (Number.isFinite(item) && item <= previous) addError(errors, "MALFORMED_TABLE", `$.customOverlay.${itemPath}`, "Overlay table values must be strictly increasing and unique.");
      if (Number.isFinite(item)) previous = item;
    });
  }

  function validateCorrectionRows(value, path, errors, thresholdKey, thresholdOptions) {
    if (!Array.isArray(value) || !value.length) {
      addError(errors, "MALFORMED_TABLE", `$.customOverlay.${path}`, "Overlay correction table must be a non-empty array.");
      return;
    }
    let previous = -Infinity;
    value.forEach((row, index) => {
      const rowPath = `${path}[${index}]`;
      if (!isPlainObject(row)) {
        addError(errors, "TYPE_OBJECT", `$.customOverlay.${rowPath}`, "Overlay correction row must be an object.");
        return;
      }
      validateKnownKeys(row, [thresholdKey, "factor"], `$.customOverlay.${rowPath}`, errors);
      validateOverlayNumber(row[thresholdKey], `${rowPath}.${thresholdKey}`, errors, thresholdOptions);
      validateOverlayNumber(row.factor, `${rowPath}.factor`, errors, { min: 0.000001, max: 10 });
      const current = row[thresholdKey];
      if (Number.isFinite(current) && current <= previous) addError(errors, "MALFORMED_TABLE", `$.customOverlay.${rowPath}.${thresholdKey}`, "Overlay correction thresholds must be strictly increasing and unique.");
      if (Number.isFinite(current)) previous = current;
    });
  }

  function validatePeRows(value, path, errors) {
    if (!Array.isArray(value) || !value.length) {
      addError(errors, "MALFORMED_TABLE", `$.customOverlay.${path}`, "Protective-earth overlay rules must be a non-empty array.");
      return;
    }
    let previous = -Infinity;
    value.forEach((row, index) => {
      const rowPath = `${path}[${index}]`;
      if (!isPlainObject(row)) {
        addError(errors, "TYPE_OBJECT", `$.customOverlay.${rowPath}`, "Protective-earth overlay row must be an object.");
        return;
      }
      validateKnownKeys(row, ["phaseMaxMm2", "mode", "valueMm2", "factor"], `$.customOverlay.${rowPath}`, errors);
      validateOverlayNumber(row.phaseMaxMm2, `${rowPath}.phaseMaxMm2`, errors, { min: 0.000001, max: 1000000 });
      if (Number.isFinite(row.phaseMaxMm2) && row.phaseMaxMm2 <= previous) addError(errors, "MALFORMED_TABLE", `$.customOverlay.${rowPath}.phaseMaxMm2`, "Protective-earth phase thresholds must be strictly increasing and unique.");
      if (Number.isFinite(row.phaseMaxMm2)) previous = row.phaseMaxMm2;
      if (!new Set(["same", "fixed", "factor"]).has(row.mode)) addError(errors, "INVALID_ENUM", `$.customOverlay.${rowPath}.mode`, "PE rule mode must be same, fixed, or factor.");
      if (row.mode === "fixed") validateOverlayNumber(row.valueMm2, `${rowPath}.valueMm2`, errors, { min: 0.000001, max: 1000000 });
      if (row.mode === "factor") validateOverlayNumber(row.factor, `${rowPath}.factor`, errors, { min: 0.000001, max: 100 });
      if (row.mode === "same" && (Object.prototype.hasOwnProperty.call(row, "valueMm2") || Object.prototype.hasOwnProperty.call(row, "factor"))) addError(errors, "MALFORMED_RULE_FAMILY", `$.customOverlay.${rowPath}`, "PE mode 'same' must not carry fixed-size or factor fields.");
      if (row.mode === "fixed" && Object.prototype.hasOwnProperty.call(row, "factor")) addError(errors, "MALFORMED_RULE_FAMILY", `$.customOverlay.${rowPath}.factor`, "PE mode 'fixed' must not carry a factor field.");
      if (row.mode === "factor" && Object.prototype.hasOwnProperty.call(row, "valueMm2")) addError(errors, "MALFORMED_RULE_FAMILY", `$.customOverlay.${rowPath}.valueMm2`, "PE mode 'factor' must not carry a fixed-size field.");
    });
  }

  function validateV19OverlayLeaf(path, value, errors) {
    const scalarRanges = {
      "electrical.designCurrentFactorDc": { min: 1, max: 3 },
      "electrical.designCurrentFactorAc": { min: 1, max: 3 },
      "electrical.baseCurrentDensityDcAmm2": { min: 0.25, max: 20 },
      "electrical.baseCurrentDensityAcAmm2": { min: 0.25, max: 20 },
      "electrical.dcMaxVoltageDropPct": { min: 0.1, max: 20 },
      "electrical.acMaxVoltageDropPct": { min: 0.1, max: 20 },
      "electrical.conductorResistanceTempFactor": { min: 1, max: 3 },
      "electrical.conductorMaterials.copper.resistivityOhmMm2M": { min: 0.0000001, max: 10 },
      "electrical.conductorMaterials.copper.ampacityFactor": { min: 0.000001, max: 10 },
      "electrical.conductorMaterials.aluminum.resistivityOhmMm2M": { min: 0.0000001, max: 10 },
      "electrical.conductorMaterials.aluminum.ampacityFactor": { min: 0.000001, max: 10 },
      "electrical.insulationAmpacityFactors.pvc70": { min: 0.000001, max: 10 },
      "electrical.insulationAmpacityFactors.xlpe90": { min: 0.000001, max: 10 },
      "electrical.installationMethodFactors.open_air": { min: 0.000001, max: 10 },
      "electrical.installationMethodFactors.tray": { min: 0.000001, max: 10 },
      "electrical.installationMethodFactors.conduit": { min: 0.000001, max: 10 },
      "electrical.installationMethodFactors.buried": { min: 0.000001, max: 10 },
      "electrical.stringFuseParallelThreshold": { min: 1, max: 100000, integer: true },
      "electrical.stringFuseDesignMultiplier": { min: 0.000001, max: 10 },
      "electrical.acBreakerDesignMultiplier": { min: 0.000001, max: 10 },
      "electrical.dcIsolatorDesignMultiplier": { min: 0.000001, max: 10 },
      "site.minimumEdgeSetbackM": { min: 0, max: 1000 },
      "site.minimumObstacleClearanceM": { min: 0, max: 1000 }
    };
    if (scalarRanges[path]) {
      validateOverlayNumber(value, path, errors, scalarRanges[path]);
      return;
    }
    if (path === "electrical.ambientCorrection") {
      validateCorrectionRows(value, path, errors, "maxC", { min: -100, max: 200 });
      return;
    }
    if (path === "electrical.groupingCorrection") {
      validateCorrectionRows(value, path, errors, "maxCircuits", { min: 1, max: 100000, integer: true });
      return;
    }
    if (path === "electrical.cableSizesMm2") {
      validateStrictIncreasingNumericArray(value, path, errors, { min: 0.000001, max: 1000000 });
      return;
    }
    if (path === "electrical.protectionRatingsA") {
      validateStrictIncreasingNumericArray(value, path, errors, { min: 0.000001, max: 1000000 });
      return;
    }
    if (path === "electrical.peRules") {
      validatePeRows(value, path, errors);
      return;
    }
    if (new Set(["electrical.spdDc", "electrical.spdAc", "site.accessFireNote"]).has(path)) {
      validateOverlayString(value, path, errors);
      return;
    }
    if (LEGACY_FROZEN_METADATA_SET.has(path)) {
      validateOverlayString(value, path, errors);
    }
  }

  function validateProjectOverlay(overlay, options = {}) {
    const errors = [];
    const warnings = [];
    const mode = options.mode === "legacy-v1.9-frozen" ? "legacy-v1.9-frozen" : "strict-v2";
    if (!isPlainObject(overlay)) {
      addError(errors, "TYPE_OBJECT", "$.customOverlay", "Project rule overlay must be a JSON object.");
      return { valid: false, mode, errors, warnings, paths: [] };
    }
    scanUnsafeKeys(overlay, "$.customOverlay", errors);
    const leaves = flattenOverlayLeafPaths(overlay);
    for (const leaf of leaves.sort((a, b) => a.path.localeCompare(b.path))) {
      if (isForbiddenOverlayPath(leaf.path)) {
        addError(errors, "IMMUTABLE_FIELD", `$.customOverlay.${leaf.path}`, `Project overlays cannot replace immutable field '${leaf.path}'.`);
        continue;
      }
      if (STRICT_V19_OVERLAY_ALLOWED_SET.has(leaf.path)) {
        validateV19OverlayLeaf(leaf.path, leaf.value, errors);
        continue;
      }
      if (mode === "legacy-v1.9-frozen" && LEGACY_FROZEN_METADATA_SET.has(leaf.path)) {
        validateV19OverlayLeaf(leaf.path, leaf.value, errors);
        continue;
      }
      addError(errors, "INVALID_OVERLAY_PATH", `$.customOverlay.${leaf.path}`, `Overlay path '${leaf.path}' is not permitted by the ${mode} overlay policy.`);
    }

    // Empty objects can hide unknown branches from leaf scanning; walk every object key prefix.
    function walk(node, prefix = "") {
      if (!isPlainObject(node)) return;
      for (const key of sortedObjectKeys(node)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (isForbiddenOverlayPath(next)) {
          addError(errors, "IMMUTABLE_FIELD", `$.customOverlay.${next}`, `Project overlays cannot replace immutable field '${next}'.`);
          continue;
        }
        const isAllowedExact = STRICT_V19_OVERLAY_ALLOWED_SET.has(next) || (mode === "legacy-v1.9-frozen" && LEGACY_FROZEN_METADATA_SET.has(next));
        const isAllowedPrefix = STRICT_V19_OVERLAY_ALLOWED_PATHS.some(item => item.startsWith(`${next}.`)) || (mode === "legacy-v1.9-frozen" && LEGACY_FROZEN_METADATA_PATHS.some(item => item.startsWith(`${next}.`)));
        if (!isAllowedExact && !isAllowedPrefix) {
          addError(errors, "INVALID_OVERLAY_PATH", `$.customOverlay.${next}`, `Unknown engineering overlay key/path '${next}' is rejected.`);
          continue;
        }
        if (!isAllowedExact) walk(node[key], next);
      }
    }
    walk(overlay);

    const dedup = new Map();
    errors.forEach(item => dedup.set(`${item.code}|${item.path}|${item.message}`, item));
    const finalErrors = [...dedup.values()].sort((a, b) => `${a.path}|${a.code}`.localeCompare(`${b.path}|${b.code}`));

    if (mode === "legacy-v1.9-frozen") {
      const actual = v19.calculateRulePackFingerprint(overlay);
      if (!options.expectedLegacyOverlayFingerprint) {
        addError(finalErrors, "REQUIRED", "$.legacyOverlayFingerprint", "Frozen v1.9 overlay mode requires the migration-time overlay fingerprint.");
      } else if (actual !== options.expectedLegacyOverlayFingerprint) {
        addError(finalErrors, "FROZEN_OVERLAY_CHANGED", "$.customOverlay", `Frozen v1.9 overlay changed after migration; expected ${options.expectedLegacyOverlayFingerprint}, calculated ${actual}.`);
      } else {
        warnings.push(errorRecord("LEGACY_FROZEN_OVERLAY", "$.customOverlay", "A historical v1.9 metadata overlay is frozen for compatibility. Clear/recreate it under the strict v2 allow-list before editing.", "warning"));
      }
    }
    return { valid: finalErrors.length === 0, mode, errors: finalErrors, warnings, paths: leaves.map(item => item.path).sort() };
  }

  function strictPackIdExists(packId) {
    return v19.listRulePacks().some(item => item.id === packId);
  }

  function buildV19CompatibilityContext(rawConfig = {}) {
    const packId = String(rawConfig?.packId || v19.DEFAULT_RULE_PACK_ID);
    if (!strictPackIdExists(packId)) {
      return {
        valid: false,
        errors: [`Unknown rule-pack ID '${packId}'. v2.0 rejects unknown pack identities instead of silently falling back.`],
        warnings: [],
        validationErrors: [errorRecord("UNKNOWN_PACK_ID", "$.packId", `Unknown rule-pack ID '${packId}'.`)],
        engineVersion: V19_ENGINE_VERSION,
        packId,
        packVersion: "-",
        packLabel: "Unknown rule pack",
        fingerprint: "-",
        trace: [],
        contract: null
      };
    }
    const mode = rawConfig?.overlayPolicy === "legacy-v1.9-frozen" ? "legacy-v1.9-frozen" : "strict-v2";
    const overlayValidation = validateProjectOverlay(rawConfig?.customOverlay || {}, {
      mode,
      expectedLegacyOverlayFingerprint: rawConfig?.legacyOverlayFingerprint || null
    });
    if (!overlayValidation.valid) {
      return {
        valid: false,
        errors: overlayValidation.errors.map(item => item.message),
        warnings: overlayValidation.warnings.map(item => item.message),
        validationErrors: overlayValidation.errors,
        engineVersion: V19_ENGINE_VERSION,
        packId,
        packVersion: v19.getRulePack(packId).version,
        packLabel: v19.getRulePack(packId).label,
        fingerprint: "-",
        trace: [],
        overlayPolicy: mode,
        contract: null
      };
    }
    const context = v19.buildRuleContext(rawConfig);
    const contractPack = findBuiltinContractPack(context.packId);
    const contractValidation = validateRulePack(contractPack);
    const contractFingerprint = calculateRulePackFingerprint(contractPack);
    const warnings = [...context.warnings, ...overlayValidation.warnings.map(item => item.message)];
    return {
      ...context,
      warnings,
      validationErrors: [],
      overlayPolicy: mode,
      contract: {
        moduleVersion: CONTRACT_MODULE_VERSION,
        rulePackSchemaVersion: RULE_PACK_SCHEMA_VERSION,
        engineeringVersion: contractPack.identity.engineeringVersion,
        contractFingerprint,
        fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
        compatibilityMode: contractPack.compatibility.compatibilityMode,
        lifecycleStatus: contractPack.identity.lifecycleStatus,
        claims: deepCloneJson(contractPack.identity.claims),
        capabilities: deepCloneJson(contractPack.capabilities),
        evidenceReferences: deepCloneJson(contractPack.identity.provenance.sourceReferences),
        validation: contractValidation
      }
    };
  }

  function migrateV19EngineeringRuleConfiguration(configuration, legacyInputs = {}) {
    if (!isPlainObject(configuration)) {
      return makeImportResult(false, { errors: [errorRecord("TYPE_OBJECT", "$.engineeringRules", "v1.9 engineering-rule configuration must be an object.")] });
    }
    const raw = deepCloneJson(configuration);
    const customOverlay = isPlainObject(raw.customOverlay) ? raw.customOverlay : {};
    const unsafe = scanUnsafeKeys(customOverlay, "$.engineeringRules.customOverlay");
    if (unsafe.length) return makeImportResult(false, { errors: unsafe });
    const leaves = flattenOverlayLeafPaths(customOverlay);
    const forbidden = leaves.filter(item => isForbiddenOverlayPath(item.path));
    if (forbidden.length) {
      return makeImportResult(false, {
        errors: forbidden.map(item => errorRecord("IMMUTABLE_FIELD", `$.engineeringRules.customOverlay.${item.path}`, `Historical overlay attempts to replace immutable field '${item.path}' and cannot be migrated safely.`))
      });
    }
    const hasLegacyMetadata = leaves.some(item => LEGACY_FROZEN_METADATA_SET.has(item.path));
    const mode = hasLegacyMetadata ? "legacy-v1.9-frozen" : "strict-v2";
    const migrated = {
      ...raw,
      overlayPolicy: mode,
      migratedFromLegacy: !!raw.migratedFromLegacy
    };
    if (mode === "legacy-v1.9-frozen") migrated.legacyOverlayFingerprint = v19.calculateRulePackFingerprint(customOverlay);
    else delete migrated.legacyOverlayFingerprint;

    const originalContext = v19.buildRuleContext({ ...raw, legacyInputs });
    if (!originalContext.valid) return makeImportResult(false, { errors: originalContext.errors.map(message => errorRecord("V19_CONFIGURATION_INVALID", "$.engineeringRules", message)) });
    const migratedContext = buildV19CompatibilityContext({ ...migrated, legacyInputs });
    if (!migratedContext.valid) return makeImportResult(false, { errors: migratedContext.validationErrors || migratedContext.errors.map(message => errorRecord("MIGRATION_INVALID", "$.engineeringRules", message)) });
    if (migratedContext.fingerprint !== originalContext.fingerprint) {
      return makeImportResult(false, { errors: [errorRecord("RULE_BASIS_DRIFT", "$.engineeringRules.provenance.fingerprint", `Migration changed the v1.9 rule fingerprint from ${originalContext.fingerprint} to ${migratedContext.fingerprint}.`)] });
    }
    return makeImportResult(true, {
      configuration: migrated,
      provenance: {
        migrationType: "v1.9-to-v2.0-rule-contract",
        sourceRuleEngineVersion: originalContext.engineVersion,
        sourcePackId: originalContext.packId,
        sourcePackVersion: originalContext.packVersion,
        sourceRuleFingerprint: originalContext.fingerprint,
        overlayPolicy: mode,
        rulePackSchemaVersion: RULE_PACK_SCHEMA_VERSION,
        contractFingerprint: migratedContext.contract.contractFingerprint,
        compatibilityMode: migratedContext.contract.compatibilityMode
      },
      context: migratedContext
    });
  }

  function getCapabilityState(packOrContext, capabilityId) {
    if (!CAPABILITY_SET.has(capabilityId)) return { state: "unsupported", validationStatus: "not-validated", reason: `Unknown capability '${capabilityId}'.` };
    const capabilities = packOrContext?.contract?.capabilities || packOrContext?.capabilities;
    const result = capabilities?.[capabilityId];
    if (!result) return { state: "unsupported", validationStatus: "not-validated", reason: "Capability is not declared." };
    return deepCloneJson(result);
  }

  function evaluateCompatibility(packOrContext, targets = {}) {
    const compatibility = packOrContext?.contract?.compatibility
      || packOrContext?.compatibility
      || (() => {
        const packId = packOrContext?.packId;
        const engineeringVersion = packOrContext?.contract?.engineeringVersion;
        const pack = packId ? getContractPack(packId, engineeringVersion || null) : null;
        return pack?.compatibility || null;
      })();
    const requested = {
      applicationVersion: String(targets.applicationVersion || CONTRACT_MODULE_VERSION),
      ruleEngineVersion: String(targets.ruleEngineVersion || V19_ENGINE_VERSION),
      projectSchemaVersion: String(targets.projectSchemaVersion || "2.0")
    };
    if (!compatibility) {
      return {
        state: "incompatible",
        compatible: false,
        requested,
        reasons: ["No compatibility declaration is available for this pack/context."]
      };
    }
    const checks = [
      ["applicationVersion", "applicationVersions", "application"],
      ["ruleEngineVersion", "ruleEngineVersions", "rule engine"],
      ["projectSchemaVersion", "projectSchemaVersions", "project schema"]
    ];
    const reasons = [];
    for (const [targetKey, listKey, label] of checks) {
      const supported = Array.isArray(compatibility[listKey]) ? compatibility[listKey] : [];
      if (!supported.includes(requested[targetKey])) {
        reasons.push(`Requested ${label} '${requested[targetKey]}' is not declared; supported: ${supported.join(", ") || "none"}.`);
      }
    }
    return {
      state: reasons.length ? "incompatible" : "compatible",
      compatible: reasons.length === 0,
      compatibilityMode: compatibility.compatibilityMode || null,
      requested,
      reasons
    };
  }

  global.SolarPVRulePackContract = Object.freeze({
    version: CONTRACT_MODULE_VERSION,
    deterministic: true,
    RULE_PACK_SCHEMA_VERSION,
    CANONICALIZATION_VERSION,
    FINGERPRINT_ALGORITHM,
    FINGERPRINT_PREFIX,
    UNIT_IDS,
    CAPABILITY_IDS,
    FAMILY_IDS,
    BLOCKED_KEYS,
    STRICT_V19_OVERLAY_ALLOWED_PATHS,
    OVERLAY_FORBIDDEN_PATHS,
    validateRulePack,
    normalizeRulePack,
    canonicalizeRulePack,
    calculateRulePackFingerprint,
    safeParseJson,
    exportRulePack,
    importRulePackJson,
    registerImportedRulePack,
    listContractPacks,
    getContractPack,
    adaptV19RulePack,
    validateProjectOverlay,
    buildV19CompatibilityContext,
    migrateV19EngineeringRuleConfiguration,
    getCapabilityState,
    evaluateCompatibility,
    isValidSemanticVersion: value => typeof value === "string" && SEMVER_RE.test(value)
  });
})(globalThis);
