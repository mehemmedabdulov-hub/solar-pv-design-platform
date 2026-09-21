"use strict";

/* Solar PV Design Platform v2.1 - corrected electrical engine
   Calculation fixes: hot-condition DC voltage-drop basis, identical-length parallel MPPT grouping,
   and internally consistent AC feeder loss percentage basis. */

function getElectricalDesignInputs() {
  return {
    minimumDesignTemp: Number(document.getElementById("minimumDesignTemp").value),
    maximumCellTemp: Number(document.getElementById("maximumCellTemp").value),
    vmpTempCoeffPctC: Number(document.getElementById("vmpTempCoeff").value),
    inverterQuantityMode: document.getElementById("inverterQuantityMode").value,
    manualInverterQuantity: Math.max(1, Math.floor(Number(document.getElementById("manualInverterQuantity").value) || 1))
  };
}

function panelElectricalGroupKey(layer) {
  const tilt = Number.isFinite(layer.panelSurfaceTilt) ? layer.panelSurfaceTilt : 0;
  const azimuth = Number.isFinite(layer.panelSurfaceAzimuth) ? layer.panelSurfaceAzimuth : normalizeAzimuth(layer.panelAzimuth || 0);
  return `${layer.panelSubArrayId || layer.panelRoofFaceId || "legacy"}|${tilt.toFixed(1)}|${normalizeAzimuth(azimuth).toFixed(1)}`;
}

function getSortedPanelsForElectricalGroup(panels, azimuth) {
  if (!currentLayoutContext || !panels.length) return [...panels];
  const faceContext = getFaceLayoutContext(panels[0].panelRoofFaceId);
  if (!faceContext) return [...panels];
  const basis = createLayoutBasis(azimuth);
  return [...panels].sort((a, b) => {
    const centerA = getPanelCenterLatLng(a);
    const centerB = getPanelCenterLatLng(b);
    const localA = latLngToLocalMeters(centerA, faceContext.origin);
    const localB = latLngToLocalMeters(centerB, faceContext.origin);
    const gridA = localToGrid(localA, basis);
    const gridB = localToGrid(localB, basis);
    if (Math.abs(gridA.u - gridB.u) > 0.05) return gridA.u - gridB.u;
    return gridA.v - gridB.v;
  });
}

