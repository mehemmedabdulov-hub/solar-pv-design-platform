"use strict";

/* Solar PV Design Platform v2.1 - corrected monthly energy engine
   Calculation fixes: beam-only geometry shading, inverter-instance clipping, max-active-power clipping basis,
   and clipping percentages referenced to pre-clipping inverter energy. */

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

function normalizeSurfaceAzimuth(value) {
  return ((value % 360) + 360) % 360;
}

function solarVectorForLocalSolarTime(latitudeDeg, dayOfYear, solarHour) {
  const latitude = degreesToRadians(latitudeDeg);
  const declination = degreesToRadians(
    23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  );
  const hourAngle = degreesToRadians(15 * (solarHour - 12));

  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.cos(latitude) * Math.sin(declination) -
    Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const up = Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);

  return { east, north, up, elevationRad: Math.asin(clamp(up, -1, 1)) };
}

function arrayPlaneNormal(tiltDeg, azimuthDeg) {
  const tilt = degreesToRadians(tiltDeg);
  const azimuth = degreesToRadians(normalizeSurfaceAzimuth(azimuthDeg));
  return {
    east: Math.sin(tilt) * Math.sin(azimuth),
    north: Math.sin(tilt) * Math.cos(azimuth),
    up: Math.cos(tilt)
  };
}

function getEnergySimulationInputs() {
  return {
    tiltDeg: Number(document.getElementById("energyArrayTilt").value),
    surfaceAzimuthDeg: normalizeSurfaceAzimuth(Number(document.getElementById("energySurfaceAzimuth").value)),
    albedo: Number(document.getElementById("energyAlbedo").value),
    noctC: Number(document.getElementById("energyNoct").value),
    inverterEfficiencyPct: Number(document.getElementById("energyInverterEfficiency").value),
    soilingPct: Number(document.getElementById("energySoilingLoss").value),
    shadingPct: Number(document.getElementById("energyShadingLoss").value),
    mismatchPct: Number(document.getElementById("energyMismatchLoss").value),
    dcWiringPct: Number(document.getElementById("energyDcWiringLoss").value),
    acWiringPct: Number(document.getElementById("energyAcWiringLoss").value),
    availabilityPct: Number(document.getElementById("energyAvailabilityLoss").value)
  };
}

function validateEnergySimulationInputs(inputs) {
  if (!Number.isFinite(inputs.tiltDeg) || inputs.tiltDeg < 0 || inputs.tiltDeg > 90) return "Array tilt must be between 0° and 90°.";
  if (!Number.isFinite(inputs.surfaceAzimuthDeg)) return "Array surface azimuth must be a valid number.";
  if (!Number.isFinite(inputs.albedo) || inputs.albedo < 0 || inputs.albedo > 1) return "Ground albedo must be between 0 and 1.";
  if (!Number.isFinite(inputs.noctC) || inputs.noctC < 20 || inputs.noctC > 80) return "Module NOCT must be between 20°C and 80°C.";
  if (!Number.isFinite(inputs.inverterEfficiencyPct) || inputs.inverterEfficiencyPct <= 0 || inputs.inverterEfficiencyPct > 100) return "Inverter efficiency must be between 0% and 100%.";

  for (const [label, value] of [
    ["Soiling", inputs.soilingPct],
    ["Shading", inputs.shadingPct],
    ["Mismatch", inputs.mismatchPct],
    ["DC wiring", inputs.dcWiringPct],
    ["AC wiring", inputs.acWiringPct],
    ["Availability", inputs.availabilityPct]
  ]) {
    if (!Number.isFinite(value) || value < 0 || value >= 100) return `${label} loss must be at least 0% and below 100%.`;
  }
  return null;
}

