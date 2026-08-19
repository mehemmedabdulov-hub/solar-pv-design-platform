"use strict";

/* Solar PV Design Platform v1.7 - geometry/buildable-area engine
   Extracted from the current Alpha5 deterministic engine without calculation rewrites. */

function getPolygonPoints(layer) {
  const allLatLngs = layer.getLatLngs();
  if (!allLatLngs || !allLatLngs.length) return [];
  return allLatLngs[0];
}

function getLayerArea(layer) {
  const points = getPolygonPoints(layer);
  if (!points.length) return 0;
  return Math.abs(L.GeometryUtil.geodesicArea(points));
}

function latLngAsXY(point) {
  return { x: point.lng, y: point.lat };
}

function pointOnSegment(point, a, b, epsilon = GEOMETRY_EPSILON) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < -epsilon) return false;
  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (dot - lenSq > epsilon) return false;
  return true;
}

function pointInsidePolygonXY(point, polygon) {
  if (!polygon.length) return false;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];

    if (pointOnSegment(point, a, b)) return true;

    const intersects =
      ((b.y > point.y) !== (a.y > point.y)) &&
      (point.x < ((a.x - b.x) * (point.y - b.y)) / ((a.y - b.y) || GEOMETRY_EPSILON) + b.x);

    if (intersects) inside = !inside;
  }

  return inside;
}

function orientationValue(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientationValue(a, b, c);
  const o2 = orientationValue(a, b, d);
  const o3 = orientationValue(c, d, a);
  const o4 = orientationValue(c, d, b);

  if (
    ((o1 > GEOMETRY_EPSILON && o2 < -GEOMETRY_EPSILON) || (o1 < -GEOMETRY_EPSILON && o2 > GEOMETRY_EPSILON)) &&
    ((o3 > GEOMETRY_EPSILON && o4 < -GEOMETRY_EPSILON) || (o3 < -GEOMETRY_EPSILON && o4 > GEOMETRY_EPSILON))
  ) {
    return true;
  }

  if (Math.abs(o1) <= GEOMETRY_EPSILON && pointOnSegment(c, a, b)) return true;
  if (Math.abs(o2) <= GEOMETRY_EPSILON && pointOnSegment(d, a, b)) return true;
  if (Math.abs(o3) <= GEOMETRY_EPSILON && pointOnSegment(a, c, d)) return true;
  if (Math.abs(o4) <= GEOMETRY_EPSILON && pointOnSegment(b, c, d)) return true;

  return false;
}

function polygonEdgesIntersect(polyA, polyB) {
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function polygonsIntersect(polyA, polyB) {
  if (polygonEdgesIntersect(polyA, polyB)) return true;
  if (polyA.length && pointInsidePolygonXY(polyA[0], polyB)) return true;
  if (polyB.length && pointInsidePolygonXY(polyB[0], polyA)) return true;
  return false;
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function polygonMinimumDistance(polyA, polyB) {
  // Distance between polygon boundaries. Containment alone does not mean zero
  // distance; only actual boundary intersection does.
  if (polygonEdgesIntersect(polyA, polyB)) return 0;
  let minimum = Infinity;

  for (const point of polyA) {
    for (let j = 0; j < polyB.length; j++) {
      minimum = Math.min(
        minimum,
        pointToSegmentDistance(point, polyB[j], polyB[(j + 1) % polyB.length])
      );
    }
  }

  for (const point of polyB) {
    for (let j = 0; j < polyA.length; j++) {
      minimum = Math.min(
        minimum,
        pointToSegmentDistance(point, polyA[j], polyA[(j + 1) % polyA.length])
      );
    }
  }

  return minimum;
}

function pointStrictlyInsidePolygonXY(point, polygon) {
  for (let i = 0; i < polygon.length; i++) {
    if (pointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length])) return false;
  }
  return pointInsidePolygonXY(point, polygon);
}

function segmentsProperlyIntersect(a, b, c, d) {
  const o1 = orientationValue(a, b, c);
  const o2 = orientationValue(a, b, d);
  const o3 = orientationValue(c, d, a);
  const o4 = orientationValue(c, d, b);
  const oppositeAB =
    (o1 > GEOMETRY_EPSILON && o2 < -GEOMETRY_EPSILON) ||
    (o1 < -GEOMETRY_EPSILON && o2 > GEOMETRY_EPSILON);
  const oppositeCD =
    (o3 > GEOMETRY_EPSILON && o4 < -GEOMETRY_EPSILON) ||
    (o3 < -GEOMETRY_EPSILON && o4 > GEOMETRY_EPSILON);
  return oppositeAB && oppositeCD;
}

function polygonEdgesProperlyIntersect(polyA, polyB) {
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function polygonScanlineIntervals(polygon, y) {
  const intersections = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if ((a.y > y) === (b.y > y)) continue;
    const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y);
    if (Number.isFinite(x)) intersections.push(x);
  }
  intersections.sort((a, b) => a - b);
  const intervals = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    if (intersections[i + 1] - intersections[i] > GEOMETRY_EPSILON * 10) {
      intervals.push([intersections[i], intersections[i + 1]]);
    }
  }
  return intervals;
}