function balancedStringLengths(panelCount, stringCount) {
  const base = Math.floor(panelCount / stringCount);
  const extra = panelCount % stringCount;
  return Array.from({ length: stringCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function chooseStringPartition(panelCount, strictMin, strictMax, preferredMin, preferredMax, parallelCapacity) {
  const minStrings = Math.ceil(panelCount / strictMax);
  const maxStrings = Math.floor(panelCount / strictMin);
  if (minStrings > maxStrings || maxStrings < 1) return null;

  let best = null;
  const hasPreferredWindow = preferredMin <= preferredMax;

  for (let stringCount = minStrings; stringCount <= maxStrings; stringCount += 1) {
    const lengths = balancedStringLengths(panelCount, stringCount);
    if (lengths.some(length => length < strictMin || length > strictMax)) continue;

    const preferredPenalty = hasPreferredWindow
      ? lengths.reduce((sum, length) => {
          if (length < preferredMin) return sum + (preferredMin - length);
          if (length > preferredMax) return sum + (length - preferredMax);
          return sum;
        }, 0)
      : 0;

    // Parallel strings on one MPPT must have the same series-module count.
    // Counting only total strings can incorrectly put N- and (N-1)-module strings
    // in parallel on one tracker when a balanced partition contains two lengths.
    const lengthCounts = new Map();
    lengths.forEach(length => lengthCounts.set(length, (lengthCounts.get(length) || 0) + 1));
    const mpptsNeeded = [...lengthCounts.values()]
      .reduce((sum, count) => sum + Math.ceil(count / parallelCapacity), 0);
    const preferredTarget = hasPreferredWindow ? preferredMax : strictMax;
    const targetDeviation = lengths.reduce((sum, length) => sum + Math.abs(preferredTarget - length), 0);
    const score = [preferredPenalty, mpptsNeeded, stringCount, targetDeviation];

    if (!best || score.some((value, index) => value < best.score[index] && score.slice(0, index).every((x, i) => x === best.score[i]))) {
      best = { stringCount, lengths, mpptsNeeded, score };
    }
  }

  return best;
}

function calculateElectricalDesign() {
  if (!layoutIsCurrent || !placedPanels.length || !currentLayoutContext) {
    return {
      status: "neutral",
      label: "Waiting for layout",
      message: "Generate a physical panel layout first. String sizing and MPPT assignment will run automatically."
    };
  }

  const module = getSelectedModule();
  const inverter = getSelectedInverter();
  const inputs = getElectricalDesignInputs();
  const errors = [];
  const warnings = [];

  if (!Number.isFinite(inputs.minimumDesignTemp) || !Number.isFinite(inputs.maximumCellTemp)) {
    errors.push("Enter valid minimum design and maximum cell temperatures.");
  }
  if (!Number.isFinite(inputs.vmpTempCoeffPctC) || inputs.vmpTempCoeffPctC >= 0) {
    errors.push("Vmp temperature coefficient must be a negative percentage per °C.");
  }
  if (inputs.maximumCellTemp <= 25) {
    warnings.push("Maximum cell temperature is at or below STC temperature; verify this design assumption.");
  }
  if (inputs.minimumDesignTemp >= 25) {
    warnings.push("Minimum design temperature is at or above STC temperature; verify this design assumption.");
  }

  if (errors.length) {
    return { status: "fail", label: "Input error", message: errors.join(" "), errors, warnings };
  }

  const betaVoc = module.tempCoeffVocPctC / 100;
  const betaVmp = inputs.vmpTempCoeffPctC / 100;
  const coldVocPerModule = module.vocV * (1 + betaVoc * (inputs.minimumDesignTemp - 25));
  const coldVmpPerModule = module.vmpV * (1 + betaVmp * (inputs.minimumDesignTemp - 25));
  const hotVmpPerModule = module.vmpV * (1 + betaVmp * (inputs.maximumCellTemp - 25));

  if (coldVocPerModule <= 0 || coldVmpPerModule <= 0 || hotVmpPerModule <= 0) {
    return {
      status: "fail",
      label: "Temperature model invalid",
      message: "The selected temperature assumptions produce a non-positive module voltage. Check the temperature inputs and Vmp coefficient.",
      errors: ["Non-positive temperature-corrected module voltage."],
      warnings
    };
  }

  const absoluteVoltageLimit = Math.min(inverter.maxInputVoltageV, module.maxSystemVoltageV);
  const minOperatingVoltage = Math.max(inverter.mpptMinV, inverter.startVoltageV || 0);
  const nMin = Math.max(1, Math.ceil((minOperatingVoltage - 1e-9) / hotVmpPerModule));
  const nMaxVoc = Math.floor((absoluteVoltageLimit + 1e-9) / coldVocPerModule);
  const nMaxMppt = Math.floor((inverter.mpptMaxV + 1e-9) / coldVmpPerModule);
  const nMax = Math.min(nMaxVoc, nMaxMppt);

  let preferredMin = nMin;
  let preferredMax = nMax;
  if (inverter.fullLoadMpptMinV != null && inverter.fullLoadMpptMaxV != null) {
    preferredMin = Math.max(nMin, Math.ceil((inverter.fullLoadMpptMinV - 1e-9) / hotVmpPerModule));
    preferredMax = Math.min(nMax, Math.floor((inverter.fullLoadMpptMaxV + 1e-9) / coldVmpPerModule));
    if (preferredMin > preferredMax) {
      warnings.push("No string length stays inside the inverter full-load MPPT window across both selected temperature extremes; the strict MPPT operating range is used instead.");
    }
  }

  if (nMax < nMin || nMax < 1) {
    return {
      status: "fail",
      label: "No valid string length",
      message: `No series string length satisfies the selected temperature and inverter voltage limits. Calculated strict range: ${nMin} to ${Math.max(0, nMax)} modules.`,
      nMin, nMax, preferredMin, preferredMax, coldVocPerModule, coldVmpPerModule, hotVmpPerModule, errors: ["No valid series string length."], warnings
    };
  }

  if (module.impA > inverter.maxCurrentPerInputA + 1e-9) {
    return {
      status: "fail",
      label: "Input current incompatible",
      message: `Module Imp ${module.impA.toFixed(2)} A exceeds the inverter maximum current per input of ${inverter.maxCurrentPerInputA.toFixed(2)} A.`,
      nMin, nMax, preferredMin, preferredMax, coldVocPerModule, coldVmpPerModule, hotVmpPerModule,
      errors: ["Module operating current exceeds inverter input limit."], warnings
    };
  }

  const physicalInputsPerMppt = Math.max(1, Math.floor(inverter.inputCount / inverter.mpptCount));
  const maxParallelByImp = Math.floor((inverter.maxCurrentPerMpptA + 1e-9) / module.impA);
  const maxParallelByIsc = Math.floor((inverter.maxShortCircuitPerMpptA + 1e-9) / module.iscA);
  const parallelCapacity = Math.min(physicalInputsPerMppt, maxParallelByImp, maxParallelByIsc);

  if (parallelCapacity < 1) {
    return {
      status: "fail",
      label: "MPPT current incompatible",
      message: "Even one string would exceed an MPPT current or short-circuit-current limit for the selected module/inverter pair.",
      nMin, nMax, preferredMin, preferredMax, coldVocPerModule, coldVmpPerModule, hotVmpPerModule,
      parallelCapacity, errors: ["No current-valid string can be connected to an MPPT."], warnings
    };
  }

  const groupMap = new Map();
  placedPanels.forEach(panel => {
    const key = panelElectricalGroupKey(panel);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        faceName: panel.panelRoofFaceName || panel.panelRoofFaceId || "Legacy array",
        surfaceTilt: Number.isFinite(panel.panelSurfaceTilt) ? panel.panelSurfaceTilt : 0,
        surfaceAzimuth: Number.isFinite(panel.panelSurfaceAzimuth) ? normalizeAzimuth(panel.panelSurfaceAzimuth) : normalizeAzimuth(panel.panelAzimuth || 0),
        sortAzimuth: normalizeAzimuth(panel.panelAzimuth || 0),
        panels: []
      });
    }
    groupMap.get(key).panels.push(panel);
  });

  const strings = [];
  let nextStringNumber = 1;
  for (const group of groupMap.values()) {
    const sortedPanels = getSortedPanelsForElectricalGroup(group.panels, group.sortAzimuth);
    const partition = chooseStringPartition(
      sortedPanels.length,
      nMin,
      nMax,
      preferredMin,
      preferredMax,
      parallelCapacity
    );

    if (!partition) {
      errors.push(
        `${group.faceName} (${group.surfaceTilt.toFixed(1)}° / ${group.surfaceAzimuth.toFixed(1)}°) has ${sortedPanels.length} modules and cannot be divided into strings of ${nMin}–${nMax} modules.`
      );
      continue;
    }

    let cursor = 0;
    partition.lengths.forEach(length => {
      const stringPanels = sortedPanels.slice(cursor, cursor + length);
      cursor += length;
      const inPreferredWindow = preferredMin <= preferredMax && length >= preferredMin && length <= preferredMax;
      strings.push({
        id: `S${String(nextStringNumber).padStart(3, "0")}`,
        number: nextStringNumber,
        groupKey: group.key,
        orientation: group.faceName,
        azimuth: group.surfaceAzimuth,
        surfaceTilt: group.surfaceTilt,
        surfaceAzimuth: group.surfaceAzimuth,
        panels: stringPanels,
        moduleCount: length,
        vmpStcV: length * module.vmpV,
        vmpHotV: length * hotVmpPerModule,
        vmpColdV: length * coldVmpPerModule,
        vocColdV: length * coldVocPerModule,
        powerKW: length * module.powerW / 1000,
        inPreferredWindow
      });
      nextStringNumber += 1;
    });
  }

  if (errors.length) {
    return {
      status: "fail",
      label: "String partition failed",
      message: errors.join(" "),
      nMin, nMax, preferredMin, preferredMax, coldVocPerModule, coldVmpPerModule, hotVmpPerModule,
      parallelCapacity, physicalInputsPerMppt, strings, errors, warnings
    };
  }

  // Keep different orientation/azimuth groups on separate MPPTs, and never
  // parallel strings with different series-module counts on the same tracker.
  const mpptAssignments = [];
  const stringsByCompatibleMpptGroup = new Map();
  strings.forEach(string => {
    const compatibleKey = `${string.groupKey}|modules:${string.moduleCount}`;
    if (!stringsByCompatibleMpptGroup.has(compatibleKey)) stringsByCompatibleMpptGroup.set(compatibleKey, []);
    stringsByCompatibleMpptGroup.get(compatibleKey).push(string);
  });

  for (const [compatibleKey, groupStrings] of stringsByCompatibleMpptGroup.entries()) {
    for (let i = 0; i < groupStrings.length; i += parallelCapacity) {
      const assignedStrings = groupStrings.slice(i, i + parallelCapacity);
      mpptAssignments.push({
        groupKey: groupStrings[0].groupKey,
        compatibleKey,
        moduleCount: groupStrings[0].moduleCount,
        strings: assignedStrings,
        powerKW: assignedStrings.reduce((sum, item) => sum + item.powerKW, 0),
        operatingCurrentA: assignedStrings.length * module.impA,
        shortCircuitCurrentA: assignedStrings.length * module.iscA
      });
    }
  }

  const totalDcKW = placedPanels.length * module.powerW / 1000;
  const minInvertersByMppt = Math.max(1, Math.ceil(mpptAssignments.length / inverter.mpptCount));
  const minInvertersByRecommendedPower = inverter.recommendedMaxPvKW == null
    ? 1
    : Math.max(1, Math.ceil(totalDcKW / inverter.recommendedMaxPvKW));
  const automaticInverterQuantity = Math.max(minInvertersByMppt, minInvertersByRecommendedPower);
  const inverterQuantity = inputs.inverterQuantityMode === "manual"
    ? inputs.manualInverterQuantity
    : automaticInverterQuantity;

  if (inverterQuantity * inverter.mpptCount < mpptAssignments.length) {
    errors.push(
      `${inverterQuantity} inverter(s) provide ${inverterQuantity * inverter.mpptCount} MPPT(s), but ${mpptAssignments.length} MPPT assignment(s) are required to keep the electrical groups and current limits valid.`
    );
  }

  if (errors.length) {
    return {
      status: "fail",
      label: "Insufficient inverter / MPPT capacity",
      message: errors.join(" "),
      nMin, nMax, preferredMin, preferredMax, coldVocPerModule, coldVmpPerModule, hotVmpPerModule,
      parallelCapacity, physicalInputsPerMppt, strings, mpptAssignments, inverterQuantity,
      automaticInverterQuantity, totalDcKW, errors, warnings
    };
  }

  const inverterInstances = Array.from({ length: inverterQuantity }, (_, index) => ({
    number: index + 1,
    mppts: [],
    dcKW: 0,
    stringCount: 0
  }));

  // Load-balance MPPT groups across inverter instances.
  const orderedMppts = [...mpptAssignments].sort((a, b) => b.powerKW - a.powerKW);
  orderedMppts.forEach(mppt => {
    const candidates = inverterInstances
      .filter(instance => instance.mppts.length < inverter.mpptCount)
      .sort((a, b) => (a.dcKW - b.dcKW) || (a.mppts.length - b.mppts.length) || (a.number - b.number));
    const instance = candidates[0];
    const mpptNumber = instance.mppts.length + 1;
    const assigned = { ...mppt, inverterNumber: instance.number, mpptNumber };
    instance.mppts.push(assigned);
    instance.dcKW += assigned.powerKW;
    instance.stringCount += assigned.strings.length;

    assigned.strings.forEach((string, index) => {
      string.inverterNumber = instance.number;
      string.mpptNumber = mpptNumber;
      string.inputNumber = index + 1;
    });
  });

  let preferredWindowMisses = 0;
  strings.forEach(string => {
    const strictVoltagePass =
      string.vocColdV <= absoluteVoltageLimit + 1e-6 &&
      string.vmpHotV >= inverter.mpptMinV - 1e-6 &&
      string.vmpColdV <= inverter.mpptMaxV + 1e-6;
    string.strictVoltagePass = strictVoltagePass;
    if (!string.inPreferredWindow) preferredWindowMisses += 1;
    if (!strictVoltagePass) errors.push(`${string.id} fails a strict voltage limit.`);
  });

  inverterInstances.forEach(instance => {
    if (inverter.recommendedMaxPvKW != null && instance.dcKW > inverter.recommendedMaxPvKW + 1e-6) {
      warnings.push(
        `Inverter ${instance.number} receives ${instance.dcKW.toFixed(2)} kWp, above the manufacturer's recommended maximum PV power of ${inverter.recommendedMaxPvKW.toFixed(2)} kWp.`
      );
    }
  });

  if (preferredWindowMisses > 0 && preferredMin <= preferredMax) {
    warnings.push(`${preferredWindowMisses} string(s) are inside the strict MPPT range but outside the full-load preferred voltage window at one of the selected temperature extremes.`);
  }

  const totalAcKW = inverterQuantity * inverter.acPowerKW;
  const dcAcRatio = totalAcKW > 0 ? totalDcKW / totalAcKW : 0;
  const usedMppts = mpptAssignments.length;
  const availableMppts = inverterQuantity * inverter.mpptCount;

  const status = errors.length ? "fail" : (warnings.length ? "warning" : "pass");
  const label = status === "pass" ? "PASS" : (status === "warning" ? "PASS WITH WARNINGS" : "FAIL");
  const stringLengths = [...new Set(strings.map(string => string.moduleCount))].sort((a, b) => a - b);

  return {
    status,
    label,
    message: errors.length
      ? errors.join(" ")
      : `${strings.length} string(s) assigned across ${usedMppts} MPPT(s) and ${inverterQuantity} inverter(s). Strict voltage and current checks ${status === "pass" ? "pass" : "pass, with notes below"}.`,
    module,
    inverter,
    inputs,
    nMin,
    nMax,
    preferredMin,
    preferredMax,
    coldVocPerModule,
    coldVmpPerModule,
    hotVmpPerModule,
    absoluteVoltageLimit,
    parallelCapacity,
    physicalInputsPerMppt,
    strings,
    stringLengths,
    mpptAssignments,
    inverterInstances,
    inverterQuantity,
    automaticInverterQuantity,
    totalDcKW,
    totalAcKW,
    dcAcRatio,
    usedMppts,
    availableMppts,
    errors,
    warnings
  };
}

