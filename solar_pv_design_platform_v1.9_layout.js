"use strict";

/* Solar PV Design Platform v1.9 - PV layout engine
   Retained from the verified v1.7 deterministic engine and carried forward in the cumulative v1.9 architecture. */

function getLayoutOrigin(latLngPoints) {
  let lat = 0;
  let lng = 0;
  latLngPoints.forEach(point => {
    lat += point.lat;
    lng += point.lng;
  });
  return {
    lat: lat / latLngPoints.length,
    lng: lng / latLngPoints.length
  };
}

function latLngToLocalMeters(point, origin) {
  const lat0 = origin.lat * Math.PI / 180;
  const dLat = (point.lat - origin.lat) * Math.PI / 180;
  const dLng = (point.lng - origin.lng) * Math.PI / 180;
  return {
    x: EARTH_RADIUS_M * dLng * Math.cos(lat0),
    y: EARTH_RADIUS_M * dLat
  };
}

function localMetersToLatLng(point, origin) {
  const lat0 = origin.lat * Math.PI / 180;
  return L.latLng(
    origin.lat + (point.y / EARTH_RADIUS_M) * 180 / Math.PI,
    origin.lng + (point.x / (EARTH_RADIUS_M * Math.cos(lat0))) * 180 / Math.PI
  );
}

function createLayoutBasis(azimuthDegrees) {
  const radians = azimuthDegrees * Math.PI / 180;
  const sinA = Math.sin(radians);
  const cosA = Math.cos(radians);

  return {
    // v follows module long axis, clockwise from north.
    u: { x: cosA, y: -sinA },
    v: { x: sinA, y: cosA }
  };
}

function localToGrid(point, basis) {
  return {
    u: point.x * basis.u.x + point.y * basis.u.y,
    v: point.x * basis.v.x + point.y * basis.v.y
  };
}

function gridToLocal(u, v, basis) {
  return {
    x: u * basis.u.x + v * basis.v.x,
    y: u * basis.u.y + v * basis.v.y
  };
}

function createPanelRectangle(centerU, centerV, width, length, basis) {
  const halfW = width / 2;
  const halfL = length / 2;

  return [
    gridToLocal(centerU - halfW, centerV - halfL, basis),
    gridToLocal(centerU + halfW, centerV - halfL, basis),
    gridToLocal(centerU + halfW, centerV + halfL, basis),
    gridToLocal(centerU - halfW, centerV + halfL, basis)
  ];
}

function panelFitsSite(panelPolygon, sitePolygon, exclusionPolygons, edgeSetback, obstacleClearance) {
  if (!panelPolygon.every(point => pointInsidePolygonXY(point, sitePolygon))) return false;

  // A zero-setback panel may touch the design-surface boundary. Proper crossings
  // still catch a rectangle that cuts across the outside of a concave polygon.
  if (polygonEdgesProperlyIntersect(panelPolygon, sitePolygon)) return false;

  if (edgeSetback > 0 && polygonMinimumDistance(panelPolygon, sitePolygon) + 1e-6 < edgeSetback) {
    return false;
  }

  for (const exclusionPolygon of exclusionPolygons) {
    // Boundary contact is allowed only when obstacle clearance is exactly zero.
    if (polygonsInteriorOverlap(panelPolygon, exclusionPolygon)) return false;
    if (
      obstacleClearance > 0 &&
      polygonMinimumDistance(panelPolygon, exclusionPolygon) + 1e-6 < obstacleClearance
    ) {
      return false;
    }
  }

  return true;
}

function normalizeLayoutAxisAzimuth(value) {
  const normalized = normalizeAzimuth(value);
  return normalized >= 180 ? normalized - 180 : normalized;
}

function layoutAxisDifference(a, b) {
  const aa = normalizeLayoutAxisAzimuth(a);
  const bb = normalizeLayoutAxisAzimuth(b);
  const raw = Math.abs(aa - bb);
  return Math.min(raw, 180 - raw);
}

function layoutAzimuthFromVector(dx, dy) {
  return normalizeLayoutAxisAzimuth(Math.atan2(dx, dy) * 180 / Math.PI);
}

function uniqueLayoutAzimuths(values, tolerance = 0.05) {
  const unique = [];
  values.forEach(value => {
    const candidate = normalizeLayoutAxisAzimuth(value);
    if (!unique.some(existing => layoutAxisDifference(existing, candidate) <= tolerance)) unique.push(candidate);
  });
  return unique;
}