function polygonInteriorsOverlapByScanline(polyA, polyB) {
  const yValues = [...new Set([...polyA, ...polyB].map(point => Number(point.y)).filter(Number.isFinite))].sort((a, b) => a - b);
  for (let i = 0; i < yValues.length - 1; i++) {
    if (yValues[i + 1] - yValues[i] <= GEOMETRY_EPSILON * 10) continue;
    const y = (yValues[i] + yValues[i + 1]) / 2;
    const intervalsA = polygonScanlineIntervals(polyA, y);
    const intervalsB = polygonScanlineIntervals(polyB, y);
    for (const [aLeft, aRight] of intervalsA) {
      for (const [bLeft, bRight] of intervalsB) {
        if (Math.min(aRight, bRight) - Math.max(aLeft, bLeft) > GEOMETRY_EPSILON * 10) return true;
      }
    }
  }
  return false;
}

function findPolygonInteriorPoint(polygon) {
  if (!polygon?.length || polygon.length < 3) return null;
  const yValues = [...new Set(polygon.map(point => Number(point.y)).filter(Number.isFinite))].sort((a, b) => a - b);
  const candidateYs = [];
  for (let i = 0; i < yValues.length - 1; i++) {
    if (yValues[i + 1] - yValues[i] > GEOMETRY_EPSILON * 10) {
      candidateYs.push((yValues[i] + yValues[i + 1]) / 2);
    }
  }

  for (const y of candidateYs) {
    const intersections = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if ((a.y > y) === (b.y > y)) continue;
      const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (Number.isFinite(x)) intersections.push(x);
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = intersections[i];
      const right = intersections[i + 1];
      if (right - left <= GEOMETRY_EPSILON * 10) continue;
      const candidate = { x: (left + right) / 2, y };
      if (pointStrictlyInsidePolygonXY(candidate, polygon)) return candidate;
    }
  }
  return null;
}

function polygonsInteriorOverlap(polyA, polyB) {
  if (!polyA.length || !polyB.length) return false;
  if (polygonEdgesProperlyIntersect(polyA, polyB)) return true;
  if (polyA.some(point => pointStrictlyInsidePolygonXY(point, polyB))) return true;
  if (polyB.some(point => pointStrictlyInsidePolygonXY(point, polyA))) return true;
  if (polygonInteriorsOverlapByScanline(polyA, polyB)) return true;

  // Equal or deeply nested concave polygons can have every vertex on a boundary
  // and an arithmetic centroid outside. A deterministic scanline witness avoids
  // false negatives without treating a shared boundary as an interior overlap.
  const interiorA = findPolygonInteriorPoint(polyA);
  if (interiorA && pointStrictlyInsidePolygonXY(interiorA, polyB)) return true;
  const interiorB = findPolygonInteriorPoint(polyB);
  if (interiorB && pointStrictlyInsidePolygonXY(interiorB, polyA)) return true;
  return false;
}

function closeCoordinateRing(coords) {
  if (!coords.length) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  return coords;
}

function leafletLayerToTurfPolygon(layer) {
  if (!window.turf || !layer) return null;
  const coords = closeCoordinateRing(getPolygonPoints(layer).map(point => [Number(point.lng), Number(point.lat)]));
  if (coords.length < 4) return null;
  return turf.polygon([coords]);
}

function exclusionClearanceDistance(layer, settings) {
  const type = String(layer?.exclusionType || "").trim().toLowerCase();
  if (["walkway", "restricted zone", "safety setback", "road", "service road", "drainage", "steep slope", "drive aisle", "pedestrian path", "no-canopy zone"].includes(type)) return 0;
  if (getInstallationType() === "Solar Carport" && type.includes("column")) {
    return Math.max(0, Number(document.getElementById("carportColumnClearance")?.value) || 0);
  }
  return settings.obstacleClearance;
}