function clearPanelElectricalAssignments() {
  placedPanels.forEach(panel => {
    delete panel.stringId;
    delete panel.inverterNumber;
    delete panel.mpptNumber;
    delete panel.inputNumber;
  });
}

function applyPanelElectricalAssignments(result) {
  clearPanelElectricalAssignments();
  if (!result || !result.strings) return;

  result.strings.forEach(string => {
    string.panels.forEach(panel => {
      panel.stringId = string.id;
      panel.inverterNumber = string.inverterNumber;
      panel.mpptNumber = string.mpptNumber;
      panel.inputNumber = string.inputNumber;
      panel.bindPopup(
        `<strong>Panel ${panel.panelNumber}</strong><br>` +
        `${escapeHtml(panel.panelSubArrayId || "Sub-array")} · ${escapeHtml(panel.panelRoofFaceName || "Roof Face")} · ${Number(panel.panelSurfaceTilt ?? 0).toFixed(1)}° tilt / ${Number(panel.panelSurfaceAzimuth ?? panel.panelAzimuth ?? 0).toFixed(1)}° surface azimuth<br>` +
        `${string.id} · Inverter ${string.inverterNumber} · MPPT ${string.mpptNumber} · Input ${string.inputNumber}<br>` +
        `${string.moduleCount} modules/string · ${string.powerKW.toFixed(2)} kWp/string`
      );
    });
  });
}

