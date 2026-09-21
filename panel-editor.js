(function (global) {
  "use strict";

  class CommandStack {
    constructor(limit = 80) {
      this.limit = Math.max(1, Number(limit) || 80);
      this.undoStack = [];
      this.redoStack = [];
      this.listeners = new Set();
    }
    record(command) {
      if (!command || typeof command.undo !== "function" || typeof command.redo !== "function") throw new Error("Command must provide undo() and redo().");
      this.undoStack.push(command);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
      this.emit();
      return command;
    }
    undo() {
      const command = this.undoStack.pop();
      if (!command) return false;
      command.undo();
      this.redoStack.push(command);
      this.emit();
      return true;
    }
    redo() {
      const command = this.redoStack.pop();
      if (!command) return false;
      command.redo();
      this.undoStack.push(command);
      this.emit();
      return true;
    }
    clear() { this.undoStack = []; this.redoStack = []; this.emit(); }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    peekUndo() { return this.undoStack[this.undoStack.length - 1] || null; }
    peekRedo() { return this.redoStack[this.redoStack.length - 1] || null; }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit() { this.listeners.forEach(listener => listener(this)); }
  }

  const history = new CommandStack(100);
  const selection = new Set();
  let workspace = null;
  let tools = null;
  let toolbar = null;
  let inspector = null;
  let statebar = null;
  let canvasHost = null;
  let currentTool = "select";
  let selectionBox = null;
  let selectionBoxStart = null;
  let measurePoints = [];
  let measureLayer = null;
  let measureLabel = null;
  let initialized = false;
  let dragBeforeSnapshot = null;
  let dragStartPolygons = null;
  let dragStartHandle = null;
  let dragValidation = { valid: true, reason: "" };

  const VALID_PREVIEW_STYLE = { color: "#047857", fillColor: "#34d399", fillOpacity: 0.62, weight: 3, dashArray: "5 4" };
  const INVALID_PREVIEW_STYLE = { color: "#b42318", fillColor: "#fb7185", fillOpacity: 0.62, weight: 3, dashArray: "5 4" };

  function safely(fn, fallback = null) { try { return fn(); } catch (_) { return fallback; } }
  function byId(id) { return typeof document === "undefined" ? null : document.getElementById(id); }
  function eventModifier(event) { return !!(event?.ctrlKey || event?.metaKey || event?.shiftKey); }
  function isTyping() { return ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName || ""); }
  function selectedArray() { return [...selection].filter(layer => safely(() => placedPanels.includes(layer), false)); }
  function primary() { return selectedArray()[0] || null; }
  function sameSurface(items = selectedArray()) { return items.length > 0 && items.every(layer => layer.panelRoofFaceId === items[0].panelRoofFaceId); }
  function panelUid(layer) { return Number(layer?.panelUid || 0); }

  function cloneLatLngs(layer) {
    return safely(() => getPolygonPoints(layer).map(point => ({ lat: Number(point.lat), lng: Number(point.lng) })), []);
  }

  function captureLayoutSnapshot(label = "Layout snapshot") {
    const panels = safely(() => placedPanels.map(layer => ({
      layer,
      uid: panelUid(layer),
      latLngs: cloneLatLngs(layer),
      panelAzimuth: Number(layer.panelAzimuth),
      panelWidth: Number(layer.panelWidth),
      panelLength: Number(layer.panelLength),
      panelOrientation: layer.panelOrientation,
      panelSource: layer.panelSource,
      panelRoofFaceId: layer.panelRoofFaceId,
      panelRoofFaceName: layer.panelRoofFaceName,
      panelSubArrayId: layer.panelSubArrayId,
      panelSurfaceTilt: layer.panelSurfaceTilt,
      panelSurfaceAzimuth: layer.panelSurfaceAzimuth,
      panelSurfaceKind: layer.panelSurfaceKind,
      stringId: layer.stringId || null,
      inverterNumber: layer.inverterNumber ?? null,
      mpptNumber: layer.mpptNumber ?? null,
      inputNumber: layer.inputNumber ?? null,
      panelLocked: !!layer.panelLocked
    })), []);
    return { label, panels, selectedUids: selectedArray().map(panelUid), manualLayoutEdited: safely(() => !!manualLayoutEdited, false) };
  }

  function restoreLayoutSnapshot(snapshot, { geometry = true } = {}) {
    if (!snapshot) return;
    clearSelection({ keepHandle: false, silent: true });
    safely(() => {
      placedPanels.slice().forEach(layer => { if (panelLayerGroup.hasLayer(layer)) panelLayerGroup.removeLayer(layer); });
      placedPanels = snapshot.panels.map(item => item.layer);
      snapshot.panels.forEach(item => {
        const layer = item.layer;
        layer.setLatLngs(item.latLngs.map(point => L.latLng(point.lat, point.lng)));
        layer.panelAzimuth = item.panelAzimuth;
        layer.panelWidth = item.panelWidth;
        layer.panelLength = item.panelLength;
        layer.panelOrientation = item.panelOrientation;
        layer.panelSource = item.panelSource;
        layer.panelRoofFaceId = item.panelRoofFaceId;
        layer.panelRoofFaceName = item.panelRoofFaceName;
        layer.panelSubArrayId = item.panelSubArrayId;
        layer.panelSurfaceTilt = item.panelSurfaceTilt;
        layer.panelSurfaceAzimuth = item.panelSurfaceAzimuth;
        layer.panelSurfaceKind = item.panelSurfaceKind;
        layer.stringId = item.stringId;
        layer.inverterNumber = item.inverterNumber;
        layer.mpptNumber = item.mpptNumber;
        layer.inputNumber = item.inputNumber;
        layer.panelLocked = item.panelLocked;
        layer.setStyle(PANEL_NORMAL_STYLE);
        if (!panelLayerGroup.hasLayer(layer)) panelLayerGroup.addLayer(layer);
      });
      manualLayoutEdited = snapshot.manualLayoutEdited;
      renumberPanels();
      snapshot.selectedUids.forEach(uid => {
        const layer = placedPanels.find(item => panelUid(item) === uid);
        if (layer) selection.add(layer);
      });
      syncSelectedPanelBinding();
      syncStyles();
      createGroupMoveHandle();
      if (geometry) markGeometryChanged(`Undo/redo restored ${snapshot.label.toLowerCase()}.`, { toast: false });
      else syncUi();
    });
  }

  function recordSnapshots(label, before, after, options = {}) {
    const geometry = options.geometry !== false;
    history.record({
      label,
      undo: () => restoreLayoutSnapshot(before, { geometry }),
      redo: () => restoreLayoutSnapshot(after, { geometry })
    });
  }

  function syncSelectedPanelBinding() {
    const first = primary();
    safely(() => { selectedPanel = first || null; });
  }

  function syncStyles() {
    safely(() => placedPanels.forEach(layer => {
      if (selection.has(layer)) layer.setStyle(PANEL_SELECTED_STYLE);
      else layer.setStyle(PANEL_NORMAL_STYLE);
    }));
  }

  function clearSelection({ keepHandle = false, silent = false } = {}) {
    selection.clear();
    safely(() => { selectedPanel = null; });
    if (!keepHandle) safely(() => removePanelMoveHandle());
    syncStyles();
    if (!silent) syncUi();
  }

  function handleSelect(layer, interactionEvent = null) {
    if (!safely(() => layoutIsCurrent && placedPanels.includes(layer), false)) return false;
    if (safely(() => panelAddMode, false)) safely(() => setPanelAddMode(false));
    const extend = eventModifier(interactionEvent?.originalEvent || interactionEvent);
    if (!extend) selection.clear();
    if (extend && selection.has(layer)) selection.delete(layer); else selection.add(layer);
    syncSelectedPanelBinding();
    syncStyles();
    selectedArray().forEach(item => item.bringToFront?.());
    createGroupMoveHandle();
    syncUi();
    return true;
  }

  function setSelection(items) {
    selection.clear();
    (items || []).forEach(layer => { if (safely(() => placedPanels.includes(layer), false)) selection.add(layer); });
    syncSelectedPanelBinding();
    syncStyles();
    createGroupMoveHandle();
    syncUi();
  }

  function validateCandidateSet(candidates, ignored = new Set(selectedArray())) {
    for (const candidate of candidates) {
      const result = safely(() => validateManualPanelPolygon(candidate.polygon, candidate.layer.panelRoofFaceId, ignored), { valid: false, reason: "Geometry validator unavailable." });
      if (!result.valid) return result;
    }
    // Rigid moves preserve selected-panel spacing, while align/distribute can change it.
    // Reuse the same overlap and minimum-distance primitives/rule value for candidate-to-candidate checks.
    const gap = Number(safely(() => currentLayoutContext?.settings?.gap, 0) || 0);
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i], b = candidates[j];
        if (a.layer.panelRoofFaceId !== b.layer.panelRoofFaceId) continue;
        if (polygonsInteriorOverlap(a.polygon, b.polygon)) return { valid: false, reason: "The selected modules would overlap after this group transform." };
        if (gap > 0 && polygonMinimumDistance(a.polygon, b.polygon) + 1e-6 < gap) return { valid: false, reason: `The selected modules would violate the configured ${gap.toFixed(2)} m module gap.` };
      }
    }
    return { valid: true, reason: "" };
  }

  function selectedFaceContext() {
    const first = primary();
    return first ? safely(() => getFaceLayoutContext(first.panelRoofFaceId), null) : null;
  }

  function selectionCenterLatLng(items = selectedArray()) {
    if (!items.length) return null;
    const centers = items.map(item => safely(() => getPanelCenterLatLng(item), null)).filter(Boolean);
    if (!centers.length) return null;
    return L.latLng(centers.reduce((s,p) => s + p.lat, 0) / centers.length, centers.reduce((s,p) => s + p.lng, 0) / centers.length);
  }

  function createGroupMoveHandle() {
    safely(() => removePanelMoveHandle());
    const items = selectedArray();
    if (!items.length || !sameSurface(items)) return;
    const center = selectionCenterLatLng(items);
    if (!center) return;
    const icon = L.divIcon({ className: "", html: `<div class="panel-move-handle" title="Drag ${items.length === 1 ? "selected panel" : "selected panel group"}" aria-label="Move selected modules">↕</div>`, iconSize: [28,28], iconAnchor: [14,14] });
    panelMoveHandle = L.marker(center, { draggable: true, icon, keyboard: true, zIndexOffset: 1200 }).addTo(map);

    panelMoveHandle.on("dragstart", () => {
      const ctx = selectedFaceContext();
      if (!ctx) return;
      designInteractionActive = true;
      dragBeforeSnapshot = captureLayoutSnapshot("panel move");
      dragStartHandle = latLngToLocalMeters(center, ctx.origin);
      dragStartPolygons = new Map(items.map(layer => [layer, panelLayerToLocalPolygon(layer).map(p => ({ x: p.x, y: p.y }))]));
      dragValidation = { valid: true, reason: "" };
    });

    panelMoveHandle.on("drag", event => {
      const ctx = selectedFaceContext();
      if (!ctx || !dragStartHandle || !dragStartPolygons) return;
      const target = latLngToLocalMeters(event.target.getLatLng(), ctx.origin);
      const dx = target.x - dragStartHandle.x;
      const dy = target.y - dragStartHandle.y;
      const candidates = items.map(layer => ({ layer, polygon: (dragStartPolygons.get(layer) || []).map(p => ({ x: p.x + dx, y: p.y + dy })) }));
      dragValidation = validateCandidateSet(candidates);
      candidates.forEach(candidate => {
        candidate.layer.setLatLngs(localPanelPolygonToLatLngs(candidate.polygon, candidate.layer.panelRoofFaceId));
        candidate.layer.setStyle(dragValidation.valid ? VALID_PREVIEW_STYLE : INVALID_PREVIEW_STYLE);
      });
      setValidationState(dragValidation.valid, dragValidation.valid ? "Geometry valid — release to commit." : dragValidation.reason);
    });

    panelMoveHandle.on("dragend", () => {
      designInteractionActive = false;
      if (!dragBeforeSnapshot) return;
      if (!dragValidation.valid) {
        restoreLayoutSnapshot(dragBeforeSnapshot, { geometry: false });
        global.SolarPVNotifications?.toast?.(`${dragValidation.reason} Move cancelled.`, { type: "warning" });
        setValidationState(false, dragValidation.reason);
      } else {
        selectedArray().forEach(layer => { layer.panelSource = "edited"; layer.setStyle(PANEL_SELECTED_STYLE); });
        const after = captureLayoutSnapshot("panel move");
        recordSnapshots(`Move ${items.length} module${items.length === 1 ? "" : "s"}`, dragBeforeSnapshot, after);
        markGeometryChanged(`${items.length} module${items.length === 1 ? "" : "s"} moved; refresh electrical before export.`);
      }
      dragBeforeSnapshot = null;
      dragStartPolygons = null;
      dragStartHandle = null;
      createGroupMoveHandle();
      syncUi();
    });
  }

  function rotateSelectionTo(targetAzimuth) {
    const items = selectedArray();
    if (!items.length) return false;
    if (!sameSurface(items)) return failInline("Group rotation requires modules on one design surface.");
    const before = captureLayoutSnapshot("panel rotation");
    const ctx = selectedFaceContext();
    const centers = items.map(layer => ({ layer, center: latLngToLocalMeters(getPanelCenterLatLng(layer), ctx.origin) }));
    const groupCenter = { x: centers.reduce((s,r)=>s+r.center.x,0)/centers.length, y: centers.reduce((s,r)=>s+r.center.y,0)/centers.length };
    const base = Number(items[0].panelAzimuth || 0);
    const target = ((Number(targetAzimuth) % 360) + 360) % 360;
    const deltaDeg = ((target - base + 540) % 360) - 180;
    const radians = deltaDeg * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const candidates = items.map(layer => {
      const polygon = panelLayerToLocalPolygon(layer).map(p => {
        const dx = p.x - groupCenter.x, dy = p.y - groupCenter.y;
        return { x: groupCenter.x + dx * cos - dy * sin, y: groupCenter.y + dx * sin + dy * cos };
      });
      return { layer, polygon, azimuth: ((Number(layer.panelAzimuth || 0) + deltaDeg) % 360 + 360) % 360 };
    });
    const validation = validateCandidateSet(candidates);
    if (!validation.valid) {
      setValidationState(false, validation.reason);
      global.SolarPVNotifications?.toast?.(`${validation.reason} Rotation cancelled.`, { type: "warning" });
      return false;
    }
    candidates.forEach(candidate => {
      candidate.layer.setLatLngs(localPanelPolygonToLatLngs(candidate.polygon, candidate.layer.panelRoofFaceId));
      candidate.layer.panelAzimuth = candidate.azimuth;
      candidate.layer.panelSource = "edited";
    });
    const after = captureLayoutSnapshot("panel rotation");
    recordSnapshots(`Rotate ${items.length} module${items.length === 1 ? "" : "s"}`, before, after);
    markGeometryChanged(`${items.length} module${items.length === 1 ? "" : "s"} rotated; refresh electrical before export.`);
    createGroupMoveHandle();
    syncUi();
    return true;
  }

  function rotateSelectionBy(delta) {
    const first = primary();
    return first ? rotateSelectionTo(Number(first.panelAzimuth || 0) + Number(delta || 0)) : false;
  }

  function deleteSelection() {
    const items = selectedArray();
    if (!items.length) return failInline("Select one or more modules before deleting.");
    const before = captureLayoutSnapshot("panel delete");
    items.forEach(layer => { panelLayerGroup.removeLayer(layer); placedPanels = placedPanels.filter(item => item !== layer); });
    clearSelection({ silent: true });
    renumberPanels();
    manualLayoutEdited = true;
    const after = captureLayoutSnapshot("panel delete");
    recordSnapshots(`Delete ${items.length} module${items.length === 1 ? "" : "s"}`, before, after);
    markGeometryChanged(`${items.length} module${items.length === 1 ? "" : "s"} deleted; refresh electrical before export.`);
    syncUi();
    return true;
  }

  function addAtLatLng(latlng) {
    if (!safely(() => panelAddMode && currentLayoutContext, false)) return false;
    if (safely(() => placedPanels.length >= MAX_RENDERED_PANELS, true)) {
      failInline(`The browser editor is limited to ${safely(() => MAX_RENDERED_PANELS.toLocaleString(), "10,000")} rendered modules.`);
      safely(() => setPanelAddMode(false));
      return false;
    }
    const face = safely(() => findRoofFaceContainingLatLng(latlng), null);
    if (!face) return failInline("Choose a point inside a design surface.");
    const ctx = getFaceLayoutContext(face.roofFaceId);
    if (!ctx) return false;
    const candidate = buildPanelRectangleAtLatLng(latlng, ctx.panelWidth, ctx.panelLength, ctx.layoutAzimuth, face.roofFaceId);
    const validation = validateManualPanelPolygon(candidate, face.roofFaceId);
    if (!validation.valid) return failInline(validation.reason);
    const before = captureLayoutSnapshot("panel add");
    const layer = createPanelLayer(localPanelPolygonToLatLngs(candidate, face.roofFaceId), {
      azimuth: ctx.layoutAzimuth, panelWidth: ctx.panelWidth, panelLength: ctx.panelLength,
      orientation: ctx.orientation, source: "manual", roofFaceId: face.roofFaceId, roofFaceName: face.roofFaceName,
      subArrayId: face.subArrayId, surfaceTilt: face.roofTilt, surfaceAzimuth: face.roofAzimuth, surfaceKind: face.surfaceKind
    });
    renumberPanels();
    manualLayoutEdited = true;
    setSelection([layer]);
    const after = captureLayoutSnapshot("panel add");
    recordSnapshots("Add module", before, after);
    markGeometryChanged(`Panel added on ${face.roofFaceName}; refresh electrical before export.`);
    return true;
  }

  function addRow() {
    const ref = primary();
    if (!ref) return failInline("Select a reference module before adding a row.");
    if (!sameSurface()) return failInline("Add Row requires a selection on one design surface.");
    const ctx = selectedFaceContext();
    const center = latLngToLocalMeters(getPanelCenterLatLng(ref), ctx.origin);
    const basis = createLayoutBasis(ref.panelAzimuth);
    const grid = localToGrid(center, basis);
    const gap = Number(currentLayoutContext?.settings?.gap || 0);
    const stepU = Number(ref.panelWidth) + gap;
    const stepV = Number(ref.panelLength) + gap;
    const before = captureLayoutSnapshot("add row");
    const created = [];

    function trySide(sign) {
      const side = [];
      const v = grid.v + sign * stepV;
      // Scan a bounded row around the reference. Exact geometry validation decides every accepted slot.
      for (let n = -80; n <= 80; n += 1) {
        if (safely(() => placedPanels.length >= MAX_RENDERED_PANELS, false)) break;
        const localCenter = gridToLocal({ u: grid.u + n * stepU, v }, basis);
        const latlng = localMetersToLatLng(localCenter, ctx.origin);
        const polygon = buildPanelRectangleAtLatLng(latlng, ref.panelWidth, ref.panelLength, ref.panelAzimuth, ref.panelRoofFaceId);
        const validation = validateManualPanelPolygon(polygon, ref.panelRoofFaceId);
        if (!validation.valid) continue;
        const face = getRoofFaceById(ref.panelRoofFaceId);
        const layer = createPanelLayer(localPanelPolygonToLatLngs(polygon, ref.panelRoofFaceId), {
          azimuth: ref.panelAzimuth, panelWidth: ref.panelWidth, panelLength: ref.panelLength,
          orientation: ref.panelOrientation, source: "manual-row", roofFaceId: ref.panelRoofFaceId,
          roofFaceName: ref.panelRoofFaceName, subArrayId: ref.panelSubArrayId,
          surfaceTilt: ref.panelSurfaceTilt, surfaceAzimuth: ref.panelSurfaceAzimuth, surfaceKind: ref.panelSurfaceKind || face?.surfaceKind
        });
        side.push(layer);
      }
      return side;
    }

    let side = trySide(1);
    if (!side.length) side = trySide(-1);
    created.push(...side);
    if (!created.length) {
      restoreLayoutSnapshot(before, { geometry: false });
      return failInline("No valid row positions were found inside the exact buildable geometry.");
    }
    renumberPanels();
    manualLayoutEdited = true;
    setSelection(created);
    const after = captureLayoutSnapshot("add row");
    recordSnapshots(`Add row (${created.length} modules)`, before, after);
    markGeometryChanged(`${created.length} modules added as a validated row; refresh electrical before export.`);
    global.SolarPVNotifications?.toast?.(`Added ${created.length} validated module${created.length === 1 ? "" : "s"} in the new row.`, { type: "success" });
    return true;
  }

  function alignSelection() {
    const items = selectedArray();
    if (items.length < 2) return failInline("Select at least two modules to align.");
    if (!sameSurface(items)) return failInline("Align requires modules on one design surface.");
    const ctx = selectedFaceContext();
    const basis = createLayoutBasis(items[0].panelAzimuth);
    const rows = items.map(layer => ({ layer, center: localToGrid(latLngToLocalMeters(getPanelCenterLatLng(layer), ctx.origin), basis) }));
    const targetV = rows.reduce((sum,row)=>sum+row.center.v,0)/rows.length;
    const candidates = rows.map(row => {
      const local = gridToLocal({ u: row.center.u, v: targetV }, basis);
      const latlng = localMetersToLatLng(local, ctx.origin);
      return { layer: row.layer, polygon: buildPanelRectangleAtLatLng(latlng, row.layer.panelWidth, row.layer.panelLength, row.layer.panelAzimuth, row.layer.panelRoofFaceId) };
    });
    const validation = validateCandidateSet(candidates);
    if (!validation.valid) return failInline(validation.reason);
    const before = captureLayoutSnapshot("align modules");
    candidates.forEach(c => { c.layer.setLatLngs(localPanelPolygonToLatLngs(c.polygon, c.layer.panelRoofFaceId)); c.layer.panelSource = "edited"; });
    const after = captureLayoutSnapshot("align modules");
    recordSnapshots(`Align ${items.length} modules`, before, after);
    markGeometryChanged(`${items.length} modules aligned; refresh electrical before export.`);
    createGroupMoveHandle(); syncUi(); return true;
  }

  function distributeSelection() {
    const items = selectedArray();
    if (items.length < 3) return failInline("Select at least three modules to distribute.");
    if (!sameSurface(items)) return failInline("Distribute requires modules on one design surface.");
    const ctx = selectedFaceContext();
    const basis = createLayoutBasis(items[0].panelAzimuth);
    const rows = items.map(layer => ({ layer, center: localToGrid(latLngToLocalMeters(getPanelCenterLatLng(layer), ctx.origin), basis) })).sort((a,b)=>a.center.u-b.center.u);
    const gap = Number(currentLayoutContext?.settings?.gap || 0);
    const requiredStep = Math.max(...rows.map(row => Number(row.layer.panelWidth) + gap));
    const span = rows[rows.length-1].center.u - rows[0].center.u;
    const step = Math.max(requiredStep, span / (rows.length - 1));
    const mid = (rows[0].center.u + rows[rows.length-1].center.u) / 2;
    const firstU = mid - step * (rows.length - 1) / 2;
    const candidates = rows.map((row,index) => {
      const local = gridToLocal({ u: firstU + index * step, v: row.center.v }, basis);
      const latlng = localMetersToLatLng(local, ctx.origin);
      return { layer: row.layer, polygon: buildPanelRectangleAtLatLng(latlng, row.layer.panelWidth, row.layer.panelLength, row.layer.panelAzimuth, row.layer.panelRoofFaceId) };
    });
    const validation = validateCandidateSet(candidates);
    if (!validation.valid) return failInline(validation.reason);
    const before = captureLayoutSnapshot("distribute modules");
    candidates.forEach(c => { c.layer.setLatLngs(localPanelPolygonToLatLngs(c.polygon, c.layer.panelRoofFaceId)); c.layer.panelSource = "edited"; });
    const after = captureLayoutSnapshot("distribute modules");
    recordSnapshots(`Distribute ${items.length} modules`, before, after);
    markGeometryChanged(`${items.length} modules distributed with the configured gap respected; refresh electrical before export.`);
    createGroupMoveHandle(); syncUi(); return true;
  }

  function toggleLock() {
    const items = selectedArray();
    if (!items.length) return failInline("Select modules to lock or unlock.");
    const before = captureLayoutSnapshot("panel lock state");
    const shouldLock = items.some(layer => !layer.panelLocked);
    items.forEach(layer => { layer.panelLocked = shouldLock; });
    const after = captureLayoutSnapshot("panel lock state");
    recordSnapshots(`${shouldLock ? "Lock" : "Unlock"} ${items.length} modules`, before, after, { geometry: false });
    syncUi();
    global.SolarPVNotifications?.toast?.(`${items.length} module${items.length === 1 ? "" : "s"} ${shouldLock ? "locked" : "unlocked"}.`, { type: "info" });
    return true;
  }

  function replaceFaceContext(faceLayout) {
    currentLayoutContext.faceContexts.set(faceLayout.roofFaceId, {
      roofFaceId: faceLayout.roofFaceId, roofFaceName: faceLayout.roofFaceName, subArrayId: faceLayout.subArrayId,
      roofTilt: faceLayout.roofTilt, roofAzimuth: faceLayout.roofAzimuth, buildableArea: faceLayout.buildableArea,
      origin: faceLayout.origin, panelWidth: faceLayout.panelWidth, panelLength: faceLayout.panelLength,
      orientation: faceLayout.orientation, layoutAzimuth: faceLayout.layoutAzimuth, searchStats: { ...faceLayout.searchStats }
    });
  }

  function regenerateSurface({ preserveLocked = true, requireConfirm = false } = {}) {
    const faceId = primary()?.panelRoofFaceId || safely(() => activeRoofFaceId, null);
    if (!faceId || !currentLayoutContext?.settings) return failInline("Select a module or design surface before regenerating.");
    if (requireConfirm && !global.SolarPVNotifications?.confirmDestructive?.("Reset this selected surface to the generated layout? All manual positions and locks on this surface will be removed.")) return false;
    const face = getRoofFaceById(faceId);
    if (!face) return false;
    const before = captureLayoutSnapshot("surface regeneration");
    try {
      const faceLayout = buildCandidateLayoutForFace(face, currentLayoutContext.settings);
      const locked = preserveLocked ? placedPanels.filter(layer => layer.panelRoofFaceId === faceId && layer.panelLocked) : [];
      const keep = placedPanels.filter(layer => layer.panelRoofFaceId !== faceId || locked.includes(layer));
      placedPanels.filter(layer => layer.panelRoofFaceId === faceId && !locked.includes(layer)).forEach(layer => panelLayerGroup.removeLayer(layer));
      placedPanels = keep;
      if (!preserveLocked) locked.length = 0;
      replaceFaceContext(faceLayout);
      let generated = 0;
      faceLayout.polygons.forEach(polygon => {
        const validation = validateManualPanelPolygon(polygon, faceId);
        if (!validation.valid) return; // locked/manual modules safely reserve their exact geometry and gap.
        createPanelLayer(localPanelPolygonToLatLngs(polygon, faceId), {
          azimuth: faceLayout.layoutAzimuth, panelWidth: faceLayout.panelWidth, panelLength: faceLayout.panelLength,
          orientation: faceLayout.orientation, source: "automatic-regenerated", roofFaceId: faceId,
          roofFaceName: faceLayout.roofFaceName, subArrayId: faceLayout.subArrayId, surfaceTilt: faceLayout.roofTilt,
          surfaceAzimuth: faceLayout.roofAzimuth, surfaceKind: faceLayout.surfaceKind
        });
        generated += 1;
      });
      renumberPanels();
      manualLayoutEdited = locked.length > 0;
      setSelection(locked);
      const after = captureLayoutSnapshot("surface regeneration");
      recordSnapshots(`${requireConfirm ? "Reset" : "Regenerate"} surface ${face.roofFaceName}`, before, after);
      markGeometryChanged(`${face.roofFaceName} regenerated (${generated} auto modules${locked.length ? `, ${locked.length} locked preserved` : ""}); refresh electrical before export.`);
      global.SolarPVNotifications?.toast?.(`${face.roofFaceName} regenerated. ${locked.length ? `${locked.length} locked module${locked.length === 1 ? "" : "s"} preserved.` : ""}`, { type: "success" });
      return true;
    } catch (error) {
      restoreLayoutSnapshot(before, { geometry: false });
      return failInline(`Selected-surface regeneration failed: ${error.message || error}`);
    }
  }

  function failInline(message) {
    setValidationState(false, message);
    safely(() => setPanelEditStatus(message, "warning"));
    global.SolarPVNotifications?.toast?.(message, { type: "warning", timeout: 6000 });
    return false;
  }

  function markGeometryChanged(reason, { toast = true } = {}) {
    manualLayoutEdited = true;
    global.SolarPVWorkflow?.markDependentStale?.(reason);
    safely(() => updateDesignResults(false));
    global.dispatchEvent?.(new CustomEvent("solar:panelchange", { detail: { reason, count: safely(() => placedPanels.length, 0) } }));
    if (toast) global.SolarPVNotifications?.announce?.(reason);
    syncUi();
  }

  function deriveRowSummary(items) {
    if (!items.length || !sameSurface(items)) return "Mixed surfaces";
    const ctx = selectedFaceContext();
    if (!ctx) return "-";
    const basis = createLayoutBasis(items[0].panelAzimuth);
    const gap = Number(currentLayoutContext?.settings?.gap || 0);
    const tolerance = Math.max(0.05, Number(items[0].panelLength || 1) * 0.2 + gap);
    const values = items.map(layer => localToGrid(latLngToLocalMeters(getPanelCenterLatLng(layer), ctx.origin), basis).v).sort((a,b)=>a-b);
    const rows = [];
    values.forEach(value => { if (!rows.length || Math.abs(value - rows[rows.length-1]) > tolerance) rows.push(value); });
    return `${rows.length} derived row${rows.length === 1 ? "" : "s"}`;
  }

  function setValidationState(valid, message) {
    const el = byId("solarPanelValidation");
    if (!el) return;
    el.className = `solar-panel-validation ${valid ? "valid" : "invalid"}`;
    el.textContent = valid ? (message || "Geometry valid") : (message || "Geometry blocked");
  }

  function syncUi() {
    if (!initialized || typeof document === "undefined") return;
    const items = selectedArray();
    const first = items[0];
    const count = items.length;
    const countEl = byId("solarPanelSelectionCount");
    if (countEl) countEl.textContent = count ? `${count} module${count === 1 ? "" : "s"} selected` : "No modules selected";
    const data = {
      surface: count ? (sameSurface(items) ? (first.panelRoofFaceName || first.panelRoofFaceId || "-") : "Multiple surfaces") : "-",
      orientation: count ? [...new Set(items.map(x => x.panelOrientation || "Unknown"))].join(", ") : "-",
      rotation: count ? [...new Set(items.map(x => Number(x.panelAzimuth).toFixed(1)))].join(", ") + "°" : "-",
      ids: count ? items.slice(0,8).map(x => `P${x.panelNumber}`).join(", ") + (count > 8 ? ` +${count-8}` : "") : "-",
      rows: count ? deriveRowSummary(items) : "-",
      strings: count ? ([...new Set(items.map(x => x.stringId).filter(Boolean))].join(", ") || "Unassigned / refresh required") : "-",
      locked: count ? `${items.filter(x=>x.panelLocked).length} / ${count}` : "-"
    };
    Object.entries(data).forEach(([key,value]) => { const el = byId(`solarPanelInspector${key[0].toUpperCase()+key.slice(1)}`); if (el) el.textContent = value; });
    const rotationInput = byId("solarPanelExactRotation");
    if (rotationInput) { rotationInput.disabled = !count; if (count && document.activeElement !== rotationInput) rotationInput.value = Number(first.panelAzimuth || 0).toFixed(1); }
    document.querySelectorAll("[data-panel-selection-action]").forEach(btn => { btn.disabled = !count || (["align","distribute"].includes(btn.dataset.panelSelectionAction) && count < (btn.dataset.panelSelectionAction === "distribute" ? 3 : 2)); });
    const stale = global.SolarPVWorkflow?.getDependencyStatus?.().electrical === "Stale";
    const staleBox = byId("solarPanelElectricalState");
    if (staleBox) { staleBox.hidden = !stale; staleBox.textContent = stale ? "Electrical design out of date — panel geometry changed. Refresh electrical before relying on strings or SLD export." : ""; }
    const undo = byId("solarPanelUndo"), redo = byId("solarPanelRedo");
    if (undo) { undo.disabled = !history.canUndo(); undo.title = history.peekUndo()?.label ? `Undo ${history.peekUndo().label}` : "Undo"; }
    if (redo) { redo.disabled = !history.canRedo(); redo.title = history.peekRedo()?.label ? `Redo ${history.peekRedo().label}` : "Redo"; }
    const selectedStatus = count ? `${count} selected` : `${safely(() => placedPanels.length, 0)} modules`;
    const snap = byId("solarPanelSnapState"); if (snap) snap.textContent = `Grid snap: module gap ${Number(safely(() => currentLayoutContext?.settings?.gap, 0) || 0).toFixed(2)} m · ${selectedStatus}`;
    setValidationState(true, count ? "Selection ready for validated edits" : "Geometry validator ready");
    safely(() => updateManualEditorUI && null); // no recursive call; keeps identifier reachable for compatibility tooling.
  }

  function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll("[data-panel-tool]").forEach(btn => btn.classList.toggle("active", btn.dataset.panelTool === tool));
    safely(() => setPanelAddMode(tool === "add"));
    if (tool === "measure" || tool === "box") designInteractionActive = true; else if (!safely(() => currentDrawMode, null)) designInteractionActive = false;
    if (tool === "obstacle") {
      safely(() => startExclusionDrawing());
      currentTool = "select";
      document.querySelectorAll("[data-panel-tool]").forEach(btn => btn.classList.toggle("active", btn.dataset.panelTool === "select"));
    }
    if (tool === "add-row") { addRow(); setTool("select"); return; }
    if (tool !== "measure") clearMeasure();
    syncUi();
  }

  function clearMeasure() {
    measurePoints = [];
    if (measureLayer) safely(() => map.removeLayer(measureLayer));
    if (measureLabel) safely(() => map.removeLayer(measureLabel));
    measureLayer = null; measureLabel = null;
  }

  function onMapMeasureClick(event) {
    if (currentTool !== "measure") return;
    measurePoints.push(event.latlng);
    if (measurePoints.length < 2) {
      global.SolarPVNotifications?.announce?.("Measure: choose the second point.");
      return;
    }
    const [a,b] = measurePoints;
    const distance = map.distance(a,b);
    clearMeasure();
    measurePoints = [a,b];
    measureLayer = L.polyline([a,b], { color: "#245ea8", weight: 2, dashArray: "6 4" }).addTo(map);
    const mid = L.latLng((a.lat+b.lat)/2, (a.lng+b.lng)/2);
    measureLabel = L.marker(mid, { interactive: false, icon: L.divIcon({ className: "", html: `<div class="solar-measure-label">${distance.toFixed(2)} m</div>` }) }).addTo(map);
    setTimeout(() => { measurePoints = []; }, 0);
  }

  function wireBoxSelection() {
    const container = safely(() => map.getContainer(), null);
    if (!container) return;
    container.addEventListener("pointerdown", event => {
      if (currentTool !== "box" || event.button !== 0) return;
      event.preventDefault();
      designInteractionActive = true;
      safely(() => map.dragging.disable());
      const rect = container.getBoundingClientRect();
      selectionBoxStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      selectionBox = document.createElement("div");
      selectionBox.className = "solar-box-select-overlay";
      selectionBox.style.left = `${selectionBoxStart.x}px`;
      selectionBox.style.top = `${selectionBoxStart.y}px`;
      canvasHost?.appendChild(selectionBox);
      container.setPointerCapture?.(event.pointerId);
    });
    container.addEventListener("pointermove", event => {
      if (!selectionBox || !selectionBoxStart) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const left = Math.min(selectionBoxStart.x, x), top = Math.min(selectionBoxStart.y, y);
      selectionBox.style.left = `${left}px`; selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${Math.abs(x-selectionBoxStart.x)}px`; selectionBox.style.height = `${Math.abs(y-selectionBoxStart.y)}px`;
    });
    container.addEventListener("pointerup", event => {
      if (!selectionBox || !selectionBoxStart) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const minX = Math.min(selectionBoxStart.x, x), maxX = Math.max(selectionBoxStart.x, x);
      const minY = Math.min(selectionBoxStart.y, y), maxY = Math.max(selectionBoxStart.y, y);
      const hits = safely(() => placedPanels.filter(layer => {
        const center = getPanelCenterLatLng(layer); const p = map.latLngToContainerPoint(center);
        return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      }), []);
      selectionBox.remove(); selectionBox = null; selectionBoxStart = null;
      safely(() => map.dragging.enable());
      designInteractionActive = false;
      setSelection(hits);
      setTool("select");
    });
  }

  function buildWorkspace() {
    const mapEl = byId("map");
    if (!mapEl || mapEl.closest(".solar-panel-editor-workspace")) return;
    workspace = document.createElement("section");
    workspace.className = "solar-panel-editor-workspace";
    workspace.setAttribute("aria-label", "PV array editor workspace");
    mapEl.parentNode.insertBefore(workspace, mapEl);

    tools = document.createElement("div"); tools.className = "solar-panel-tools"; tools.setAttribute("aria-label", "Panel editor tools");
    tools.innerHTML = [
      ["select","V","Select","V"], ["add","+","Add module","A"], ["add-row","R","Add row","R"], ["box","B","Box select","B"], ["measure","M","Measure","M"], ["obstacle","O","Obstacle","O"]
    ].map(([id,icon,label,key]) => `<button type="button" class="solar-panel-tool${id === "select" ? " active" : ""}" data-panel-tool="${id}" title="${label} (${key})"><b>${icon}</b>${label}</button>`).join("");

    toolbar = document.createElement("div"); toolbar.className = "solar-panel-context-toolbar"; toolbar.innerHTML = `
      <button type="button" data-panel-selection-action="move">Move</button>
      <button type="button" data-panel-selection-action="rotate-left">Rotate −5°</button>
      <button type="button" data-panel-selection-action="rotate-right">Rotate +5°</button>
      <button type="button" data-panel-selection-action="align">Align</button>
      <button type="button" data-panel-selection-action="distribute">Distribute</button>
      <button type="button" data-panel-selection-action="lock">Lock / Unlock</button>
      <button type="button" class="danger" data-panel-selection-action="delete">Delete</button>`;

    canvasHost = document.createElement("div"); canvasHost.className = "solar-panel-canvas"; canvasHost.appendChild(mapEl);

    inspector = document.createElement("aside"); inspector.className = "solar-panel-inspector"; inspector.innerHTML = `
      <h3>Selection</h3><div id="solarPanelSelectionCount" class="selection-count">No modules selected</div>
      <dl>
        <dt>Surface</dt><dd id="solarPanelInspectorSurface">-</dd>
        <dt>Orientation</dt><dd id="solarPanelInspectorOrientation">-</dd>
        <dt>Rotation</dt><dd id="solarPanelInspectorRotation">-</dd>
        <dt>Panel IDs</dt><dd id="solarPanelInspectorIds">-</dd>
        <dt>Rows</dt><dd id="solarPanelInspectorRows">-</dd>
        <dt>Strings</dt><dd id="solarPanelInspectorStrings">-</dd>
        <dt>Locked</dt><dd id="solarPanelInspectorLocked">-</dd>
      </dl>
      <label for="solarPanelExactRotation">Exact group rotation / azimuth (°)</label>
      <input id="solarPanelExactRotation" type="number" min="0" max="359.9" step="0.1" disabled>
      <div class="inspector-actions"><button type="button" id="solarPanelApplyRotation">Apply</button><button type="button" id="solarPanelClearSelection">Clear</button></div>
      <div id="solarPanelElectricalState" class="solar-panel-electric-stale" hidden></div>`;

    statebar = document.createElement("div"); statebar.className = "solar-panel-statebar"; statebar.innerHTML = `
      <button type="button" id="solarPanelUndo">↶ Undo</button><button type="button" id="solarPanelRedo">↷ Redo</button>
      <span id="solarPanelSnapState">Grid snap: module gap</span><span id="solarPanelValidation" class="solar-panel-validation valid">Geometry validator ready</span>
      <span class="state-spacer"></span>
      <button type="button" id="solarPanelRegenerateSurface">Regenerate Selected Surface</button>
      <button type="button" id="solarPanelResetSurface">Reset Selected Surface to Auto Layout</button>
      <button type="button" class="panel-continue" id="solarPanelContinueElectrical">Continue to Electrical →</button>`;

    workspace.append(tools, toolbar, canvasHost, inspector, statebar);
  }

  function wireControls() {
    tools?.querySelectorAll("[data-panel-tool]").forEach(btn => btn.addEventListener("click", () => setTool(btn.dataset.panelTool)));
    toolbar?.querySelectorAll("[data-panel-selection-action]").forEach(btn => btn.addEventListener("click", () => {
      const action = btn.dataset.panelSelectionAction;
      if (action === "move") global.SolarPVNotifications?.toast?.("Drag the yellow center handle to move the selected group. Candidate geometry is previewed before commit.", { type: "info" });
      else if (action === "rotate-left") rotateSelectionBy(-5);
      else if (action === "rotate-right") rotateSelectionBy(5);
      else if (action === "align") alignSelection();
      else if (action === "distribute") distributeSelection();
      else if (action === "lock") toggleLock();
      else if (action === "delete") deleteSelection();
    }));
    byId("solarPanelApplyRotation")?.addEventListener("click", () => rotateSelectionTo(Number(byId("solarPanelExactRotation")?.value)));
    byId("solarPanelClearSelection")?.addEventListener("click", () => clearSelection());
    byId("solarPanelUndo")?.addEventListener("click", () => history.undo());
    byId("solarPanelRedo")?.addEventListener("click", () => history.redo());
    byId("solarPanelRegenerateSurface")?.addEventListener("click", () => regenerateSurface({ preserveLocked: true }));
    byId("solarPanelResetSurface")?.addEventListener("click", () => regenerateSurface({ preserveLocked: false, requireConfirm: true }));
    byId("solarPanelContinueElectrical")?.addEventListener("click", () => global.SolarPVWorkflow?.goToStage?.(4));
    history.subscribe(syncUi);
    safely(() => map.on("click", onMapMeasureClick));
    wireBoxSelection();
  }

  function keyboardHandler(event) {
    if (isTyping()) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); history.redo(); return; }
    if (event.key === "Escape") { if (currentTool !== "select") setTool("select"); else clearSelection(); return; }
    if (event.key === "Delete" || event.key === "Backspace") { if (selectedArray().length) { event.preventDefault(); deleteSelection(); } return; }
    const toolKeys = { v: "select", a: "add", r: "add-row", b: "box", m: "measure", o: "obstacle" };
    if (toolKeys[key]) { event.preventDefault(); setTool(toolKeys[key]); }
  }

  function bootstrap() {
    if (initialized || typeof document === "undefined") return;
    initialized = true;
    buildWorkspace(); wireControls(); syncUi();
    document.addEventListener("keydown", keyboardHandler, true);
    global.addEventListener?.("solar:stagechange", () => { setTimeout(() => { safely(() => map.invalidateSize()); syncUi(); }, 80); });
  }

  const API = {
    CommandStack,
    history,
    bootstrap,
    handleSelect,
    clearSelection,
    setSelection,
    getSelection: () => selectedArray(),
    syncUi,
    createGroupMoveHandle,
    rotateSelectionTo,
    rotateSelectionBy,
    deleteSelection,
    addAtLatLng,
    addRow,
    alignSelection,
    distributeSelection,
    toggleLock,
    regenerateSurface,
    reset: () => { clearSelection({ silent: true }); history.clear(); setTool("select"); syncUi(); }
  };

  global.SolarPVPanelEditor = API;
  if (typeof module !== "undefined" && module.exports) module.exports = { CommandStack };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
})(typeof globalThis !== "undefined" ? globalThis : this);