function calculateBuildableGeometryForFace(face) {
  const settings = getBuildableGeometrySettings();
  const faceExclusions = exclusionLayers.filter(layer => layer.roofFaceId === face.roofFaceId);
  const grossArea = getLayerArea(face);
  const rawExcludedArea = faceExclusions.reduce((sum, layer) => sum + getLayerArea(layer), 0);
  const fallbackArea = Math.max(grossArea - rawExcludedArea, 0);
  const base = {
    roofFaceId: face.roofFaceId,
    subArrayId: face.subArrayId || `${getInstallationProfile(face.surfaceKind || getInstallationType()).subArrayPrefix}-${String(face.roofFaceId).replace(/^RF-/, "")}`,
    grossArea,
    rawExcludedArea,
    settings,
    exclusionCount: faceExclusions.length,
    feature: null,
    buildableArea: fallbackArea,
    nonBuildableArea: Math.max(grossArea - fallbackArea, 0),
    fallback: false,
    error: null
  };

  if (!window.turf || typeof turf.buffer !== "function" || typeof turf.difference !== "function" || typeof turf.area !== "function") {
    return { ...base, fallback: true, error: "Turf.js GIS engine is unavailable; scalar/distance fallback is active." };
  }

  try {
    let buildable = leafletLayerToTurfPolygon(face);
    if (!buildable) throw new Error("Roof face could not be converted to a valid polygon.");

    if (settings.edgeSetback > 0) {
      buildable = turf.buffer(buildable, -settings.edgeSetback, { units: "meters", steps: 8 });
      if (!buildable) {
        return { ...base, feature: null, buildableArea: 0, nonBuildableArea: grossArea, error: "Perimeter setback removes the entire roof face." };
      }
    }

    for (const layer of faceExclusions) {
      let clip = leafletLayerToTurfPolygon(layer);
      if (!clip) continue;
      const clearance = exclusionClearanceDistance(layer, settings);
      if (clearance > 0) {
        clip = turf.buffer(clip, clearance, { units: "meters", steps: 8 });
        if (!clip) continue;
      }
      buildable = turf.difference(turf.featureCollection([buildable, clip]));
      if (!buildable) break;
    }

    const buildableArea = buildable ? Math.max(0, turf.area(buildable)) : 0;
    return {
      ...base,
      feature: buildable,
      buildableArea,
      nonBuildableArea: Math.max(grossArea - buildableArea, 0)
    };
  } catch (error) {
    return { ...base, fallback: true, error: `Exact buildable geometry failed: ${error.message}` };
  }
}

function rebuildBuildableGeometry({ render = true } = {}) {
  if (render) buildableLayerGroup.clearLayers();
  buildableGeometryByFace = new Map();
  roofFaces.forEach(face => {
    const record = calculateBuildableGeometryForFace(face);
    buildableGeometryByFace.set(face.roofFaceId, record);
    if (render && record.feature) {
      const layer = L.geoJSON(record.feature, {
        style: { color: "#047857", fillColor: "#10b981", fillOpacity: 0.16, weight: 2, dashArray: "5,4" },
        interactive: true
      }).addTo(buildableLayerGroup);
      layer.bindPopup(
        `<strong>${escapeHtml(face.subArrayId || record.subArrayId)} · ${escapeHtml(face.roofFaceName)}</strong><br>` +
        `Exact buildable area: ${record.buildableArea.toFixed(1)} m²<br>` +
        `Non-buildable area: ${record.nonBuildableArea.toFixed(1)} m²`
      );
    }
  });
  return buildableGeometryByFace;
}

function getBuildableGeometryRecord(roofFaceId) {
  if (!buildableGeometryByFace.has(roofFaceId)) {
    const face = getRoofFaceById(roofFaceId);
    if (face) buildableGeometryByFace.set(roofFaceId, calculateBuildableGeometryForFace(face));
  }
  return buildableGeometryByFace.get(roofFaceId) || null;
}

function localPolygonToTurfFeature(localPolygon, origin) {
  if (!window.turf || !localPolygon?.length || !origin) return null;
  const coords = closeCoordinateRing(localPolygon.map(point => {
    const latlng = localMetersToLatLng(point, origin);
    return [Number(latlng.lng), Number(latlng.lat)];
  }));
  return coords.length >= 4 ? turf.polygon([coords]) : null;
}

function panelFitsBuildableGeometry(panelPolygon, origin, buildableFeature) {
  if (!window.turf || !buildableFeature) return false;
  try {
    const panelFeature = localPolygonToTurfFeature(panelPolygon, origin);
    if (!panelFeature) return false;
    const outside = turf.difference(turf.featureCollection([panelFeature, buildableFeature]));
    if (!outside) return true;
    const outsideArea = turf.area(outside);
    const panelArea = Math.max(turf.area(panelFeature), 1e-9);
    return outsideArea <= Math.max(0.0005, panelArea * 1e-6);
  } catch (error) {
    return false;
  }
}

globalThis.SolarPVGeometryEngineModule = Object.freeze({version:"1.7.0",deterministic:true,functions:Object.freeze(["getPolygonPoints", "getLayerArea", "latLngAsXY", "pointOnSegment", "pointInsidePolygonXY", "orientationValue", "segmentsIntersect", "polygonEdgesIntersect", "polygonsIntersect", "pointToSegmentDistance", "polygonMinimumDistance", "pointStrictlyInsidePolygonXY", "segmentsProperlyIntersect", "polygonEdgesProperlyIntersect", "polygonScanlineIntervals", "polygonInteriorsOverlapByScanline", "findPolygonInteriorPoint", "polygonsInteriorOverlap", "closeCoordinateRing", "leafletLayerToTurfPolygon", "exclusionClearanceDistance", "calculateBuildableGeometryForFace", "rebuildBuildableGeometry", "getBuildableGeometryRecord", "localPolygonToTurfFeature", "panelFitsBuildableGeometry"])});