function buildRepresentativeDayRadiation(row, latitude, dayOfYear, solarScale) {
  const samples = [];
  let shapeIntegral = 0;
  let beamHorizontalShapeIntegral = 0;

  for (let solarHour = ENERGY_TIME_STEP_HOURS / 2;
       solarHour < 24;
       solarHour += ENERGY_TIME_STEP_HOURS) {
    const sun = solarVectorForLocalSolarTime(latitude, dayOfYear, solarHour);
    const shape = sun.up > 0 ? Math.pow(sun.up, 0.80) : 0;
    samples.push({ solarHour, sun, shape });
    shapeIntegral += shape * ENERGY_TIME_STEP_HOURS;
    beamHorizontalShapeIntegral += shape * Math.max(sun.up, 0) * ENERGY_TIME_STEP_HOURS;
  }

  if (shapeIntegral <= 0) return { samples: [], usedFallbackComponents: true };

  const ghiDaily = Math.max(0, row.ghiDaily * solarScale);
  let dhiDaily = Number.isFinite(row.dhiDaily) ? Math.max(0, row.dhiDaily * solarScale) : null;
  const suppliedDniDaily = Number.isFinite(row.dniDaily) ? Math.max(0, row.dniDaily * solarScale) : null;
  let usedFallbackComponents = false;

  if (!Number.isFinite(dhiDaily)) {
    dhiDaily = ghiDaily * 0.30;
    usedFallbackComponents = true;
  }
  dhiDaily = Math.min(dhiDaily, ghiDaily);

  let fallbackDniScale = null;
  if (!Number.isFinite(suppliedDniDaily)) {
    const beamHorizontalDaily = Math.max(0, ghiDaily - dhiDaily);
    fallbackDniScale = beamHorizontalShapeIntegral > 0
      ? beamHorizontalDaily / beamHorizontalShapeIntegral
      : 0;
    usedFallbackComponents = true;
  }

  samples.forEach(sample => {
    sample.ghiKWm2 = ghiDaily * sample.shape / shapeIntegral;
    sample.dhiKWm2 = dhiDaily * sample.shape / shapeIntegral;
    sample.dniKWm2 = Number.isFinite(suppliedDniDaily)
      ? suppliedDniDaily * sample.shape / shapeIntegral
      : fallbackDniScale * sample.shape;
  });

  return { samples, usedFallbackComponents };
}

function calculateGeometryAdjustedGroupPower({
  dcCapacityKW,
  poaBeamKWm2,
  poaDiffuseKWm2,
  poaGroundKWm2,
  ambientTempC,
  noctC,
  gammaPmax,
  geometryShadeFraction
}) {
  const beam = Math.max(0, Number(poaBeamKWm2) || 0);
  const diffuse = Math.max(0, Number(poaDiffuseKWm2) || 0);
  const ground = Math.max(0, Number(poaGroundKWm2) || 0);
  const capacity = Math.max(0, Number(dcCapacityKW) || 0);
  const shade = clamp(Number(geometryShadeFraction) || 0, 0, 1);
  const fullPoa = beam + diffuse + ground;
  const shadedPoa = diffuse + ground;
  const temperatureCoefficient = Number(gammaPmax) || 0;

  const fullCellTempC = ambientTempC + ((noctC - 20) / 800) * (fullPoa * 1000);
  const fullTemperatureFactor = Math.max(0, 1 + temperatureCoefficient * (fullCellTempC - 25));
  const shadedCellTempC = ambientTempC + ((noctC - 20) / 800) * (shadedPoa * 1000);
  const shadedTemperatureFactor = Math.max(0, 1 + temperatureCoefficient * (shadedCellTempC - 25));

  const grossKW = capacity * fullPoa;
  const temperatureAdjustedKW = grossKW * fullTemperatureFactor;
  // Geometry ray tracing represents direct-sun obstruction. Diffuse sky and
  // ground-reflected irradiance remain available to the shaded fraction.
  const geometryAdjustedKW = capacity * (
    (1 - shade) * fullPoa * fullTemperatureFactor +
    shade * shadedPoa * shadedTemperatureFactor
  );
  const actualIrradianceWeightKW = capacity * ((1 - shade) * fullPoa + shade * shadedPoa);
  const actualCellTempWeighted = capacity * (
    (1 - shade) * fullPoa * fullCellTempC + shade * shadedPoa * shadedCellTempC
  );

  return {
    poaKWm2: fullPoa,
    shadedPoaKWm2: shadedPoa,
    fullCellTempC,
    shadedCellTempC,
    grossKW,
    temperatureAdjustedKW,
    geometryAdjustedKW,
    actualIrradianceWeightKW,
    actualCellTempWeighted
  };
}

