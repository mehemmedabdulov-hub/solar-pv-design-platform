(function (global) {
  "use strict";

  const STATE_VERSION = "2.3-beta";
  const PROJECT_SCHEMA_VERSION = "2.0";
  const EVENT_NAME = "solar:projectstatechange";

  const FORM_GROUPS = Object.freeze({
    identity: ["projectName", "customerName"],
    equipment: ["panel", "inverter"],
    layout: [
      "moduleWidth", "moduleHeight", "panelOrientation", "layoutAzimuth", "moduleGap", "edgeSetback", "obstacleClearance",
      "layoutSearchMode", "orientationSearchMode", "rotationSearchRange", "rotationSearchStep", "gridAnchorSamples", "edgeAlignmentCount",
      "groundRowPitch", "groundGroundClearance", "groundDesignSolarElevation", "groundSiteSlope", "groundMaxSlope", "groundServiceRoadWidth", "groundSpacingRule",
      "carportCanopyHeight", "carportMinVehicleClearance", "carportColumnClearance", "carportDriveAisleWidth", "carportBayWidth", "carportBayDepth"
    ],
    electrical: [
      "minimumDesignTemp", "maximumCellTemp", "vmpTempCoeff", "inverterQuantityMode", "manualInverterQuantity",
      "dcStringOneWayLengthM", "dcHomerunOneWayLengthM", "acFeederOneWayLengthM", "acSystemVoltageV", "acPowerFactor",
      "designCurrentFactor", "conductorTempFactor", "dcMaxVoltageDropPct", "acMaxVoltageDropPct", "dcCurrentDensityAmm2", "acCurrentDensityAmm2"
    ],
    energy: [
      "irradiation", "energyArrayTilt", "energySurfaceAzimuth", "energyAlbedo", "energyNoct", "energyInverterEfficiency",
      "energySoilingLoss", "energyShadingLoss", "energyMismatchLoss", "energyDcWiringLoss", "energyAcWiringLoss", "energyAvailabilityLoss"
    ],
    finance: [
      "financeCurrency", "financeModuleUnitCost", "financeInverterUnitCost", "financeBosCostPerKwp", "financeEngineeringFixedCost",
      "financeContingencyPct", "financeAnnualOpexPct", "financeAnalysisYears", "financeSelfConsumptionPct", "financeRetailTariff",
      "financeExportTariff", "financeTariffEscalationPct", "financeDiscountRatePct", "financeDegradationPct", "financeOpexEscalationPct"
    ],
    shading: [
      "shadingMode", "shadingArrayReferenceHeightM", "shadingSampleMode", "shadingMaxSamplesPerSubarray", "shadingGridCellM",
      "shadingGroundReferenceM", "shadingMinObstacleHeightM", "shadingImportUnits"
    ]
  });

  const FIELD_DOMAIN = Object.freeze(Object.entries(FORM_GROUPS).reduce((out, [domain, ids]) => {
    ids.forEach(id => { out[id] = domain; });
    return out;
  }, { latitude: "location", longitude: "location" }));

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((out, key) => {
        if (value[key] !== undefined) out[key] = canonicalize(value[key]);
        return out;
      }, {});
    }
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function fnv1a32Hex(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function fingerprint(value) {
    return `state-${fnv1a32Hex(stableStringify(value))}`;
  }

  function getPath(object, path) {
    const parts = Array.isArray(path) ? path : String(path || "").split(".").filter(Boolean);
    return parts.reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function setPathImmutable(object, path, value) {
    const parts = Array.isArray(path) ? path : String(path || "").split(".").filter(Boolean);
    if (!parts.length) return clone(value);
    const root = Array.isArray(object) ? object.slice() : { ...(object || {}) };
    let cursor = root;
    let source = object || {};
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      const sourceChild = source?.[key];
      const next = Array.isArray(sourceChild) ? sourceChild.slice() : { ...(sourceChild || {}) };
      cursor[key] = next;
      cursor = next;
      source = sourceChild || {};
    }
    cursor[parts[parts.length - 1]] = clone(value);
    return root;
  }

  function pickForm(form, ids) {
    const out = {};
    ids.forEach(id => {
      if (Object.prototype.hasOwnProperty.call(form || {}, id)) out[id] = form[id];
    });
    return out;
  }

  function normalizedNumber(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function createDefaultState() {
    return {
      stateVersion: STATE_VERSION,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      identity: { projectId: null, projectName: "", customerName: "" },
      installation: { type: "Rooftop Solar" },
      location: { latitude: null, longitude: null, confirmed: false, lifecycleState: "Unconfirmed", provenance: "legacy" },
      site: { surfaces: [], exclusions: [] },
      equipment: {
        moduleId: null,
        inverterId: null,
        moduleSnapshot: null,
        inverterSnapshot: null,
        moduleDimensions: {
          source: "equipment",
          widthM: null,
          heightM: null,
          override: { enabled: false, widthM: null, heightM: null, provenance: "advanced-custom" }
        }
      },
      layout: { settings: {}, isCurrent: false, manualEdited: false, faceContexts: [], panels: [] },
      electrical: {
        assumptions: {},
        wiringLosses: {
          source: "derived-electrical",
          inherited: { dcPct: null, acPct: null, sourceFingerprint: null },
          override: { enabled: false, dcPct: null, acPct: null, provenance: "advanced-custom" }
        }
      },
      resource: { irradiationValueSource: "manual", solarWeatherResource: null },
      energy: { assumptions: {}, inverterEfficiencyManual: false },
      shading: { config: {}, coordinateOrigin: null, importHistory: [], obstructions: [] },
      finance: { assumptions: {} },
      engineeringRules: null,
      meta: { applicationVersion: null, calculationManifest: null }
    };
  }

  function fromLegacySnapshot(snapshot) {
    const source = snapshot && typeof snapshot === "object" ? snapshot : {};
    const form = source.form || {};
    const applied = source.locationLifecycle?.appliedCoordinates || null;
    const latitude = normalizedNumber(applied?.lat ?? form.latitude);
    const longitude = normalizedNumber(applied?.lng ?? form.longitude);
    const dimensionsOverride = source.betaOverrides?.moduleDimensions || {};
    const wiringOverride = source.betaOverrides?.wiringLosses || {};
    const state = createDefaultState();
    state.schemaVersion = String(source.schemaVersion || PROJECT_SCHEMA_VERSION);
    state.identity = {
      projectId: source.projectId || null,
      projectName: String(form.projectName || ""),
      customerName: String(form.customerName || "")
    };
    state.installation = { type: source.installation || "Rooftop Solar" };
    state.location = {
      latitude,
      longitude,
      confirmed: source.locationLifecycle?.confirmed === true,
      lifecycleState: source.locationLifecycle?.state || (source.locationLifecycle?.confirmed ? "Confirmed" : "Unconfirmed"),
      provenance: source.locationLifecycle?.provenance || (applied ? "confirmed-location" : "legacy-form")
    };
    state.site = {
      surfaces: clone(source.roofFaces || []),
      exclusions: clone(source.exclusions || [])
    };
    state.equipment = {
      moduleId: form.panel ?? null,
      inverterId: form.inverter ?? null,
      moduleSnapshot: clone(source.equipmentSnapshots?.module || null),
      inverterSnapshot: clone(source.equipmentSnapshots?.inverter || null),
      moduleDimensions: {
        source: dimensionsOverride.enabled ? "advanced-override" : "equipment",
        widthM: normalizedNumber(form.moduleWidth),
        heightM: normalizedNumber(form.moduleHeight),
        override: {
          enabled: dimensionsOverride.enabled === true,
          widthM: normalizedNumber(dimensionsOverride.widthM),
          heightM: normalizedNumber(dimensionsOverride.heightM),
          provenance: dimensionsOverride.provenance || "advanced-custom"
        }
      }
    };
    state.layout = {
      settings: { ...pickForm(form, FORM_GROUPS.layout), ...(clone(source.layout?.settings || {})) },
      isCurrent: source.layout?.isCurrent === true,
      manualEdited: source.layout?.manualLayoutEdited === true,
      faceContexts: clone(source.layout?.faceContexts || []),
      panels: clone(source.layout?.panels || [])
    };
    state.electrical = {
      assumptions: pickForm(form, FORM_GROUPS.electrical),
      wiringLosses: {
        source: wiringOverride.enabled ? "advanced-override" : "derived-electrical",
        inherited: {
          dcPct: normalizedNumber(source.betaDerived?.wiringLosses?.dcPct),
          acPct: normalizedNumber(source.betaDerived?.wiringLosses?.acPct),
          sourceFingerprint: source.betaDerived?.wiringLosses?.sourceFingerprint || null
        },
        override: {
          enabled: wiringOverride.enabled === true,
          dcPct: normalizedNumber(wiringOverride.dcPct),
          acPct: normalizedNumber(wiringOverride.acPct),
          provenance: wiringOverride.provenance || "advanced-custom"
        }
      }
    };
    state.resource = {
      irradiationValueSource: source.irradiationValueSource || "manual",
      solarWeatherResource: clone(source.solarWeatherResource || null)
    };
    state.energy = {
      assumptions: pickForm(form, FORM_GROUPS.energy),
      inverterEfficiencyManual: source.energyInverterEfficiencyManual === true
    };
    state.shading = {
      config: pickForm(form, FORM_GROUPS.shading),
      coordinateOrigin: clone(source.shadingCoordinateOrigin || null),
      importHistory: clone(source.shadingImportHistory || []),
      obstructions: clone(source.shadingObstructions || [])
    };
    state.finance = { assumptions: pickForm(form, FORM_GROUPS.finance) };
    state.engineeringRules = clone(source.engineeringRules || null);
    state.meta = {
      applicationVersion: source.applicationVersion || null,
      calculationManifest: clone(source.calculationManifest || null)
    };
    return state;
  }

  function toLegacySnapshot(state, baseSnapshot) {
    const source = clone(baseSnapshot || {});
    const s = state || createDefaultState();
    source.schemaVersion = PROJECT_SCHEMA_VERSION;
    source.projectId = s.identity?.projectId || source.projectId || null;
    source.form = { ...(source.form || {}) };
    source.form.projectName = s.identity?.projectName ?? "";
    source.form.customerName = s.identity?.customerName ?? "";
    source.form.latitude = Number.isFinite(s.location?.latitude) ? Number(s.location.latitude).toFixed(6) : source.form.latitude;
    source.form.longitude = Number.isFinite(s.location?.longitude) ? Number(s.location.longitude).toFixed(6) : source.form.longitude;
    source.form.panel = s.equipment?.moduleId ?? source.form.panel;
    source.form.inverter = s.equipment?.inverterId ?? source.form.inverter;
    Object.assign(source.form, clone(s.layout?.settings || {}));
    Object.assign(source.form, clone(s.electrical?.assumptions || {}));
    Object.assign(source.form, clone(s.energy?.assumptions || {}));
    Object.assign(source.form, clone(s.finance?.assumptions || {}));
    Object.assign(source.form, clone(s.shading?.config || {}));
    if (Number.isFinite(s.equipment?.moduleDimensions?.widthM)) source.form.moduleWidth = String(s.equipment.moduleDimensions.widthM);
    if (Number.isFinite(s.equipment?.moduleDimensions?.heightM)) source.form.moduleHeight = String(s.equipment.moduleDimensions.heightM);
    source.locationLifecycle = {
      ...(source.locationLifecycle || {}),
      state: s.location?.lifecycleState || "Unconfirmed",
      confirmed: s.location?.confirmed === true,
      provenance: s.location?.provenance || "project-state",
      appliedCoordinates: Number.isFinite(s.location?.latitude) && Number.isFinite(s.location?.longitude)
        ? { lat: Number(s.location.latitude), lng: Number(s.location.longitude) }
        : null
    };
    source.installation = s.installation?.type || source.installation || "Rooftop Solar";
    source.roofFaces = clone(s.site?.surfaces || []);
    source.exclusions = clone(s.site?.exclusions || []);
    source.layout = {
      ...(source.layout || {}),
      isCurrent: s.layout?.isCurrent === true,
      manualLayoutEdited: s.layout?.manualEdited === true,
      settings: clone(s.layout?.settings || {}),
      faceContexts: clone(s.layout?.faceContexts || []),
      panels: clone(s.layout?.panels || [])
    };
    source.irradiationValueSource = s.resource?.irradiationValueSource || "manual";
    source.solarWeatherResource = clone(s.resource?.solarWeatherResource || null);
    source.energyInverterEfficiencyManual = s.energy?.inverterEfficiencyManual === true;
    source.shadingCoordinateOrigin = clone(s.shading?.coordinateOrigin || null);
    source.shadingImportHistory = clone(s.shading?.importHistory || []);
    source.shadingObstructions = clone(s.shading?.obstructions || []);
    source.engineeringRules = clone(s.engineeringRules || source.engineeringRules || null);
    source.betaOverrides = {
      moduleDimensions: clone(s.equipment?.moduleDimensions?.override || { enabled: false }),
      wiringLosses: clone(s.electrical?.wiringLosses?.override || { enabled: false })
    };
    source.betaDerived = {
      wiringLosses: clone(s.electrical?.wiringLosses?.inherited || { dcPct: null, acPct: null, sourceFingerprint: null })
    };
    source.projectStateVersion = STATE_VERSION;
    source.projectStateFingerprint = fingerprint(s);
    return source;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return value;
  }

  function createStore(initialState, options = {}) {
    let state = deepFreeze(clone(initialState || createDefaultState()));
    let stateFingerprint = fingerprint(state);
    const listeners = new Set();
    const eventTarget = options.eventTarget || (typeof global.dispatchEvent === "function" ? global : null);

    function notify(action, changedPaths, previousFingerprint) {
      const detail = {
        action: clone(action),
        changedPaths: [...changedPaths],
        fingerprint: stateFingerprint,
        previousFingerprint,
        state
      };
      listeners.forEach(listener => listener(detail));
      if (eventTarget?.dispatchEvent && typeof global.CustomEvent === "function") {
        eventTarget.dispatchEvent(new global.CustomEvent(EVENT_NAME, { detail }));
      }
      return detail;
    }

    function dispatch(action) {
      if (!action || typeof action !== "object") throw new Error("ProjectState action must be an object.");
      const previousFingerprint = stateFingerprint;
      let next = state;
      let requestedPaths = [];
      if (action.type === "SET_PATH") {
        if (!action.path) throw new Error("SET_PATH requires path.");
        next = setPathImmutable(state, action.path, action.value);
        requestedPaths = [String(action.path)];
      } else if (action.type === "MERGE_PATH") {
        if (!action.path) throw new Error("MERGE_PATH requires path.");
        const current = getPath(state, action.path);
        next = setPathImmutable(state, action.path, { ...(current || {}), ...(clone(action.value || {})) });
        requestedPaths = [String(action.path)];
      } else if (action.type === "REPLACE_STATE") {
        next = clone(action.state || createDefaultState());
        requestedPaths = Array.isArray(action.changedPaths) ? action.changedPaths.map(String) : ["*"];
      } else {
        throw new Error(`Unsupported ProjectState action: ${action.type}`);
      }
      const nextFingerprint = fingerprint(next);
      const changed = nextFingerprint !== previousFingerprint;
      state = deepFreeze(next);
      stateFingerprint = nextFingerprint;
      return notify(action, changed ? requestedPaths : [], previousFingerprint);
    }

    return {
      getState: () => state,
      getFingerprint: () => stateFingerprint,
      getPath: path => getPath(state, path),
      selectFingerprint(paths) {
        const list = Array.isArray(paths) ? paths : [paths];
        const selection = {};
        list.filter(Boolean).sort().forEach(path => { selection[path] = getPath(state, path); });
        return fingerprint(selection);
      },
      dispatch,
      replaceState(nextState, changedPaths = ["*"]) { return dispatch({ type: "REPLACE_STATE", state: nextState, changedPaths }); },
      replaceFromLegacy(snapshot, changedPaths = ["*"]) { return dispatch({ type: "REPLACE_STATE", state: fromLegacySnapshot(snapshot), changedPaths }); },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
  }

  const API = {
    STATE_VERSION,
    PROJECT_SCHEMA_VERSION,
    EVENT_NAME,
    FORM_GROUPS,
    FIELD_DOMAIN,
    clone,
    stableStringify,
    fingerprint,
    getPath,
    setPathImmutable,
    createDefaultState,
    fromLegacySnapshot,
    toLegacySnapshot,
    createStore,
    domainForLegacyField: id => FIELD_DOMAIN[id] || null
  };

  global.SolarPVProjectState = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