function nextStandardValue(values, required) {
  return values.find(value => value + 1e-9 >= required) ?? null;
}

function getDetailedElectricalInputs(options = {}) {
  const legacyInputs = {
    designCurrentFactor: Number(document.getElementById("designCurrentFactor")?.value),
    conductorTempFactor: Number(document.getElementById("conductorTempFactor")?.value),
    dcMaxVoltageDropPct: Number(document.getElementById("dcMaxVoltageDropPct")?.value),
    acMaxVoltageDropPct: Number(document.getElementById("acMaxVoltageDropPct")?.value),
    dcCurrentDensityAmm2: Number(document.getElementById("dcCurrentDensityAmm2")?.value),
    acCurrentDensityAmm2: Number(document.getElementById("acCurrentDensityAmm2")?.value)
  };
  let ruleContext = options.ruleContextOverride || null;
  try {
    if (!ruleContext && typeof globalThis.getActiveEngineeringRuleContext === "function") {
      ruleContext = globalThis.getActiveEngineeringRuleContext({ legacyInputs });
    } else if (!ruleContext && globalThis.SolarPVRulePacks?.buildRuleContext) {
      ruleContext = globalThis.SolarPVRulePacks.buildRuleContext({
        packId: globalThis.SolarPVRulePacks.LEGACY_RULE_PACK_ID,
        legacyInputs
      });
    }
  } catch (error) {
    ruleContext = { valid: false, errors: [error?.message || String(error)], warnings: [] };
  }
  return {
    dcStringOneWayLengthM: Number(document.getElementById("dcStringOneWayLengthM")?.value),
    dcHomerunOneWayLengthM: Number(document.getElementById("dcHomerunOneWayLengthM")?.value),
    acFeederOneWayLengthM: Number(document.getElementById("acFeederOneWayLengthM")?.value),
    acSystemVoltageV: Number(document.getElementById("acSystemVoltageV")?.value),
    acPowerFactor: Number(document.getElementById("acPowerFactor")?.value),
    designCurrentFactor: legacyInputs.designCurrentFactor,
    designCurrentFactorDc: Number(ruleContext?.dcDesignCurrentFactor ?? legacyInputs.designCurrentFactor),
    designCurrentFactorAc: Number(ruleContext?.acDesignCurrentFactor ?? legacyInputs.designCurrentFactor),
    conductorTempFactor: Number(ruleContext?.conductorTempFactor ?? legacyInputs.conductorTempFactor),
    dcMaxVoltageDropPct: Number(ruleContext?.dcMaxVoltageDropPct ?? legacyInputs.dcMaxVoltageDropPct),
    acMaxVoltageDropPct: Number(ruleContext?.acMaxVoltageDropPct ?? legacyInputs.acMaxVoltageDropPct),
    dcCurrentDensityAmm2: Number(ruleContext?.dcCurrentDensityAmm2 ?? legacyInputs.dcCurrentDensityAmm2),
    acCurrentDensityAmm2: Number(ruleContext?.acCurrentDensityAmm2 ?? legacyInputs.acCurrentDensityAmm2),
    conductorResistivityOhmMm2M: Number(ruleContext?.resistivityOhmMm2M ?? COPPER_RESISTIVITY_OHM_MM2_M),
    conductorMaterial: String(ruleContext?.conductorMaterialLabel || "Copper"),
    standardCableSizesMm2: ruleContext?.cableSizesMm2 || STANDARD_CABLE_SIZES_MM2,
    ruleContext,
    legacyInputs
  };
}

