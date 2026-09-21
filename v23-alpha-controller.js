(function (global) {
  "use strict";

  const LOCATION_STATES = Object.freeze({
    UNCONFIRMED: "Unconfirmed",
    CONFIRMED: "Confirmed",
    LOCKED: "Locked-by-geometry"
  });

  const INSTALLATION_PROFILES = Object.freeze({
    "Rooftop Solar": Object.freeze({ namePrefix: "Roof Face", subArrayPrefix: "SA" }),
    "Ground-Mounted Solar": Object.freeze({ namePrefix: "Ground Block", subArrayPrefix: "GA" }),
    "Solar Carport": Object.freeze({ namePrefix: "Canopy", subArrayPrefix: "CA" })
  });

  function finite(value) { return Number.isFinite(Number(value)); }
  function normalizeCoordinatePair(latitude, longitude) {
    return { lat: Number(latitude), lng: Number(longitude) };
  }
  function cloneCoordinates(value) {
    return value && finite(value.lat) && finite(value.lng) ? { lat: Number(value.lat), lng: Number(value.lng) } : null;
  }
  function sameCoordinates(a, b, tolerance = 1e-7) {
    return !!a && !!b && finite(a.lat) && finite(a.lng) && finite(b.lat) && finite(b.lng) &&
      Math.abs(Number(a.lat) - Number(b.lat)) <= tolerance && Math.abs(Number(a.lng) - Number(b.lng)) <= tolerance;
  }
  function validateCoordinates(latitude, longitude) {
    const pair = normalizeCoordinatePair(latitude, longitude);
    const errors = { latitude: "", longitude: "" };
    if (!finite(pair.lat)) errors.latitude = "Enter a valid latitude.";
    else if (pair.lat < -90 || pair.lat > 90) errors.latitude = "Latitude must be between -90 and 90.";
    if (!finite(pair.lng)) errors.longitude = "Enter a valid longitude.";
    else if (pair.lng < -180 || pair.lng > 180) errors.longitude = "Longitude must be between -180 and 180.";
    return { ok: !errors.latitude && !errors.longitude, coordinates: pair, errors };
  }

  function createLocationLifecycle(options = {}) {
    const initial = validateCoordinates(options.latitude, options.longitude);
    let appliedCoordinates = initial.ok ? initial.coordinates : null;
    let confirmedCoordinates = options.confirmed && appliedCoordinates ? cloneCoordinates(appliedCoordinates) : null;
    let state = options.locked && appliedCoordinates
      ? LOCATION_STATES.LOCKED
      : confirmedCoordinates
        ? LOCATION_STATES.CONFIRMED
        : LOCATION_STATES.UNCONFIRMED;
    if (state === LOCATION_STATES.LOCKED && !confirmedCoordinates) confirmedCoordinates = cloneCoordinates(appliedCoordinates);
    let setModeActive = false;

    function setBoundDataPresent(present) {
      if (present && appliedCoordinates) {
        if (!confirmedCoordinates) confirmedCoordinates = cloneCoordinates(appliedCoordinates);
        state = LOCATION_STATES.LOCKED;
        setModeActive = false;
      } else if (!present && state === LOCATION_STATES.LOCKED) {
        state = confirmedCoordinates ? LOCATION_STATES.CONFIRMED : LOCATION_STATES.UNCONFIRMED;
      }
      return state;
    }

    function recordApplied(latitude, longitude) {
      const validation = validateCoordinates(latitude, longitude);
      if (!validation.ok) return validation;
      appliedCoordinates = cloneCoordinates(validation.coordinates);
      confirmedCoordinates = null;
      state = LOCATION_STATES.UNCONFIRMED;
      setModeActive = false;
      return { ...validation, state };
    }

    function confirmApplied() {
      if (!appliedCoordinates) return false;
      confirmedCoordinates = cloneCoordinates(appliedCoordinates);
      state = LOCATION_STATES.CONFIRMED;
      setModeActive = false;
      return true;
    }

    function applyRelocation(latitude, longitude) {
      const validation = validateCoordinates(latitude, longitude);
      if (!validation.ok) return validation;
      appliedCoordinates = cloneCoordinates(validation.coordinates);
      confirmedCoordinates = cloneCoordinates(validation.coordinates);
      state = LOCATION_STATES.CONFIRMED;
      setModeActive = false;
      return { ...validation, state };
    }

    function restore(options = {}) {
      const validation = validateCoordinates(options.latitude, options.longitude);
      appliedCoordinates = validation.ok ? cloneCoordinates(validation.coordinates) : null;
      confirmedCoordinates = options.confirmed && appliedCoordinates ? cloneCoordinates(appliedCoordinates) : null;
      state = options.locked && appliedCoordinates
        ? LOCATION_STATES.LOCKED
        : confirmedCoordinates
          ? LOCATION_STATES.CONFIRMED
          : LOCATION_STATES.UNCONFIRMED;
      if (state === LOCATION_STATES.LOCKED && !confirmedCoordinates) confirmedCoordinates = cloneCoordinates(appliedCoordinates);
      setModeActive = false;
      return state;
    }

    function requestChange({ latitude, longitude, source = "unknown", hasBoundData = false, requiresSetMode = false } = {}) {
      const validation = validateCoordinates(latitude, longitude);
      if (!validation.ok) return { action: "invalid", source, ...validation };
      if (requiresSetMode && !setModeActive) {
        return { action: "ignored", source, reason: "set-location-mode-required", coordinates: validation.coordinates };
      }
      if (hasBoundData && !sameCoordinates(validation.coordinates, appliedCoordinates)) {
        return {
          action: "relocate",
          source,
          coordinates: validation.coordinates,
          previousCoordinates: cloneCoordinates(confirmedCoordinates || appliedCoordinates)
        };
      }
      if (sameCoordinates(validation.coordinates, appliedCoordinates)) {
        return { action: "same", source, coordinates: validation.coordinates };
      }
      return { action: "apply", source, coordinates: validation.coordinates };
    }

    return Object.freeze({
      beginSetMode() { setModeActive = true; return true; },
      cancelSetMode() { setModeActive = false; return true; },
      isSetModeActive: () => setModeActive,
      getState: () => state,
      isConfirmed: () => state === LOCATION_STATES.CONFIRMED || state === LOCATION_STATES.LOCKED,
      isLocked: () => state === LOCATION_STATES.LOCKED,
      getAppliedCoordinates: () => cloneCoordinates(appliedCoordinates),
      getConfirmedCoordinates: () => cloneCoordinates(confirmedCoordinates),
      recordApplied,
      confirmApplied,
      applyRelocation,
      restore,
      setBoundDataPresent,
      requestChange
    });
  }

  function installationProfile(type) {
    return INSTALLATION_PROFILES[type] || INSTALLATION_PROFILES["Rooftop Solar"];
  }

  function surfaceSequence(face, fallbackIndex = 1) {
    const match = String(face?.roofFaceId || "").match(/(\d+)$/);
    return match ? Number(match[1]) : Number(fallbackIndex) || 1;
  }

  function defaultSurfaceName(type, index) {
    return `${installationProfile(type).namePrefix} ${Number(index) || 1}`;
  }

  function defaultSubArrayId(type, index) {
    return `${installationProfile(type).subArrayPrefix}-${Number(index) || 1}`;
  }

  function isDefaultSurfaceName(value, type, index) {
    return String(value || "").trim() === defaultSurfaceName(type, index);
  }

  function isDefaultSubArrayId(value, type, index) {
    return String(value || "").trim() === defaultSubArrayId(type, index);
  }

  function planInstallationMigration(faces = [], fromType, toType) {
    const sourceType = INSTALLATION_PROFILES[fromType] ? fromType : "Rooftop Solar";
    const targetType = INSTALLATION_PROFILES[toType] ? toType : sourceType;
    return faces.map((face, position) => {
      const index = surfaceSequence(face, position + 1);
      const renameSurface = isDefaultSurfaceName(face?.roofFaceName, sourceType, index);
      const renameSubArray = !String(face?.subArrayId || "").trim() || isDefaultSubArrayId(face?.subArrayId, sourceType, index);
      return {
        index,
        roofFaceId: face?.roofFaceId || null,
        fromType: sourceType,
        toType: targetType,
        roofFaceName: renameSurface ? defaultSurfaceName(targetType, index) : face?.roofFaceName,
        subArrayId: renameSubArray ? defaultSubArrayId(targetType, index) : face?.subArrayId,
        renamedSurface: renameSurface,
        renamedSubArray: renameSubArray
      };
    });
  }

  function createInstallationMigrationState(initialType = "Rooftop Solar") {
    let committedType = INSTALLATION_PROFILES[initialType] ? initialType : "Rooftop Solar";
    let pendingType = null;
    return Object.freeze({
      getCommittedType: () => committedType,
      getPendingType: () => pendingType,
      isPending: () => !!pendingType,
      request(type, hasGeometry) {
        if (!INSTALLATION_PROFILES[type]) return { action: "invalid", committedType, requestedType: type };
        if (type === committedType) { pendingType = null; return { action: "same", committedType, requestedType: type }; }
        if (!hasGeometry) { committedType = type; pendingType = null; return { action: "apply", committedType, requestedType: type }; }
        pendingType = type;
        return { action: "migrate", committedType, requestedType: type };
      },
      cancel() { const requestedType = pendingType; pendingType = null; return { committedType, requestedType }; },
      commit(type = pendingType) {
        if (!INSTALLATION_PROFILES[type]) return false;
        committedType = type;
        pendingType = null;
        return true;
      },
      restore(type) {
        committedType = INSTALLATION_PROFILES[type] ? type : "Rooftop Solar";
        pendingType = null;
        return committedType;
      }
    });
  }


  function createDeliverableInstrumentation() {
    const counts = { genericRefreshes: 0, deliverableBuilds: 0, staleMarks: 0, explicitGenerations: 0 };
    return Object.freeze({
      recordGenericRefresh() { counts.genericRefreshes += 1; },
      recordBuild() { counts.deliverableBuilds += 1; },
      recordStaleMark() { counts.staleMarks += 1; },
      recordExplicitGeneration() { counts.explicitGenerations += 1; },
      snapshot() { return { ...counts }; },
      reset() { Object.keys(counts).forEach(key => { counts[key] = 0; }); }
    });
  }

  const API = Object.freeze({
    VERSION: "2.3-alpha.3",
    LOCATION_STATES,
    INSTALLATION_PROFILES,
    validateCoordinates,
    sameCoordinates,
    createLocationLifecycle,
    defaultSurfaceName,
    defaultSubArrayId,
    isDefaultSurfaceName,
    isDefaultSubArrayId,
    planInstallationMigration,
    createInstallationMigrationState,
    createDeliverableInstrumentation
  });

  global.SolarPVAlphaController = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