function calculatePerInverterClipping(netDcByInverter, inverterEfficiency, perInverterAcLimitKW, fallbackTotalAcCapacityKW) {
  const efficiency = clamp(Number(inverterEfficiency) || 0, 0, 1);
  const perInverterLimit = Number(perInverterAcLimitKW);
  const fallbackLimit = Math.max(0, Number(fallbackTotalAcCapacityKW) || 0);
  const entries = netDcByInverter instanceof Map ? [...netDcByInverter.entries()] : [];
  let netDcKW = 0;
  let inverterUnclippedKW = 0;
  let inverterClippedKW = 0;

  if (entries.length) {
    entries.forEach(([, rawNetDcKW]) => {
      const bucketNetDcKW = Math.max(0, Number(rawNetDcKW) || 0);
      const bucketUnclippedKW = bucketNetDcKW * efficiency;
      const bucketLimitKW = Number.isFinite(perInverterLimit) && perInverterLimit > 0
        ? perInverterLimit
        : fallbackLimit;
      netDcKW += bucketNetDcKW;
      inverterUnclippedKW += bucketUnclippedKW;
      inverterClippedKW += Math.min(bucketUnclippedKW, bucketLimitKW);
    });
  } else {
    // Compatibility fallback for callers without per-inverter panel assignments.
    netDcKW = 0;
    inverterUnclippedKW = 0;
    inverterClippedKW = 0;
  }

  return {
    netDcKW,
    inverterUnclippedKW,
    inverterClippedKW,
    clippingKW: Math.max(0, inverterUnclippedKW - inverterClippedKW)
  };
}

function calculateClippingPercent(clippingEnergy, inverterUnclippedEnergy) {
  const clipping = Math.max(0, Number(clippingEnergy) || 0);
  const unclipped = Math.max(0, Number(inverterUnclippedEnergy) || 0);
  return unclipped > 0 ? clipping / unclipped * 100 : 0;
}

function calculateAcCapacityFactor(annualAcEnergyKWh, totalAcCapacityKW) {
  const energy = Math.max(0, Number(annualAcEnergyKWh) || 0);
  const acCapacity = Math.max(0, Number(totalAcCapacityKW) || 0);
  return acCapacity > 0 ? energy / (acCapacity * 8760) : 0;
}