function conductorResistanceOhm(lengthM, sizeMm2, tempFactor = 1, resistivityOhmMm2M = COPPER_RESISTIVITY_OHM_MM2_M) {
  return Math.max(1e-9, Number(resistivityOhmMm2M) || COPPER_RESISTIVITY_OHM_MM2_M) * Math.max(0, lengthM) * Math.max(1, tempFactor) / Math.max(sizeMm2, 1e-9);
}

function chooseDcCableSize({ operatingCurrentA, designCurrentA, protectionA = null, oneWayLengthM, operatingVoltageV, maxDropPct, currentDensity, tempFactor, resistivityOhmMm2M = COPPER_RESISTIVITY_OHM_MM2_M, standardCableSizesMm2 = STANDARD_CABLE_SIZES_MM2 }) {
  const currentBasis = Math.max(designCurrentA, protectionA || 0);
  const sizeByCurrent = currentBasis / Math.max(currentDensity, 1e-9);
  const allowedDropV = Math.max(operatingVoltageV * maxDropPct / 100, 1e-9);
  const sizeByDrop = 2 * Math.max(0, oneWayLengthM) * operatingCurrentA * resistivityOhmMm2M * tempFactor / allowedDropV;
  const requiredSize = Math.max(2.5, sizeByCurrent, sizeByDrop);
  const sizeMm2 = nextStandardValue(standardCableSizesMm2, requiredSize);
  if (!sizeMm2) return { sizeMm2: null, requiredSize, sizeByCurrent, sizeByDrop, dropV: Infinity, dropPct: Infinity, capacityA: 0, lossW: Infinity };
  const loopR = conductorResistanceOhm(2 * oneWayLengthM, sizeMm2, tempFactor, resistivityOhmMm2M);
  const dropV = operatingCurrentA * loopR;
  const dropPct = operatingVoltageV > 0 ? dropV / operatingVoltageV * 100 : Infinity;
  const lossW = operatingCurrentA * operatingCurrentA * loopR;
  return { sizeMm2, requiredSize, sizeByCurrent, sizeByDrop, dropV, dropPct, capacityA: sizeMm2 * currentDensity, lossW };
}

function chooseAcCableSize({ operatingCurrentA, designCurrentA, breakerA, oneWayLengthM, lineVoltageV, maxDropPct, currentDensity, tempFactor, resistivityOhmMm2M = COPPER_RESISTIVITY_OHM_MM2_M, standardCableSizesMm2 = STANDARD_CABLE_SIZES_MM2 }) {
  const currentBasis = Math.max(designCurrentA, breakerA || 0);
  const sizeByCurrent = currentBasis / Math.max(currentDensity, 1e-9);
  const allowedDropV = Math.max(lineVoltageV * maxDropPct / 100, 1e-9);
  const sizeByDrop = Math.sqrt(3) * Math.max(0, oneWayLengthM) * operatingCurrentA * resistivityOhmMm2M * tempFactor / allowedDropV;
  const requiredSize = Math.max(2.5, sizeByCurrent, sizeByDrop);
  const sizeMm2 = nextStandardValue(standardCableSizesMm2, requiredSize);
  if (!sizeMm2) return { sizeMm2: null, requiredSize, sizeByCurrent, sizeByDrop, dropV: Infinity, dropPct: Infinity, capacityA: 0, lossW: Infinity };
  const phaseR = conductorResistanceOhm(oneWayLengthM, sizeMm2, tempFactor, resistivityOhmMm2M);
  const dropV = Math.sqrt(3) * operatingCurrentA * phaseR;
  const dropPct = lineVoltageV > 0 ? dropV / lineVoltageV * 100 : Infinity;
  const lossW = 3 * operatingCurrentA * operatingCurrentA * phaseR;
  return { sizeMm2, requiredSize, sizeByCurrent, sizeByDrop, dropV, dropPct, capacityA: sizeMm2 * currentDensity, lossW };
}

function suggestedProtectiveEarthSizeMm2(phaseSizeMm2, ruleContext = null) {
  if (!Number.isFinite(phaseSizeMm2) || phaseSizeMm2 <= 0) return null;
  if (ruleContext?.peRules && globalThis.SolarPVRulePacks?.suggestProtectiveEarthSize) {
    return globalThis.SolarPVRulePacks.suggestProtectiveEarthSize(phaseSizeMm2, ruleContext.peRules, ruleContext.cableSizesMm2 || STANDARD_CABLE_SIZES_MM2);
  }
  const raw = phaseSizeMm2 <= 16 ? phaseSizeMm2 : phaseSizeMm2 <= 35 ? 16 : phaseSizeMm2 / 2;
  return nextStandardValue(STANDARD_CABLE_SIZES_MM2, raw);
}