function getMajorRoofEdgeAzimuths(face, origin, maxCount) {
  const limit = Math.max(0, Math.floor(Number(maxCount) || 0));
  if (limit === 0) return [];
  const points = getPolygonPoints(face).map(point => latLngToLocalMeters(point, origin));
  const edges = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.05) continue;
    edges.push({ azimuth: layoutAzimuthFromVector(dx, dy), length });
  }
  edges.sort((a, b) => b.length - a.length);
  const chosen = [];
  for (const edge of edges) {
    if (chosen.some(item => layoutAxisDifference(item.azimuth, edge.azimuth) < 1.0)) continue;
    chosen.push(edge);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function getGridPhaseFractions(sampleCount) {
  const count = Math.max(1, Math.floor(Number(sampleCount) || 1));
  return Array.from({ length: count }, (_, index) => index / count);
}

function getOrientationCandidates(settings) {
  if (settings.orientationSearchMode !== "both") return [settings.orientation];
  return settings.orientation === "Portrait" ? ["Portrait", "Landscape"] : ["Landscape", "Portrait"];
}

function getAzimuthCandidates(face, origin, settings) {
  if (settings.layoutSearchMode === "fixed") return [normalizeLayoutAxisAzimuth(settings.azimuth)];

  const values = [settings.azimuth];
  const range = Math.max(0, Number(settings.rotationSearchRange) || 0);
  const step = Math.max(1, Number(settings.rotationSearchStep) || 1);
  for (let delta = step; delta <= range + 1e-9; delta += step) {
    values.push(settings.azimuth + delta, settings.azimuth - delta);
  }

  const edgeCount = Math.max(0, Math.floor(Number(settings.edgeAlignmentCount) || 0));
  const majorEdges = getMajorRoofEdgeAzimuths(face, origin, edgeCount);
  majorEdges.forEach(edge => {
    values.push(edge.azimuth);
    values.push(edge.azimuth + 90);
  });

  return uniqueLayoutAzimuths(values);
}

function countGridRuns(cells, primaryKey, secondaryKey) {
  const groups = new Map();
  cells.forEach(cell => {
    const primary = cell[primaryKey];
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary).push(cell[secondaryKey]);
  });
  let runs = 0;
  groups.forEach(values => {
    values.sort((a, b) => a - b);
    let previous = null;
    values.forEach(value => {
      if (previous === null || value > previous + 1) runs += 1;
      previous = value;
    });
  });
  return runs;
}

function calculateCandidatePracticality(cells) {
  if (!cells.length) return { isolatedPanels: 0, rowRuns: 0, columnRuns: 0, fragmentation: 0 };
  const occupied = new Set(cells.map(cell => `${cell.uIndex}:${cell.vIndex}`));
  let isolatedPanels = 0;
  cells.forEach(cell => {
    const neighbors = [
      `${cell.uIndex - 1}:${cell.vIndex}`,
      `${cell.uIndex + 1}:${cell.vIndex}`,
      `${cell.uIndex}:${cell.vIndex - 1}`,
      `${cell.uIndex}:${cell.vIndex + 1}`
    ];
    if (!neighbors.some(key => occupied.has(key))) isolatedPanels += 1;
  });
  const rowRuns = countGridRuns(cells, "vIndex", "uIndex");
  const columnRuns = countGridRuns(cells, "uIndex", "vIndex");
  return {
    isolatedPanels,
    rowRuns,
    columnRuns,
    fragmentation: rowRuns + columnRuns
  };
}

function isBetterLayoutCandidate(candidate, best, preferredOrientation) {
  if (!best) return true;
  if (candidate.panelCount !== best.panelCount) return candidate.panelCount > best.panelCount;
  if (candidate.practicality.isolatedPanels !== best.practicality.isolatedPanels) {
    return candidate.practicality.isolatedPanels < best.practicality.isolatedPanels;
  }
  if (candidate.practicality.fragmentation !== best.practicality.fragmentation) {
    return candidate.practicality.fragmentation < best.practicality.fragmentation;
  }
  if (Math.abs(candidate.edgeAlignmentPenalty - best.edgeAlignmentPenalty) > 1e-9) {
    return candidate.edgeAlignmentPenalty < best.edgeAlignmentPenalty;
  }
  const candidatePreferred = candidate.orientation === preferredOrientation ? 0 : 1;
  const bestPreferred = best.orientation === preferredOrientation ? 0 : 1;
  if (candidatePreferred !== bestPreferred) return candidatePreferred < bestPreferred;
  if (Math.abs(candidate.baseAzimuthPenalty - best.baseAzimuthPenalty) > 1e-9) {
    return candidate.baseAzimuthPenalty < best.baseAzimuthPenalty;
  }
  if (Math.abs(candidate.azimuth - best.azimuth) > 1e-9) return candidate.azimuth < best.azimuth;
  if (Math.abs(candidate.phaseU - best.phaseU) > 1e-9) return candidate.phaseU < best.phaseU;
  return candidate.phaseV < best.phaseV;
}