function calculateEnergySimulation(dcCapacityKW, totalAcCapacityKW, module, inverter = null) {
  if (!layoutIsCurrent || !placedPanels.length || dcCapacityKW <= 0) return { available: false, reason: "Generate a physical panel layout first." };
  if (!solarWeatherResource || !solarWeatherResource.monthly?.length) return { available: false, reason: "Load solar and weather resource data to run the monthly energy simulation." };

  const activeElectrical = typeof electricalDesignResult !== "undefined" ? electricalDesignResult : null;
  if (activeElectrical?.status === "fail") {
    return { available: false, blockingError: true, reason: "Energy simulation blocked because the electrical string/MPPT design fails." };
  }
  if (activeElectrical && ["pass", "warning"].includes(activeElectrical.status)) {
    const missingAssignments = placedPanels.some(panel => !Number.isFinite(Number(panel.inverterNumber)));
    if (missingAssignments) {
      return { available: false, blockingError: true, reason: "Energy simulation blocked because one or more panels do not have a valid inverter assignment." };
    }
  }

  const inputs = getEnergySimulationInputs();
  const validationError = validateEnergySimulationInputs(inputs);
  if (validationError) return { available: false, reason: validationError, inputError: true };
  const shadingAlignmentError = getShadingMode() !== "manual" ? getShadingCoordinateAlignmentError() : null;
  if (shadingAlignmentError) return { available: false, reason: shadingAlignmentError, inputError: true, shadingCoordinateError: true };

  const energyGroupMap = new Map();
  const projectOriginForShading = {
    lat: Number(document.getElementById("latitude").value),
    lng: Number(document.getElementById("longitude").value)
  };
  placedPanels.forEach(panel => {
    const tilt = Number.isFinite(panel.panelSurfaceTilt) ? panel.panelSurfaceTilt : inputs.tiltDeg;
    const azimuth = Number.isFinite(panel.panelSurfaceAzimuth) ? normalizeSurfaceAzimuth(panel.panelSurfaceAzimuth) : inputs.surfaceAzimuthDeg;
    const faceKey = panel.panelRoofFaceId || panel.panelSubArrayId || "legacy";
    const inverterNumber = Number.isFinite(Number(panel.inverterNumber)) ? Number(panel.inverterNumber) : null;
    const key = `${faceKey}|${tilt.toFixed(2)}|${azimuth.toFixed(2)}|INV:${inverterNumber ?? "unassigned"}`;
    if (!energyGroupMap.has(key)) {
      energyGroupMap.set(key, { tiltDeg: tilt, surfaceAzimuthDeg: azimuth, inverterNumber, panelCount: 0, dcCapacityKW: 0, roofFaces: new Set(), subArrayId: panel.panelSubArrayId || "SA-LEGACY", sumEastM: 0, sumNorthM: 0, panelCenters: [] });
    }
    const group = energyGroupMap.get(key);
    group.panelCount += 1;
    group.dcCapacityKW += module.powerW / 1000;
    if (panel.panelRoofFaceName) group.roofFaces.add(panel.panelRoofFaceName);
    const center = getPanelCenterLatLng(panel);
    if (center && Number.isFinite(projectOriginForShading.lat) && Number.isFinite(projectOriginForShading.lng)) {
      const local = latLngToLocalMeters(center, projectOriginForShading);
      group.sumEastM += local.x;
      group.sumNorthM += local.y;
      group.panelCenters.push({ eastM: local.x, northM: local.y });
    }
  });
  const planeGroups = [...energyGroupMap.values()].map(group => {
    const tiltRad = degreesToRadians(group.tiltDeg);
    const planeGroup = {
      ...group, roofFaces: [...group.roofFaces],
      centerEastM: group.panelCount ? group.sumEastM / group.panelCount : 0,
      centerNorthM: group.panelCount ? group.sumNorthM / group.panelCount : 0,
      planeNormal: arrayPlaneNormal(group.tiltDeg, group.surfaceAzimuthDeg),
      skyViewFactor: (1 + Math.cos(tiltRad)) / 2,
      groundViewFactor: (1 - Math.cos(tiltRad)) / 2
    };
    planeGroup.shadeSamples = buildShadingSamplePoints(planeGroup);
    return planeGroup;
  });
  if (getShadingMode() !== "manual" && shadingObstructions.length) rebuildShadingSpatialIndex();
  resetShadingDiagnostics(planeGroups);

  const latitude = solarWeatherResource.latitude;
  const gammaPmax = module.tempCoeffPmaxPctC / 100;
  const inverterEfficiency = inputs.inverterEfficiencyPct / 100;
  const inverterRecord = inverter || (typeof getSelectedInverter === "function" ? getSelectedInverter() : null);
  const perInverterAcLimitKW = inverterRecord
    ? Math.max(Number(inverterRecord.acPowerKW) || 0, Number(inverterRecord.maxActivePowerKW) || 0)
    : null;
  const manualAnnualGhi = Number(document.getElementById("irradiation").value);
  const solarScale = irradiationValueSource === "manual" && Number.isFinite(manualAnnualGhi) && manualAnnualGhi > 0
    ? manualAnnualGhi / solarWeatherResource.annualGhi : 1;
  const lossFractions = {
    soiling: inputs.soilingPct / 100, shading: inputs.shadingPct / 100, mismatch: inputs.mismatchPct / 100,
    dcWiring: inputs.dcWiringPct / 100, acWiring: inputs.acWiringPct / 100, availability: inputs.availabilityPct / 100
  };
  const annual = {
    ghi: 0, poa: 0, grossDc: 0, temperatureEffect: 0, soiling: 0, shading: 0, geometricShading: 0, manualShading: 0, mismatch: 0, dcWiring: 0,
    inverterConversion: 0, inverterUnclipped: 0, clipping: 0, acWiring: 0, availability: 0, netDc: 0, acEnergy: 0,
    cellTempWeighted: 0, cellTempWeight: 0
  };
  let usedFallbackComponents = false;

  const monthly = solarWeatherResource.monthly.map((row, monthIndex) => {
    const radiation = buildRepresentativeDayRadiation(row, latitude, ENERGY_MONTH_REPRESENTATIVE_DOY[monthIndex], solarScale);
    usedFallbackComponents = usedFallbackComponents || radiation.usedFallbackComponents;
    const month = {
      name: row.name, ghi: row.ghiMonthly * solarScale, poa: 0, grossDc: 0, temperatureEffect: 0, soiling: 0,
      shading: 0, geometricShading: 0, manualShading: 0, mismatch: 0, dcWiring: 0, inverterConversion: 0, inverterUnclipped: 0, clipping: 0, acWiring: 0, availability: 0,
      netDc: 0, acEnergy: 0, cellTempWeighted: 0, cellTempWeight: 0
    };
    const ambientTemp = Number.isFinite(row.meanTemp) ? row.meanTemp : 25;
    const monthMultiplier = row.days;

    radiation.samples.forEach(sample => {
      if (sample.sun.up <= 0) return;
      let grossDcPowerKW = 0;
      let temperatureAdjustedPowerKW = 0;
      let afterSoilingUnshadedKW = 0;
      let afterGeometryShadingKW = 0;
      let afterShadingKW = 0;
      let afterMismatchKW = 0;
      let netDcPowerKW = 0;
      let equivalentPoaKWm2 = 0;
      let sampleCellTempWeighted = 0;
      let sampleCellTempWeight = 0;
      const netDcByInverter = new Map();

      planeGroups.forEach(group => {
        const incidenceCosine = Math.max(0, sample.sun.east * group.planeNormal.east + sample.sun.north * group.planeNormal.north + sample.sun.up * group.planeNormal.up);
        const poaBeam = sample.dniKWm2 * incidenceCosine;
        const poaDiffuse = sample.dhiKWm2 * group.skyViewFactor;
        const poaGround = sample.ghiKWm2 * inputs.albedo * group.groundViewFactor;
        const geometryShadeFraction = calculateGeometryShadingFraction(group, sample.sun);
        const groupPower = calculateGeometryAdjustedGroupPower({
          dcCapacityKW: group.dcCapacityKW,
          poaBeamKWm2: poaBeam,
          poaDiffuseKWm2: poaDiffuse,
          poaGroundKWm2: poaGround,
          ambientTempC: ambientTemp,
          noctC: inputs.noctC,
          gammaPmax,
          geometryShadeFraction
        });
        const groupAfterSoilingUnshadedKW = groupPower.temperatureAdjustedKW * (1 - lossFractions.soiling);
        const groupAfterGeometryKW = groupPower.geometryAdjustedKW * (1 - lossFractions.soiling);
        const shadingMode = getShadingMode();
        const manualShadeFraction = shadingMode === "geometry" ? 0 : lossFractions.shading;
        const groupAfterShadingKW = groupAfterGeometryKW * (1 - manualShadeFraction);
        const groupAfterMismatchKW = groupAfterShadingKW * (1 - lossFractions.mismatch);
        const groupNetDcKW = groupAfterMismatchKW * (1 - lossFractions.dcWiring);
        const inverterKey = group.inverterNumber ?? "unassigned";

        grossDcPowerKW += groupPower.grossKW;
        temperatureAdjustedPowerKW += groupPower.temperatureAdjustedKW;
        afterSoilingUnshadedKW += groupAfterSoilingUnshadedKW;
        afterGeometryShadingKW += groupAfterGeometryKW;
        afterShadingKW += groupAfterShadingKW;
        afterMismatchKW += groupAfterMismatchKW;
        netDcPowerKW += groupNetDcKW;
        netDcByInverter.set(inverterKey, (netDcByInverter.get(inverterKey) || 0) + groupNetDcKW);
        equivalentPoaKWm2 += (group.dcCapacityKW / dcCapacityKW) * groupPower.poaKWm2;
        sampleCellTempWeighted += groupPower.actualCellTempWeighted;
        sampleCellTempWeight += groupPower.actualIrradianceWeightKW;
      });

      const clipping = calculatePerInverterClipping(netDcByInverter, inverterEfficiency, perInverterAcLimitKW, totalAcCapacityKW);
      // Cross-check the independently accumulated total; this should only differ by floating-point noise.
      netDcPowerKW = clipping.netDcKW;
      const inverterUnclippedKW = clipping.inverterUnclippedKW;
      const inverterClippedKW = clipping.inverterClippedKW;
      const afterAcWiringKW = inverterClippedKW * (1 - lossFractions.acWiring);
      const finalAcPowerKW = afterAcWiringKW * (1 - lossFractions.availability);
      const energyMultiplier = ENERGY_TIME_STEP_HOURS * monthMultiplier;

      month.poa += equivalentPoaKWm2 * energyMultiplier;
      month.grossDc += grossDcPowerKW * energyMultiplier;
      month.temperatureEffect += (grossDcPowerKW - temperatureAdjustedPowerKW) * energyMultiplier;
      month.soiling += (temperatureAdjustedPowerKW - afterSoilingUnshadedKW) * energyMultiplier;
      month.geometricShading += (afterSoilingUnshadedKW - afterGeometryShadingKW) * energyMultiplier;
      month.manualShading += (afterGeometryShadingKW - afterShadingKW) * energyMultiplier;
      month.shading += (afterSoilingUnshadedKW - afterShadingKW) * energyMultiplier;
      month.mismatch += (afterShadingKW - afterMismatchKW) * energyMultiplier;
      month.dcWiring += (afterMismatchKW - netDcPowerKW) * energyMultiplier;
      month.netDc += netDcPowerKW * energyMultiplier;
      month.inverterConversion += (netDcPowerKW - inverterUnclippedKW) * energyMultiplier;
      month.inverterUnclipped += inverterUnclippedKW * energyMultiplier;
      month.clipping += clipping.clippingKW * energyMultiplier;
      month.acWiring += (inverterClippedKW - afterAcWiringKW) * energyMultiplier;
      month.availability += (afterAcWiringKW - finalAcPowerKW) * energyMultiplier;
      month.acEnergy += finalAcPowerKW * energyMultiplier;
      month.cellTempWeighted += sampleCellTempWeighted * energyMultiplier;
      month.cellTempWeight += sampleCellTempWeight * energyMultiplier;
    });

    month.averageCellTemp = month.cellTempWeight > 0 ? month.cellTempWeighted / month.cellTempWeight : ambientTemp;
    month.specificYield = dcCapacityKW > 0 ? month.acEnergy / dcCapacityKW : 0;
    month.clippingPct = calculateClippingPercent(month.clipping, month.inverterUnclipped);
    for (const key of ["ghi", "poa", "grossDc", "temperatureEffect", "soiling", "shading", "geometricShading", "manualShading", "mismatch", "dcWiring", "inverterConversion", "inverterUnclipped", "clipping", "acWiring", "availability", "netDc", "acEnergy", "cellTempWeighted", "cellTempWeight"]) annual[key] += month[key];
    return month;
  });

  const specificYield = annual.acEnergy / dcCapacityKW;
  const performanceRatio = annual.poa > 0 ? annual.acEnergy / (dcCapacityKW * annual.poa) : 0;
  // Capacity factor is referenced to nominal AC plant capacity. Specific yield
  // and performance ratio remain referenced to installed DC kWp.
  const capacityFactor = calculateAcCapacityFactor(annual.acEnergy, totalAcCapacityKW);
  const totalLoss = annual.grossDc - annual.acEnergy;
  const totalLossPct = annual.grossDc > 0 ? totalLoss / annual.grossDc * 100 : 0;
  const clippingPct = calculateClippingPercent(annual.clipping, annual.inverterUnclipped);
  const averageCellTemp = annual.cellTempWeight > 0 ? annual.cellTempWeighted / annual.cellTempWeight : null;
  const geometricShadingPct = annual.grossDc > 0 ? annual.geometricShading / annual.grossDc * 100 : 0;
  return {
    available: true, inputs, planeGroups, monthly, annual, annualAcEnergy: annual.acEnergy, specificYield, performanceRatio,
    capacityFactor, totalLoss, totalLossPct, clippingPct, averageCellTemp, geometricShadingPct, shadingMode: getShadingMode(), shadingDiagnostics: getShadingDiagnosticsSnapshot(), usedFallbackComponents, solarScale,
    clippingBasis: Number.isFinite(perInverterAcLimitKW) && perInverterAcLimitKW > 0 ? "per-inverter max active power" : "fallback total AC capacity",
    perInverterAcLimitKW,
    sourceLabel: irradiationValueSource === "manual"
      ? "NASA POWER monthly climatology scaled to the manual annual GHI input"
      : "NASA POWER monthly climatology"
  };
}

globalThis.SolarPVEnergyEngineModule = Object.freeze({version:"2.1.0",deterministic:true,functions:Object.freeze(["clamp", "degreesToRadians", "normalizeSurfaceAzimuth", "solarVectorForLocalSolarTime", "arrayPlaneNormal", "getEnergySimulationInputs", "validateEnergySimulationInputs", "buildRepresentativeDayRadiation", "calculateGeometryAdjustedGroupPower", "calculatePerInverterClipping", "calculateClippingPercent", "calculateAcCapacityFactor", "calculateEnergySimulation"])});