function calculateDetailedElectricalDesign(baseElectrical = electricalDesignResult, options = {}) {
  if (!layoutIsCurrent || !placedPanels.length) {
    return { status: "neutral", label: "Waiting for layout", message: "Generate a physical layout and string/MPPT design first." };
  }
  const electrical = baseElectrical || calculateElectricalDesign();
  if (!electrical || electrical.status === "fail" || !electrical.strings?.length || !electrical.inverterInstances?.length) {
    return { status: "neutral", label: "Waiting for valid string design", message: "A valid string/MPPT assignment is required before detailed electrical calculations can run." };
  }
  const inputs = getDetailedElectricalInputs(options);
  const errors = [];
  const warnings = [];
  const numericInputs = [inputs.dcStringOneWayLengthM, inputs.dcHomerunOneWayLengthM, inputs.acFeederOneWayLengthM, inputs.acSystemVoltageV, inputs.acPowerFactor, inputs.designCurrentFactorDc, inputs.designCurrentFactorAc, inputs.conductorTempFactor, inputs.dcMaxVoltageDropPct, inputs.acMaxVoltageDropPct, inputs.dcCurrentDensityAmm2, inputs.acCurrentDensityAmm2, inputs.conductorResistivityOhmMm2M];
  if (!numericInputs.every(Number.isFinite) || inputs.dcStringOneWayLengthM < 0 || inputs.dcHomerunOneWayLengthM < 0 || inputs.acFeederOneWayLengthM < 0 || inputs.acSystemVoltageV <= 0 || inputs.acPowerFactor <= 0 || inputs.acPowerFactor > 1 || inputs.designCurrentFactorDc < 1 || inputs.designCurrentFactorAc < 1 || inputs.conductorTempFactor < 1 || inputs.dcMaxVoltageDropPct <= 0 || inputs.acMaxVoltageDropPct <= 0 || inputs.dcCurrentDensityAmm2 <= 0 || inputs.acCurrentDensityAmm2 <= 0 || inputs.conductorResistivityOhmMm2M <= 0) {
    return { status: "fail", label: "Input error", message: "Enter valid detailed-electrical design inputs and rule-pack settings.", errors: ["Invalid detailed-electrical or rule-pack input."], warnings, ruleContext: inputs.ruleContext };
  }
  if (inputs.ruleContext && !inputs.ruleContext.valid) {
    return { status: "fail", label: "Rule-pack error", message: inputs.ruleContext.errors.join(" ") || "The active engineering rule pack is invalid.", errors: [...inputs.ruleContext.errors], warnings: [...(inputs.ruleContext.warnings || [])], ruleContext: inputs.ruleContext };
  }
  if (inputs.ruleContext?.warnings?.length) warnings.push(...inputs.ruleContext.warnings);
  const protectionRatings = inputs.ruleContext?.protectionRatingsA?.length ? inputs.ruleContext.protectionRatingsA : STANDARD_PROTECTION_RATINGS_A;

  const module = electrical.module || getSelectedModule();
  const inverter = electrical.inverter || getSelectedInverter();
  const rows = [];
  let totalDcLossW = 0;
  let totalAcLossW = 0;
  const mpptStringCount = new Map();
  electrical.strings.forEach(string => {
    const key = `${string.inverterNumber}:${string.mpptNumber}`;
    mpptStringCount.set(key, (mpptStringCount.get(key) || 0) + 1);
  });

  electrical.strings.forEach(string => {
    const parallelStrings = mpptStringCount.get(`${string.inverterNumber}:${string.mpptNumber}`) || 1;
    const designCurrentA = module.iscA * inputs.designCurrentFactorDc;
    let fuseA = null;
    let protectionText = "Direct inverter input; string fuse not required by the active preliminary rule pack";
    const fuseThreshold = Math.max(2, Number(inputs.ruleContext?.stringFuseParallelThreshold || 2));
    if (parallelStrings >= fuseThreshold) {
      const fuseBasisA = designCurrentA * Number(inputs.ruleContext?.stringFuseDesignMultiplier || 1);
      fuseA = nextStandardValue(protectionRatings, fuseBasisA);
      if (!fuseA) errors.push(`${string.id}: no standard string-fuse size can satisfy ${designCurrentA.toFixed(1)} A design current.`);
      if (fuseA && fuseA > module.maxSeriesFuseA + 1e-9) errors.push(`${string.id}: required ${fuseA} A string fuse exceeds module maximum series fuse ${module.maxSeriesFuseA} A.`);
      protectionText = fuseA ? `${fuseA} A gPV-class preliminary string fuse` : "No valid fuse size";
    }
    const cable = chooseDcCableSize({
      operatingCurrentA: module.impA,
      designCurrentA,
      protectionA: fuseA,
      oneWayLengthM: inputs.dcStringOneWayLengthM,
      operatingVoltageV: Math.max(string.vmpHotV, 1),
      maxDropPct: inputs.dcMaxVoltageDropPct,
      currentDensity: inputs.dcCurrentDensityAmm2,
      tempFactor: inputs.conductorTempFactor,
      resistivityOhmMm2M: inputs.conductorResistivityOhmMm2M,
      standardCableSizesMm2: inputs.standardCableSizesMm2
    });
    if (!cable.sizeMm2) errors.push(`${string.id}: required DC cable section exceeds the available standard-size table.`);
    if (cable.dropPct > inputs.dcMaxVoltageDropPct + 1e-6) errors.push(`${string.id}: DC voltage drop ${cable.dropPct.toFixed(2)}% exceeds ${inputs.dcMaxVoltageDropPct.toFixed(2)}%.`);
    if (fuseA && cable.capacityA + 1e-9 < fuseA) errors.push(`${string.id}: preliminary cable capacity ${cable.capacityA.toFixed(1)} A is below the ${fuseA} A fuse rating.`);
    totalDcLossW += Number.isFinite(cable.lossW) ? cable.lossW : 0;
    rows.push({
      circuit: string.id,
      qty: 1,
      designCurrentA,
      oneWayLengthM: inputs.dcStringOneWayLengthM,
      cableSizeMm2: cable.sizeMm2,
      voltageV: string.vmpHotV,
      dropPct: cable.dropPct,
      protection: protectionText,
      capacityA: cable.capacityA,
      status: cable.sizeMm2 && cable.dropPct <= inputs.dcMaxVoltageDropPct + 1e-6 && (!fuseA || fuseA <= module.maxSeriesFuseA + 1e-9) && (!fuseA || cable.capacityA + 1e-9 >= fuseA) ? "pass" : "fail",
      category: "dc-string"
    });
  });

  // Optional preliminary MPPT/homerun aggregation for parallel groups.
  const mpptGroups = new Map();
  electrical.strings.forEach(string => {
    const key = `${string.inverterNumber}:${string.mpptNumber}`;
    if (!mpptGroups.has(key)) mpptGroups.set(key, []);
    mpptGroups.get(key).push(string);
  });
  for (const [key, strings] of mpptGroups.entries()) {
    if (strings.length <= 1 || inputs.dcHomerunOneWayLengthM <= 0) continue;
    const operatingCurrentA = strings.length * module.impA;
    const designCurrentA = strings.length * module.iscA * inputs.designCurrentFactorDc;
    const isolatorA = nextStandardValue(protectionRatings, designCurrentA * Number(inputs.ruleContext?.dcIsolatorDesignMultiplier || 1));
    const operatingVoltageV = Math.min(...strings.map(string => string.vmpHotV));
    const cable = chooseDcCableSize({
      operatingCurrentA,
      designCurrentA,
      protectionA: isolatorA,
      oneWayLengthM: inputs.dcHomerunOneWayLengthM,
      operatingVoltageV,
      maxDropPct: inputs.dcMaxVoltageDropPct,
      currentDensity: inputs.dcCurrentDensityAmm2,
      tempFactor: inputs.conductorTempFactor,
      resistivityOhmMm2M: inputs.conductorResistivityOhmMm2M,
      standardCableSizesMm2: inputs.standardCableSizesMm2
    });
    if (!cable.sizeMm2 || !isolatorA) errors.push(`MPPT ${key}: no valid preliminary homerun cable/isolator size.`);
    if (cable.dropPct > inputs.dcMaxVoltageDropPct + 1e-6) errors.push(`MPPT ${key}: DC homerun voltage drop ${cable.dropPct.toFixed(2)}% exceeds the configured limit.`);
    if (isolatorA && cable.capacityA + 1e-9 < isolatorA) errors.push(`MPPT ${key}: cable capacity is below the preliminary isolator current rating.`);
    totalDcLossW += Number.isFinite(cable.lossW) ? cable.lossW : 0;
    rows.push({
      circuit: `MPPT ${key} homerun`, qty: 1, designCurrentA, oneWayLengthM: inputs.dcHomerunOneWayLengthM,
      cableSizeMm2: cable.sizeMm2, voltageV: operatingVoltageV, dropPct: cable.dropPct,
      protection: isolatorA ? `${isolatorA} A DC isolator / combiner output; ${inputs.ruleContext?.spdDc || "Type 2 DC SPD preliminary"}` : "No valid isolator size",
      capacityA: cable.capacityA,
      status: cable.sizeMm2 && isolatorA && cable.dropPct <= inputs.dcMaxVoltageDropPct + 1e-6 && cable.capacityA + 1e-9 >= isolatorA ? "pass" : "fail",
      category: "dc-homerun"
    });
  }

  let largestBreakerA = 0;
  let maxAcCableSize = 0;
  let suggestedPeSize = 0;
  let totalAcSizingPowerKW = 0;
  electrical.inverterInstances.forEach(instance => {
    const acSizingPowerKW = Math.max(Number(inverter.acPowerKW) || 0, Number(inverter.maxActivePowerKW) || 0);
    totalAcSizingPowerKW += acSizingPowerKW;
    const operatingCurrentA = acSizingPowerKW * 1000 / (Math.sqrt(3) * inputs.acSystemVoltageV * inputs.acPowerFactor);
    const designCurrentA = operatingCurrentA * inputs.designCurrentFactorAc;
    const breakerA = nextStandardValue(protectionRatings, designCurrentA * Number(inputs.ruleContext?.acBreakerDesignMultiplier || 1));
    if (!breakerA) errors.push(`Inverter ${instance.number}: no standard AC breaker size can satisfy ${designCurrentA.toFixed(1)} A.`);
    const cable = chooseAcCableSize({
      operatingCurrentA,
      designCurrentA,
      breakerA,
      oneWayLengthM: inputs.acFeederOneWayLengthM,
      lineVoltageV: inputs.acSystemVoltageV,
      maxDropPct: inputs.acMaxVoltageDropPct,
      currentDensity: inputs.acCurrentDensityAmm2,
      tempFactor: inputs.conductorTempFactor,
      resistivityOhmMm2M: inputs.conductorResistivityOhmMm2M,
      standardCableSizesMm2: inputs.standardCableSizesMm2
    });
    if (!cable.sizeMm2) errors.push(`Inverter ${instance.number}: required AC cable section exceeds the available standard-size table.`);
    if (cable.dropPct > inputs.acMaxVoltageDropPct + 1e-6) errors.push(`Inverter ${instance.number}: AC voltage drop ${cable.dropPct.toFixed(2)}% exceeds ${inputs.acMaxVoltageDropPct.toFixed(2)}%.`);
    if (breakerA && cable.capacityA + 1e-9 < breakerA) errors.push(`Inverter ${instance.number}: preliminary conductor capacity ${cable.capacityA.toFixed(1)} A is below the ${breakerA} A breaker rating.`);
    totalAcLossW += Number.isFinite(cable.lossW) ? cable.lossW : 0;
    largestBreakerA = Math.max(largestBreakerA, breakerA || 0);
    maxAcCableSize = Math.max(maxAcCableSize, cable.sizeMm2 || 0);
    suggestedPeSize = Math.max(suggestedPeSize, suggestedProtectiveEarthSizeMm2(cable.sizeMm2, inputs.ruleContext) || 0);
    rows.push({
      circuit: `Inverter ${instance.number} AC feeder`, qty: 1, designCurrentA, oneWayLengthM: inputs.acFeederOneWayLengthM,
      cableSizeMm2: cable.sizeMm2, voltageV: inputs.acSystemVoltageV, dropPct: cable.dropPct,
      protection: breakerA ? `${breakerA} A AC breaker + AC isolator; ${inputs.ruleContext?.spdAc || "Type 2 AC SPD preliminary"}` : "No valid breaker size",
      capacityA: cable.capacityA,
      status: cable.sizeMm2 && breakerA && cable.dropPct <= inputs.acMaxVoltageDropPct + 1e-6 && cable.capacityA + 1e-9 >= breakerA ? "pass" : "fail",
      category: "ac-feeder"
    });

    const inverterMpptCounts = [...mpptStringCount.entries()]
      .filter(([key]) => key.startsWith(`${instance.number}:`))
      .map(([, count]) => count);
    const maxParallelAtInverter = inverterMpptCounts.length ? Math.max(...inverterMpptCounts) : 1;
    const dcIsolationDesignCurrentA = maxParallelAtInverter * module.iscA * inputs.designCurrentFactorDc;
    const dcIsolatorA = nextStandardValue(protectionRatings, dcIsolationDesignCurrentA * Number(inputs.ruleContext?.dcIsolatorDesignMultiplier || 1));
    const dcIsolationVoltageV = Math.min(Number(inverter.maxInputVoltageV) || Infinity, Number(module.maxSystemVoltageV) || Infinity);
    rows.push({
      circuit: `Inverter ${instance.number} DC isolation / SPD`, qty: 1, designCurrentA: dcIsolationDesignCurrentA, oneWayLengthM: 0,
      cableSizeMm2: null, voltageV: Number.isFinite(dcIsolationVoltageV) ? dcIsolationVoltageV : 0, dropPct: 0,
      protection: dcIsolatorA ? `${dcIsolatorA} A DC isolator at ≥ ${Number.isFinite(dcIsolationVoltageV) ? dcIsolationVoltageV.toFixed(0) : "system"} VDC + ${inputs.ruleContext?.spdDc || "Type 2 DC SPD preliminary"}` : "No valid DC isolator rating",
      capacityA: 0, status: dcIsolatorA ? "pass" : "fail", category: "protection"
    });

    const peSize = suggestedProtectiveEarthSizeMm2(cable.sizeMm2, inputs.ruleContext);
    rows.push({
      circuit: `Inverter ${instance.number} protective earth`, qty: 1, designCurrentA: 0, oneWayLengthM: inputs.acFeederOneWayLengthM,
      cableSizeMm2: peSize, voltageV: 0, dropPct: 0,
      protection: "PE/bonding conductor preliminary section; final fault/adiabatic and earthing-system checks required",
      capacityA: 0, status: peSize ? "pass" : "fail", category: "earthing"
    });
  });

  const dcRows = rows.filter(row => row.category.startsWith("dc"));
  const acRows = rows.filter(row => row.category === "ac-feeder");
  const maxDcDropPct = dcRows.length ? Math.max(...dcRows.map(row => row.dropPct)) : 0;
  const maxAcDropPct = acRows.length ? Math.max(...acRows.map(row => row.dropPct)) : 0;
  const dcSizes = [...new Set(rows.filter(row => row.category === "dc-string" && row.cableSizeMm2).map(row => row.cableSizeMm2))].sort((a, b) => a - b);
  const acSizes = [...new Set(acRows.filter(row => row.cableSizeMm2).map(row => row.cableSizeMm2))].sort((a, b) => a - b);
  const dcLossPct = electrical.totalDcKW > 0 ? totalDcLossW / (electrical.totalDcKW * 1000) * 100 : 0;
  // Use the same power basis as the feeder current calculation. Using nominal
  // rated AC power here while sizing current from max active power inflates the
  // reported percentage whenever maxActivePowerKW > acPowerKW.
  const acLossPct = totalAcSizingPowerKW > 0 ? totalAcLossW / (totalAcSizingPowerKW * 1000) * 100 : 0;
  if (dcLossPct > 3) warnings.push(`Estimated rated-power DC cable loss is ${dcLossPct.toFixed(2)}%; review routing/length assumptions.`);
  if (acLossPct > 3) warnings.push(`Estimated rated-power AC cable loss is ${acLossPct.toFixed(2)}%; review feeder assumptions.`);
  warnings.push(`Active engineering rules: ${inputs.ruleContext?.packId || "legacy"}@${inputs.ruleContext?.packVersion || "compat"} (${inputs.ruleContext?.fingerprint || "no fingerprint"}). Full fault-current, breaking-capacity, disconnection-time, equipment coordination and jurisdictional compliance remain outside this preliminary layer.`);

  const rowFailures = rows.filter(row => row.status === "fail").length;
  if (rowFailures) errors.push(`${rowFailures} detailed electrical circuit row(s) fail the configured preliminary rules.`);
  const status = errors.length ? "fail" : warnings.length ? "warning" : "pass";
  const label = status === "fail" ? "FAIL" : status === "warning" ? "PASS WITH WARNINGS" : "PASS";
  return {
    status, label,
    message: errors.length ? errors.join(" ") : `${rows.length} circuit row(s) sized for conductor section, voltage drop, and preliminary protection coordination.`,
    inputs, rows, errors, warnings, totalDcLossW, totalAcLossW, totalAcSizingPowerKW, dcLossPct, acLossPct,
    maxDcDropPct, maxAcDropPct, dcSizes, acSizes, largestBreakerA, suggestedPeSize,
    conductorMaterial: inputs.conductorMaterial,
    ruleContext: inputs.ruleContext,
    ruleProvenance: inputs.ruleContext ? { packId: inputs.ruleContext.packId, packVersion: inputs.ruleContext.packVersion, fingerprint: inputs.ruleContext.fingerprint, jurisdiction: inputs.ruleContext.jurisdiction, standardReference: inputs.ruleContext.standardReference } : null,
    module, inverter, electrical
  };
}

globalThis.SolarPVElectricalEngineModule = Object.freeze({version:"2.1.0",deterministic:true,functions:Object.freeze(["getElectricalDesignInputs", "panelElectricalGroupKey", "getSortedPanelsForElectricalGroup", "balancedStringLengths", "chooseStringPartition", "calculateElectricalDesign", "clearPanelElectricalAssignments", "applyPanelElectricalAssignments", "nextStandardValue", "getDetailedElectricalInputs", "conductorResistanceOhm", "chooseDcCableSize", "chooseAcCableSize", "suggestedProtectiveEarthSizeMm2", "calculateDetailedElectricalDesign"])});