function evaluateLayoutPhase({
  faceName, facePolygon, exclusionPolygons, buildableFeature, origin, basis, panelWidth, panelLength,
  stepU, stepV, minU, maxU, minV, maxV, phaseU, phaseV,
  edgeSetback, obstacleClearance, searchState
}) {
  const cells = [];
  let uIndex = 0;
  for (let centerU = minU + panelWidth / 2 + phaseU; centerU <= maxU - panelWidth / 2 + GEOMETRY_EPSILON; centerU += stepU, uIndex += 1) {
    let vIndex = 0;
    for (let centerV = minV + panelLength / 2 + phaseV; centerV <= maxV - panelLength / 2 + GEOMETRY_EPSILON; centerV += stepV, vIndex += 1) {
      searchState.candidateChecks += 1;
      searchState.faceChecks += 1;
      if (searchState.candidateChecks > MAX_LAYOUT_CANDIDATES_PER_PHASE) {
        throw new Error(`${faceName} creates too many module candidates in one grid phase. Reduce that face, increase spacing, or split it into smaller design faces.`);
      }
      if (searchState.faceChecks > MAX_LAYOUT_SEARCH_CHECKS_PER_FACE) {
        throw new Error(`${faceName} exceeded the installation packing search limit. Reduce rotation/anchor search depth, increase spacing, or split the roof into smaller faces.`);
      }
      const rectangle = createPanelRectangle(centerU, centerV, panelWidth, panelLength, basis);
      const fits = buildableFeature && window.turf
        ? panelFitsBuildableGeometry(rectangle, origin, buildableFeature)
        : panelFitsSite(rectangle, facePolygon, exclusionPolygons, edgeSetback, obstacleClearance);
      if (fits) cells.push({ polygon: rectangle, uIndex, vIndex });
    }
  }
  return cells;
}

function buildCandidateLayoutForFace(face, settings) {
  const faceLatLngs = getPolygonPoints(face);
  const origin = getLayoutOrigin(faceLatLngs);
  const facePolygon = faceLatLngs.map(point => latLngToLocalMeters(point, origin));
  const exclusionPolygons = exclusionLayers
    .filter(layer => layer.roofFaceId === face.roofFaceId)
    .map(layer => getPolygonPoints(layer).map(point => latLngToLocalMeters(point, origin)));
  const buildableRecord = getBuildableGeometryRecord(face.roofFaceId) || calculateBuildableGeometryForFace(face);
  const buildableFeature = buildableRecord?.feature || null;

  const phaseFractions = getGridPhaseFractions(settings.gridAnchorSamples);
  const orientationCandidates = getOrientationCandidates(settings);
  const azimuthCandidates = getAzimuthCandidates(face, origin, settings);
  const majorEdges = getMajorRoofEdgeAzimuths(face, origin, settings.edgeAlignmentCount);
  const searchState = { faceChecks: 0, candidateChecks: 0 };
  let candidatesTested = 0;
  let best = null;

  for (const orientation of orientationCandidates) {
    const panelWidth = orientation === "Landscape" ? settings.moduleHeight : settings.moduleWidth;
    const panelLength = orientation === "Landscape" ? settings.moduleWidth : settings.moduleHeight;
    const baseStepU = panelWidth + settings.gap;
    const stepU = getInstallationType() === "Ground-Mounted Solar"
      ? Math.max(baseStepU, Number(settings.groundRowPitch) || Number(document.getElementById("groundRowPitch")?.value) || baseStepU)
      : baseStepU;
    const stepV = panelLength + settings.gap;

    for (const azimuth of azimuthCandidates) {
      const basis = createLayoutBasis(azimuth);
      const faceGrid = facePolygon.map(point => localToGrid(point, basis));
      const minU = Math.min(...faceGrid.map(point => point.u));
      const maxU = Math.max(...faceGrid.map(point => point.u));
      const minV = Math.min(...faceGrid.map(point => point.v));
      const maxV = Math.max(...faceGrid.map(point => point.v));
      const edgeAlignmentPenalty = majorEdges.length
        ? Math.min(...majorEdges.map(edge => Math.min(layoutAxisDifference(azimuth, edge.azimuth), layoutAxisDifference(azimuth, edge.azimuth + 90))))
        : layoutAxisDifference(azimuth, settings.azimuth);

      for (const phaseUFraction of phaseFractions) {
        for (const phaseVFraction of phaseFractions) {
          searchState.candidateChecks = 0;
          const phaseU = phaseUFraction * stepU;
          const phaseV = phaseVFraction * stepV;
          const cells = evaluateLayoutPhase({
            faceName: face.roofFaceName,
            facePolygon,
            exclusionPolygons,
            buildableFeature,
            origin,
            basis,
            panelWidth,
            panelLength,
            stepU,
            stepV,
            minU,
            maxU,
            minV,
            maxV,
            phaseU,
            phaseV,
            edgeSetback: buildableFeature ? 0 : settings.edgeSetback,
            obstacleClearance: buildableFeature ? 0 : settings.obstacleClearance,
            searchState
          });
          candidatesTested += 1;
          const candidate = {
            orientation,
            azimuth: normalizeLayoutAxisAzimuth(azimuth),
            phaseU,
            phaseV,
            panelWidth,
            panelLength,
            cells,
            panelCount: cells.length,
            practicality: calculateCandidatePracticality(cells),
            edgeAlignmentPenalty,
            baseAzimuthPenalty: layoutAxisDifference(azimuth, settings.azimuth)
          };
          if (isBetterLayoutCandidate(candidate, best, settings.orientation)) best = candidate;
        }
      }
    }
  }

  const chosen = best || {
    orientation: settings.orientation,
    azimuth: normalizeLayoutAxisAzimuth(settings.azimuth),
    panelWidth: settings.orientation === "Landscape" ? settings.moduleHeight : settings.moduleWidth,
    panelLength: settings.orientation === "Landscape" ? settings.moduleWidth : settings.moduleHeight,
    cells: [], panelCount: 0,
    practicality: { isolatedPanels: 0, rowRuns: 0, columnRuns: 0, fragmentation: 0 },
    edgeAlignmentPenalty: 0,
    baseAzimuthPenalty: 0
  };

  return {
    roofFaceId: face.roofFaceId,
    roofFaceName: face.roofFaceName,
    subArrayId: face.subArrayId || `${getInstallationProfile(face.surfaceKind || getInstallationType()).subArrayPrefix}-${String(face.roofFaceId || "RF").replace(/^RF-/, "")}`,
    roofTilt: Number(face.roofTilt),
    roofAzimuth: normalizeAzimuth(face.roofAzimuth),
    surfaceKind: face.surfaceKind || getInstallationType(),
    buildableArea: buildableRecord?.buildableArea || 0,
    origin,
    panelWidth: chosen.panelWidth,
    panelLength: chosen.panelLength,
    orientation: chosen.orientation,
    layoutAzimuth: chosen.azimuth,
    polygons: chosen.cells.map(cell => cell.polygon),
    searchStats: {
      candidatesTested,
      pointChecks: searchState.faceChecks,
      orientationCandidates: orientationCandidates.length,
      azimuthCandidates: azimuthCandidates.length,
      anchorSamples: phaseFractions.length,
      isolatedPanels: chosen.practicality.isolatedPanels,
      rowRuns: chosen.practicality.rowRuns,
      columnRuns: chosen.practicality.columnRuns,
      edgeAlignmentPenalty: chosen.edgeAlignmentPenalty
    }
  };
}

function buildCandidateLayout(settings) {
  const faceLayouts = roofFaces.map(face => buildCandidateLayoutForFace(face, settings));
  const totalPanelCount = faceLayouts.reduce((sum, faceLayout) => sum + faceLayout.polygons.length, 0);
  if (totalPanelCount > MAX_RENDERED_PANELS) {
    throw new Error(`The combined ${getInstallationType().toLowerCase()} layout contains ${totalPanelCount.toLocaleString()} panels, which exceeds the ${MAX_RENDERED_PANELS.toLocaleString()}-panel rendering limit of this browser prototype.`);
  }
  return { faceLayouts, totalPanelCount };
}

globalThis.SolarPVLayoutEngineModule = Object.freeze({version:"1.9.0",deterministic:true,functions:Object.freeze(["getLayoutOrigin", "latLngToLocalMeters", "localMetersToLatLng", "createLayoutBasis", "localToGrid", "gridToLocal", "createPanelRectangle", "panelFitsSite", "normalizeLayoutAxisAzimuth", "layoutAxisDifference", "layoutAzimuthFromVector", "uniqueLayoutAzimuths", "getMajorRoofEdgeAzimuths", "getGridPhaseFractions", "getOrientationCandidates", "getAzimuthCandidates", "countGridRuns", "calculateCandidatePracticality", "isBetterLayoutCandidate", "evaluateLayoutPhase", "buildCandidateLayoutForFace", "buildCandidateLayout"])});
