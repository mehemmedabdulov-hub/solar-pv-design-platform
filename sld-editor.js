(function (global) {
  "use strict";

  const STORAGE_PREFIX = "solarPvDesignPlatform.v2.2.sldVisual.";
  const MAX_HISTORY = 60;
  let electricalModel = null;
  let drawing = null;
  let editorRoot = null;
  let previewToolbar = null;
  let selectedIds = new Set();
  let selectedEdgeId = null;
  let gridEnabled = true;
  let viewZoom = 1;
  let editorOpen = false;
  let dragState = null;
  let panState = null;
  let annotationClipboard = [];
  const undoStack = [];
  const redoStack = [];

  const byId = id => typeof document !== "undefined" ? document.getElementById(id) : null;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const notify = (message, type = "info", options = {}) => {
    if (global.SolarPVNotifications?.toast) global.SolarPVNotifications.toast(message, { type, ...options });
    else if (type === "error" && typeof console !== "undefined") console.error(message);
  };
  const inline = (id, message, type = "info") => global.SolarPVNotifications?.inline?.(id, message, { type });

  function safeText(value, fallback = "NOT SPECIFIED") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }
  function projectStorageKey(model = electricalModel) {
    return `${STORAGE_PREFIX}${safeText(model?.project?.id || model?.project?.name || "working-project", "working-project")}`;
  }
  function visualState(source = drawing) {
    if (!source) return null;
    return {
      schemaVersion: "1.0",
      sourceFingerprint: source.sourceFingerprint || null,
      mode: source.mode || "compact",
      profile: source.profile || "IEC",
      nodes: (source.nodes || []).map(node => ({
        designRef: node.designRef, designType: node.designType, x: node.x, y: node.y,
        displayTag: node.displayTag, note: node.note || "", hidden: !!node.hidden,
        layer: node.layer, manualPosition: !!node.manualPosition
      })),
      edges: (source.edges || []).map(edge => ({
        id: edge.id, labelOffsetX: edge.labelOffsetX || 0, labelOffsetY: edge.labelOffsetY || 0,
        route: clone(edge.route || [])
      })),
      annotations: clone(source.annotations || []),
      layers: clone(source.layers || []),
      savedAt: new Date().toISOString()
    };
  }
  function saveVisualState() {
    if (!drawing || typeof localStorage === "undefined") return;
    try { localStorage.setItem(projectStorageKey(), JSON.stringify(visualState())); } catch (_) { /* storage is optional */ }
  }
  function loadVisualState(model) {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(projectStorageKey(model));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.schemaVersion === "1.0" ? parsed : null;
    } catch (_) { return null; }
  }
  function sourceApi() {
    if (!global.SolarPVSLDDrawing) throw new Error("SLD drawing model is not loaded.");
    return global.SolarPVSLDDrawing;
  }
  function createFromVisual(model, previous, options = {}) {
    return sourceApi().createDrawingModel(model, {
      mode: options.mode || previous?.mode || drawing?.mode || "compact",
      profile: options.profile || previous?.profile || drawing?.profile || "IEC",
      previous: previous || null,
      revision: options.revision,
      designer: options.designer,
      reviewer: options.reviewer
    });
  }
  function isCurrent() {
    return !!(drawing && electricalModel && drawing.sourceFingerprint && drawing.sourceFingerprint === electricalModel.sourceFingerprint);
  }
  function currentPreflight() {
    return drawing && electricalModel ? sourceApi().preflightDrawing(drawing, electricalModel) : { ok: false, errors: ["No current SLD drawing."], warnings: [] };
  }
  function persistAndRender() {
    if (!drawing) return;
    drawing.drawingFingerprint = sourceApi().calculateDrawingFingerprint(drawing);
    saveVisualState();
    renderPreview();
    if (editorOpen) renderEditorCanvas();
    updateChrome();
  }

  function pushHistory(label, before, after) {
    undoStack.push({ label, before: clone(before), after: clone(after) });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    updateChrome();
  }
  function mutate(label, fn) {
    if (!drawing) return false;
    const before = visualState();
    const result = fn();
    if (result === false) return false;
    const after = visualState();
    if (JSON.stringify(before) !== JSON.stringify(after)) pushHistory(label, before, after);
    persistAndRender();
    return true;
  }
  function restoreVisual(state) {
    if (!electricalModel || !state) return;
    drawing = createFromVisual(electricalModel, state, { mode: state.mode, profile: state.profile });
    selectedIds = new Set([...selectedIds].filter(id => drawing.nodes.some(n => n.id === id) || drawing.annotations.some(a => a.id === id)));
    persistAndRender();
  }
  function undo() {
    const item = undoStack.pop();
    if (!item) return false;
    redoStack.push(item);
    restoreVisual(item.before);
    notify(`Undid: ${item.label}.`, "info");
    return true;
  }
  function redo() {
    const item = redoStack.pop();
    if (!item) return false;
    undoStack.push(item);
    restoreVisual(item.after);
    notify(`Redid: ${item.label}.`, "info");
    return true;
  }

  function setElectricalModel(model, options = {}) {
    if (!model) {
      electricalModel = null;
      drawing = null;
      selectedIds.clear();
      selectedEdgeId = null;
      undoStack.length = 0;
      redoStack.length = 0;
      renderPreview();
      updateChrome();
      return null;
    }
    const sameSource = drawing && drawing.sourceFingerprint === model.sourceFingerprint;
    electricalModel = model;
    if (sameSource && !options.force) {
      updateChrome();
      renderPreview();
      return drawing;
    }
    const previous = options.resetLayout ? null : (drawing ? visualState() : loadVisualState(model));
    drawing = createFromVisual(model, previous, options);
    selectedIds.clear();
    selectedEdgeId = null;
    undoStack.length = 0;
    redoStack.length = 0;
    saveVisualState();
    renderPreview();
    if (editorOpen) renderEditorCanvas();
    updateChrome();
    global.dispatchEvent?.(new CustomEvent("solar:sldrefresh", { detail: { sourceFingerprint: drawing.sourceFingerprint } }));
    return drawing;
  }

  function renderPreview(target = byId("sldPreview")) {
    if (!target) return "";
    const svg = sourceApi().renderSvg(drawing, electricalModel, { monochrome: false });
    target.innerHTML = svg;
    target.dataset.sldSourceFingerprint = drawing?.sourceFingerprint || "";
    target.dataset.sldCurrent = isCurrent() ? "true" : "false";
    return svg;
  }

  function makeToolbar() {
    if (typeof document === "undefined" || previewToolbar) return previewToolbar;
    const preview = byId("sldPreview");
    if (!preview) return null;
    previewToolbar = document.createElement("div");
    previewToolbar.className = "solar-sld-preview-toolbar";
    previewToolbar.innerHTML = `
      <div class="solar-sld-preview-title"><strong>E-401 Single-Line Diagram</strong><span id="solarSldCurrentBadge" class="solar-sld-current-badge">Not generated</span></div>
      <div class="solar-sld-preview-actions">
        <label>View <select id="solarSldMode"><option value="compact">Compact</option><option value="detailed">Detailed</option></select></label>
        <label>Profile <select id="solarSldProfile"><option value="IEC">IEC-style</option><option value="ANSI">ANSI-style</option></select></label>
        <button type="button" id="solarSldRefresh">Refresh SLD</button>
        <button type="button" id="solarSldEdit">Edit Drawing</button>
        <button type="button" id="solarSldExportSvg">SVG</button>
        <button type="button" id="solarSldExportPdf">PDF</button>
        <button type="button" id="solarSldExportPng">PNG</button>
        <button type="button" id="solarSldExportDxf">DXF</button>
      </div>
      <div id="solarSldPreflightSummary" class="solar-sld-preflight-summary"></div>`;
    preview.before(previewToolbar);
    byId("solarSldRefresh")?.addEventListener("click", () => refreshFromCurrentElectrical());
    byId("solarSldEdit")?.addEventListener("click", () => openEditor());
    byId("solarSldMode")?.addEventListener("change", event => changeMode(event.target.value));
    byId("solarSldProfile")?.addEventListener("change", event => changeProfile(event.target.value));
    byId("solarSldExportSvg")?.addEventListener("click", () => exportSvg());
    byId("solarSldExportPdf")?.addEventListener("click", () => exportPdf());
    byId("solarSldExportPng")?.addEventListener("click", () => exportPng());
    byId("solarSldExportDxf")?.addEventListener("click", () => exportDxf());
    return previewToolbar;
  }

  function makeEditor() {
    if (typeof document === "undefined" || editorRoot) return editorRoot;
    const host = byId("deliverablesCard");
    if (!host) return null;
    editorRoot = document.createElement("section");
    editorRoot.id = "solarSldEditor";
    editorRoot.className = "solar-sld-editor";
    editorRoot.hidden = true;
    editorRoot.innerHTML = `
      <div class="solar-sld-editor-head">
        <div><strong>SLD Editor · E-401</strong><span>Drawing-only edits stay separate from the validated electrical source.</span></div>
        <div class="solar-sld-editor-actions">
          <button type="button" data-sld-action="auto">Auto Layout</button>
          <button type="button" data-sld-action="undo">Undo</button>
          <button type="button" data-sld-action="redo">Redo</button>
          <button type="button" data-sld-action="fit">Fit</button>
          <button type="button" data-sld-action="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" data-sld-action="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" data-sld-action="grid">Grid: On</button>
          <button type="button" data-sld-action="align">Align</button>
          <button type="button" data-sld-action="distribute">Distribute</button>
          <button type="button" data-sld-action="reroute">Reroute Circuit</button>
          <button type="button" data-sld-action="reset-route">Reset Circuit Route</button>
          <button type="button" data-sld-action="validate">Validate</button>
          <button type="button" data-sld-action="close">Done</button>
        </div>
      </div>
      <div class="solar-sld-editor-grid">
        <aside class="solar-sld-library">
          <h3>Component / Annotation Library</h3>
          <p>Electrical components are generated from the current design and cannot be created here.</p>
          <div id="solarSldComponentList" class="solar-sld-component-list"></div>
          <h4>Drawing annotations</h4>
          <button type="button" data-add-annotation="note">+ Note</button>
          <button type="button" data-add-annotation="label">+ Label</button>
          <button type="button" data-add-annotation="arrow">+ Arrow</button>
          <button type="button" data-add-annotation="cloud">+ Revision cloud</button>
          <details><summary>Advanced layers</summary><div id="solarSldLayerList"></div></details>
        </aside>
        <div class="solar-sld-canvas-wrap">
          <div id="solarSldEditorCanvas" class="solar-sld-editor-canvas" tabindex="0" aria-label="SLD drawing canvas"></div>
        </div>
        <aside class="solar-sld-inspector">
          <h3>Properties</h3>
          <div id="solarSldSelectionKind" class="solar-sld-selection-kind">No selection</div>
          <label>Tag / label<input id="solarSldDisplayTag" type="text" disabled></label>
          <label>Drawing note<textarea id="solarSldNote" rows="3" disabled></textarea></label>
          <label>X<input id="solarSldX" type="number" step="1" disabled></label>
          <label>Y<input id="solarSldY" type="number" step="1" disabled></label>
          <div class="solar-sld-readonly"><strong>Electrical data (read-only)</strong><pre id="solarSldElectricalData">Select a design-bound object.</pre></div>
          <button type="button" id="solarSldApplyProps" disabled>Apply drawing properties</button>
          <button type="button" id="solarSldDeleteObject" class="danger" disabled>Delete annotation</button>
          <button type="button" id="solarSldGoElectrical" hidden>Modify upstream electrical design</button>
          <div id="solarSldInspectorMessage" class="solar-sld-inspector-message"></div>
        </aside>
      </div>`;
    host.appendChild(editorRoot);
    editorRoot.querySelectorAll("[data-sld-action]").forEach(button => button.addEventListener("click", () => handleToolbarAction(button.dataset.sldAction)));
    editorRoot.querySelectorAll("[data-add-annotation]").forEach(button => button.addEventListener("click", () => addAnnotation(button.dataset.addAnnotation)));
    byId("solarSldApplyProps")?.addEventListener("click", applyInspectorProperties);
    byId("solarSldDeleteObject")?.addEventListener("click", deleteSelected);
    byId("solarSldGoElectrical")?.addEventListener("click", () => { global.SolarPVWorkflow?.goToStage?.(4); closeEditor(); byId("electricalDesignCard")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); });
    wireCanvasPointerEvents();
    return editorRoot;
  }

  function updateChrome() {
    makeToolbar();
    const current = isCurrent();
    const badge = byId("solarSldCurrentBadge");
    if (badge) {
      badge.className = `solar-sld-current-badge ${current ? "current" : drawing ? "stale" : "missing"}`;
      badge.textContent = current ? "Drawing current" : drawing ? "Drawing stale" : "Not generated";
    }
    const mode = byId("solarSldMode"); if (mode && drawing) mode.value = drawing.mode;
    const profile = byId("solarSldProfile"); if (profile && drawing) profile.value = drawing.profile;
    ["solarSldEdit","solarSldExportSvg","solarSldExportPdf","solarSldExportPng","solarSldExportDxf"].forEach(id => { const el=byId(id); if(el) el.disabled=!drawing; });
    const preflight = drawing && electricalModel ? currentPreflight() : null;
    const summary = byId("solarSldPreflightSummary");
    if (summary) {
      if (!preflight) summary.textContent = "Generate a current electrical design to create the drawing.";
      else summary.innerHTML = `<strong>${preflight.ok ? "Preflight" : "Preflight needs attention"}:</strong> ${preflight.errors.length} error(s), ${preflight.warnings.length} warning(s). Source ${safeText(drawing.sourceFingerprint)}.`;
      summary.className = `solar-sld-preflight-summary ${preflight?.ok ? "ok" : "warning"}`;
    }
    if (editorRoot) {
      const undoButton = editorRoot.querySelector('[data-sld-action="undo"]'); if (undoButton) undoButton.disabled = !undoStack.length;
      const redoButton = editorRoot.querySelector('[data-sld-action="redo"]'); if (redoButton) redoButton.disabled = !redoStack.length;
      const gridButton = editorRoot.querySelector('[data-sld-action="grid"]'); if (gridButton) gridButton.textContent = `Grid: ${gridEnabled ? "On" : "Off"}`;
    }
  }

  function openEditor() {
    if (!drawing || !electricalModel) { notify("Generate a current electrical design before editing the drawing.", "warning"); return false; }
    makeEditor();
    editorOpen = true;
    editorRoot.hidden = false;
    editorRoot.classList.add("open");
    byId("sldPreview")?.setAttribute("aria-hidden", "true");
    renderEditorCanvas();
    updateEditorSidebars();
    editorRoot.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return true;
  }
  function closeEditor() {
    editorOpen = false;
    if (editorRoot) { editorRoot.hidden = true; editorRoot.classList.remove("open"); }
    byId("sldPreview")?.removeAttribute("aria-hidden");
    renderPreview();
  }

  function renderEditorCanvas() {
    const canvas = byId("solarSldEditorCanvas");
    if (!canvas) return;
    canvas.classList.toggle("grid-enabled", gridEnabled);
    canvas.innerHTML = sourceApi().renderSvg(drawing, electricalModel, { editor: true });
    const svg = canvas.querySelector("svg");
    if (svg) { svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); svg.setAttribute("aria-label", "Editable SLD drawing sheet"); }
    if (svg) {
      svg.style.width = `${Math.round(viewZoom * 100)}%`;
      svg.style.maxWidth = "none";
    }
    selectedIds.forEach(id => canvas.querySelector(`[data-sld-node="${cssEscape(id)}"], [data-sld-annotation="${cssEscape(id)}"]`)?.classList.add("selected"));
    if (selectedEdgeId) canvas.querySelector(`[data-sld-edge="${cssEscape(selectedEdgeId)}"]`)?.classList.add("selected");
    updateEditorSidebars();
  }
  function cssEscape(value) { return global.CSS?.escape ? global.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }

  function updateEditorSidebars() {
    if (!editorRoot || !drawing) return;
    const list = byId("solarSldComponentList");
    if (list) list.innerHTML = drawing.nodes.filter(n=>!n.hidden).map(node => `<button type="button" data-library-node="${safeText(node.id)}"><span>${safeText(node.displayTag||node.tag)}</span><small>${safeText(node.label)}</small></button>`).join("");
    list?.querySelectorAll("[data-library-node]").forEach(button => button.addEventListener("click", () => selectObject(button.dataset.libraryNode, false)));
    const layerList = byId("solarSldLayerList");
    if (layerList) layerList.innerHTML = drawing.layers.map(layer => `<label><input type="checkbox" data-sld-layer="${layer.name}" ${layer.visible!==false?"checked":""}> ${layer.name}</label>`).join("");
    layerList?.querySelectorAll("[data-sld-layer]").forEach(input => input.addEventListener("change", () => mutate(`Toggle ${input.dataset.sldLayer} layer`, () => { const layer=drawing.layers.find(item=>item.name===input.dataset.sldLayer); if(layer) layer.visible=input.checked; })));
    updateInspector();
  }

  function selectedObjects() {
    if (!drawing) return [];
    return [...selectedIds].map(id => drawing.nodes.find(n=>n.id===id) || drawing.annotations.find(a=>a.id===id)).filter(Boolean);
  }
  function selectObject(id, additive = false) {
    if (!drawing) return;
    selectedEdgeId = null;
    if (!additive) selectedIds.clear();
    if (additive && selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    renderEditorCanvas();
  }
  function selectEdge(id) {
    if (!drawing) return;
    selectedIds.clear();
    selectedEdgeId = id || null;
    renderEditorCanvas();
  }
  function updateInspector() {
    const items = selectedObjects();
    const kind = byId("solarSldSelectionKind");
    const fields = [byId("solarSldDisplayTag"),byId("solarSldNote"),byId("solarSldX"),byId("solarSldY")];
    if (!items.length && selectedEdgeId) {
      const edge = drawing.edges.find(item => item.id === selectedEdgeId);
      if (kind) kind.textContent = edge ? "Design-bound circuit connector selected" : "No selection";
      fields.forEach(field => { if(field){field.value="";field.disabled=true;} });
      const data = byId("solarSldElectricalData"); if (data) data.textContent = edge ? JSON.stringify({ designRef:edge.designRef, type:edge.designType, circuit:edge.circuit, route:edge.route }, null, 2) : "Select a drawing object.";
      const apply=byId("solarSldApplyProps"); if(apply) apply.disabled=true;
      const del=byId("solarSldDeleteObject"); if(del){del.disabled=true;del.textContent="Circuit is design-bound";}
      const go=byId("solarSldGoElectrical"); if(go) go.hidden=false;
      const msg=byId("solarSldInspectorMessage"); if(msg) msg.textContent="Circuit routing is drawing-only. Use Reroute Circuit or Reset Circuit Route; cable and protection values remain read-only.";
      return;
    }
    if (!items.length) {
      if (kind) kind.textContent = "No selection";
      fields.forEach(field => { if(field){field.value="";field.disabled=true;} });
      const data = byId("solarSldElectricalData"); if (data) data.textContent = "Select a design-bound object.";
      const apply=byId("solarSldApplyProps"); if(apply) apply.disabled=true;
      const del=byId("solarSldDeleteObject"); if(del){del.disabled=true;del.textContent="Delete annotation";}
      const go=byId("solarSldGoElectrical"); if(go) go.hidden=true;
      return;
    }
    const first = items[0];
    const isNode = !!first.bound;
    if (kind) kind.textContent = `${items.length} ${isNode ? "design-bound" : "annotation"} object${items.length===1?"":"s"} selected`;
    const tag = byId("solarSldDisplayTag"); if(tag){tag.disabled=items.length!==1;tag.value=first.displayTag||first.text||"";}
    const note = byId("solarSldNote"); if(note){note.disabled=items.length!==1;note.value=first.note||(!isNode?first.text||"":"");}
    const x=byId("solarSldX"); if(x){x.disabled=items.length!==1;x.value=Number(first.x||0).toFixed(0);}
    const y=byId("solarSldY"); if(y){y.disabled=items.length!==1;y.value=Number(first.y||0).toFixed(0);}
    const data=byId("solarSldElectricalData");
    if(data) data.textContent=isNode ? JSON.stringify({ designRef:first.designRef, type:first.designType, ...first.data }, null, 2) : "Annotation-only object. No electrical calculation data.";
    const apply=byId("solarSldApplyProps"); if(apply) apply.disabled=items.length!==1;
    const del=byId("solarSldDeleteObject"); if(del){del.disabled=items.length!==1;del.textContent=isNode?"Cannot delete design-bound object":"Delete annotation";}
    const go=byId("solarSldGoElectrical"); if(go) go.hidden=!isNode;
    const msg=byId("solarSldInspectorMessage"); if(msg) msg.textContent=isNode?"Safe editing rule: calculated ratings remain read-only here. Change them in Electrical + SLD.":"Annotation-only objects may be freely edited or removed.";
  }

  function applyInspectorProperties() {
    const items = selectedObjects(); if (items.length !== 1) return;
    const item = items[0];
    const x = Number(byId("solarSldX")?.value), y = Number(byId("solarSldY")?.value);
    mutate("Edit drawing properties", () => {
      if (Number.isFinite(x)) item.x = snap(x); if (Number.isFinite(y)) item.y = snap(y);
      if (item.bound) { item.displayTag = safeText(byId("solarSldDisplayTag")?.value, item.tag); item.note = String(byId("solarSldNote")?.value || ""); item.manualPosition = true; }
      else { item.text = String(byId("solarSldDisplayTag")?.value || byId("solarSldNote")?.value || "Drawing note"); }
    });
  }
  function deleteSelected() {
    const items=selectedObjects(); if(items.length!==1)return;
    const item=items[0];
    if(item.bound){
      inline("solarSldInspectorMessage", "This symbol belongs to the electrical design. Modify or remove that equipment upstream instead of deleting only its drawing symbol.", "warning");
      notify("Design-bound electrical objects cannot be deleted in the SLD editor.", "warning"); return;
    }
    mutate("Delete drawing annotation", () => { drawing.annotations=drawing.annotations.filter(a=>a.id!==item.id); selectedIds.delete(item.id); });
  }
  function addAnnotation(type) {
    if (!drawing) return;
    const before=visualState();
    const item=sourceApi().addAnnotation(drawing,type,{ x:680+(drawing.annotations.length%4)*45, y:700+(drawing.annotations.length%3)*45, text:type==="cloud"?"REVISION":"Drawing note" });
    selectedIds.clear(); if(item) selectedIds.add(item.id);
    pushHistory(`Add ${type} annotation`,before,visualState()); persistAndRender();
  }

  function snap(value) { return gridEnabled ? Math.round(Number(value)/10)*10 : Number(value); }
  function setZoom(next) {
    viewZoom = Math.max(0.55, Math.min(2.5, Number(next) || 1));
    renderEditorCanvas();
    const kind = byId("solarSldSelectionKind");
    if (kind && !selectedIds.size && !selectedEdgeId) kind.textContent = `No selection · zoom ${Math.round(viewZoom*100)}%`;
  }
  function rerouteSelectedEdge(reset = false) {
    if (!drawing || !selectedEdgeId) { notify("Select a circuit connector before changing its route.", "warning"); return false; }
    const edge=drawing.edges.find(item=>item.id===selectedEdgeId); if(!edge)return false;
    const from=drawing.nodes.find(item=>item.id===edge.from),to=drawing.nodes.find(item=>item.id===edge.to); if(!from||!to)return false;
    return mutate(reset ? "Reset circuit route" : "Reroute circuit",()=>{
      if(reset){edge.route=[];return;}
      const sx=Number(from.x||0)+Number(from.w||100), sy=Number(from.y||0)+Number(from.h||60)/2;
      const ex=Number(to.x||0), ey=Number(to.y||0)+Number(to.h||60)/2;
      const oldX=edge.route?.length ? Number(edge.route[0]?.x) : (sx+ex)/2;
      const midX=snap(Math.max(sx+20,Math.min(ex-20,oldX+30)));
      edge.route=[{x:midX,y:snap(sy)},{x:midX,y:snap(ey)}];
    });
  }
  function copyAnnotations() {
    annotationClipboard=selectedObjects().filter(item=>!item.bound).map(item=>clone(item));
    if(annotationClipboard.length) notify(`${annotationClipboard.length} drawing annotation(s) copied.`,"info");
    return annotationClipboard.length;
  }
  function pasteAnnotations() {
    if(!drawing||!annotationClipboard.length)return false;
    const before=visualState(),added=[];
    annotationClipboard.forEach((source,index)=>{
      const item=sourceApi().addAnnotation(drawing,source.type,{x:Number(source.x||0)+30,y:Number(source.y||0)+30,text:source.text,style:clone(source.style||{})});
      if(item){item.layer=source.layer||"Notes";added.push(item);}
    });
    selectedIds=new Set(added.map(item=>item.id));selectedEdgeId=null;pushHistory(`Paste ${added.length} annotation(s)`,before,visualState());persistAndRender();return true;
  }
  function handleToolbarAction(action) {
    if (action === "undo") return undo(); if(action==="redo")return redo(); if(action==="close")return closeEditor();
    if(action==="fit"){ setZoom(1); byId("solarSldEditorCanvas")?.parentElement?.scrollTo?.({top:0,left:0,behavior:"smooth"}); return; }
    if(action==="zoom-in"){setZoom(viewZoom+0.15);return;}
    if(action==="zoom-out"){setZoom(viewZoom-0.15);return;}
    if(action==="grid"){gridEnabled=!gridEnabled;renderEditorCanvas();updateChrome();return;}
    if(action==="validate"){showPreflight();return;}
    if(action==="auto"){return resetAutoLayout();}
    if(action==="align"){return alignSelected();}
    if(action==="distribute"){return distributeSelected();}
    if(action==="reroute"){return rerouteSelectedEdge(false);}
    if(action==="reset-route"){return rerouteSelectedEdge(true);}
  }
  function resetAutoLayout() {
    if(!drawing||!electricalModel)return;
    const before=visualState();
    const annotations=clone(drawing.annotations), layers=clone(drawing.layers);
    drawing=sourceApi().createDrawingModel(electricalModel,{mode:drawing.mode,profile:drawing.profile,previous:{annotations,layers}});
    selectedIds.clear(); selectedEdgeId=null; pushHistory("Reset to auto layout",before,visualState()); persistAndRender(); notify("Drawing positions reset to the deterministic auto layout. Electrical data was unchanged.","success");
  }
  function alignSelected() {
    const items=selectedObjects(); if(items.length<2){notify("Select two or more drawing objects to align.","warning");return;}
    mutate("Align drawing objects",()=>{const y=snap(items.reduce((sum,item)=>sum+Number(item.y||0),0)/items.length);items.forEach(item=>{item.y=y;if(item.bound)item.manualPosition=true;});});
  }
  function distributeSelected() {
    const items=selectedObjects(); if(items.length<3){notify("Select three or more drawing objects to distribute.","warning");return;}
    const sorted=[...items].sort((a,b)=>Number(a.x||0)-Number(b.x||0)); const start=Number(sorted[0].x||0),end=Number(sorted[sorted.length-1].x||0),step=(end-start)/(sorted.length-1);
    mutate("Distribute drawing objects",()=>sorted.forEach((item,index)=>{item.x=snap(start+step*index);if(item.bound)item.manualPosition=true;}));
  }
  function showPreflight() {
    const result=currentPreflight();
    const details=[...result.errors.map(item=>`ERROR: ${item}`),...result.warnings.map(item=>`WARNING: ${item}`)];
    inline("solarSldInspectorMessage",details.length?details.join(" "):"Preflight passed. Drawing references and source fingerprint are current.",result.ok?"success":"warning");
    notify(result.ok?`SLD preflight passed with ${result.warnings.length} warning(s).`:`SLD preflight found ${result.errors.length} error(s) and ${result.warnings.length} warning(s).`,result.ok?"success":"warning");
    updateChrome(); return result;
  }
  function changeMode(mode) {
    if(!electricalModel)return; const before=visualState(); drawing=createFromVisual(electricalModel,visualState(),{mode:mode==="detailed"?"detailed":"compact"}); pushHistory("Change SLD detail mode",before,visualState());persistAndRender();
  }
  function changeProfile(profile) {
    if(!electricalModel)return; const before=visualState(); drawing=createFromVisual(electricalModel,visualState(),{profile:String(profile).toUpperCase()==="ANSI"?"ANSI":"IEC"}); pushHistory("Change drawing profile",before,visualState());persistAndRender();
  }

  function pointerToSvg(event, svg) {
    const point = svg.createSVGPoint(); point.x=event.clientX; point.y=event.clientY;
    const ctm=svg.getScreenCTM(); return ctm ? point.matrixTransform(ctm.inverse()) : {x:event.offsetX,y:event.offsetY};
  }
  function wireCanvasPointerEvents() {
    const canvas=byId("solarSldEditorCanvas"); if(!canvas)return;
    const wrap=canvas.parentElement;
    canvas.addEventListener("wheel",event=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();setZoom(viewZoom+(event.deltaY<0?0.1:-0.1));
    },{passive:false});
    canvas.addEventListener("click",event=>{
      if(panState)return;
      const node=event.target.closest?.("[data-sld-node]"); const ann=event.target.closest?.("[data-sld-annotation]"); const edge=event.target.closest?.("[data-sld-edge]"); const target=node||ann;
      if(edge&&!target){selectEdge(edge.dataset.sldEdge);return;}
      if(!target){if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey){selectedIds.clear();selectedEdgeId=null;renderEditorCanvas();}return;}
      selectObject(target.dataset.sldNode||target.dataset.sldAnnotation,event.ctrlKey||event.metaKey||event.shiftKey);
    });
    canvas.addEventListener("pointerdown",event=>{
      const target=event.target.closest?.("[data-sld-node], [data-sld-annotation]");
      if((event.button===1||(event.button===0&&event.altKey))&&wrap){
        panState={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:wrap.scrollLeft,top:wrap.scrollTop};canvas.setPointerCapture?.(event.pointerId);event.preventDefault();return;
      }
      if(!target||event.button!==0)return;
      const id=target.dataset.sldNode||target.dataset.sldAnnotation; if(!selectedIds.has(id))selectObject(id,event.ctrlKey||event.metaKey||event.shiftKey);
      const svg=canvas.querySelector("svg"); if(!svg)return; const start=pointerToSvg(event,svg); const items=selectedObjects();
      dragState={pointerId:event.pointerId,start,items:items.map(item=>({item,x:Number(item.x||0),y:Number(item.y||0)})),before:visualState(),svg};
      target.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    canvas.addEventListener("pointermove",event=>{
      if(panState&&event.pointerId===panState.pointerId&&wrap){wrap.scrollLeft=panState.left-(event.clientX-panState.x);wrap.scrollTop=panState.top-(event.clientY-panState.y);return;}
      if(!dragState||event.pointerId!==dragState.pointerId)return; const now=pointerToSvg(event,dragState.svg),dx=now.x-dragState.start.x,dy=now.y-dragState.start.y;
      dragState.items.forEach(row=>{
        row.item.x=snap(row.x+dx); row.item.y=snap(row.y+dy); if(row.item.bound)row.item.manualPosition=true;
        const selector=row.item.bound?`[data-sld-node="${cssEscape(row.item.id)}"]`:`[data-sld-annotation="${cssEscape(row.item.id)}"]`;
        canvas.querySelector(selector)?.setAttribute("transform", `translate(${row.item.x} ${row.item.y})`);
      });
    });
    canvas.addEventListener("pointerup",event=>{
      if(panState&&event.pointerId===panState.pointerId){panState=null;return;}
      if(!dragState||event.pointerId!==dragState.pointerId)return; const before=dragState.before;dragState=null;pushHistory("Move drawing object(s)",before,visualState());persistAndRender();
    });
  }

  function currentModelFromPage() {
    try { return typeof buildElectricalObjectModel === "function" ? buildElectricalObjectModel() : electricalModel; } catch (_) { return electricalModel; }
  }
  function refreshFromCurrentElectrical() {
    let model=currentModelFromPage();
    if(!model){notify("Refresh the string / MPPT electrical design before rebuilding the SLD.","warning");return null;}
    if(global.SolarPVWorkflow?.clearStale) global.SolarPVWorkflow.clearStale("electrical");
    setElectricalModel(model,{force:true});
    if(global.SolarPVWorkflow?.clearStale) global.SolarPVWorkflow.clearStale("sld");
    notify("SLD refreshed from the current deterministic electrical object model.","success");
    return drawing;
  }
  function markStale(reason="Upstream design changed.") {
    if (previewToolbar) {
      const badge=byId("solarSldCurrentBadge"); if(badge){badge.className="solar-sld-current-badge stale";badge.textContent="Drawing stale";}
      const summary=byId("solarSldPreflightSummary"); if(summary){summary.className="solar-sld-preflight-summary warning";summary.textContent=`Drawing out of date — ${reason} Refresh SLD before export.`;}
    }
  }

  function artifactName(label, ext) {
    try { if(typeof safeProjectArtifactName === "function") return safeProjectArtifactName(label,ext); } catch (_) {}
    const project=safeText(electricalModel?.project?.name,"Solar-PV-Project").replace(/[^a-z0-9._-]+/gi,"-").replace(/^-+|-+$/g,"");
    return `${project || "Solar-PV-Project"}_${label}.${ext}`;
  }
  function downloadBlob(filename, blob) {
    if(typeof document==="undefined")return blob; const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return blob;
  }
  function assertExportReady() {
    if(!drawing||!electricalModel){notify("Generate a current SLD before exporting.","warning");return false;}
    if(!isCurrent()){notify("Electrical design is newer than the SLD. Refresh SLD before exporting.","warning");return false;}
    return true;
  }
  function exportSvg() {
    if(!assertExportReady())return null; const svg=sourceApi().renderSvg(drawing,electricalModel); downloadBlob(artifactName("SLD","svg"),new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));return svg;
  }
  function exportDxf() {
    if(!assertExportReady())return null; const dxf=sourceApi().buildDxf(drawing,electricalModel);downloadBlob(artifactName("SLD","dxf"),new Blob([dxf],{type:"application/dxf;charset=utf-8"}));return dxf;
  }
  function svgToCanvas(scale=2) {
    return new Promise((resolve,reject)=>{
      if(!assertExportReady())return reject(new Error("SLD is not current."));
      const svg=sourceApi().renderSvg(drawing,electricalModel); const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"}); const url=URL.createObjectURL(blob); const img=new Image();
      img.onload=()=>{try{const canvas=document.createElement("canvas");canvas.width=global.SolarPVSLDDrawing.SHEET.width*scale;canvas.height=global.SolarPVSLDDrawing.SHEET.height*scale;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas);}catch(err){URL.revokeObjectURL(url);reject(err);}};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Could not rasterize the SVG drawing."));}; img.src=url;
    });
  }
  async function exportPng() {
    try{const canvas=await svgToCanvas(2);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png",1));if(!blob)throw new Error("PNG encoder returned no data.");downloadBlob(artifactName("SLD","png"),blob);notify("PNG SLD exported.","success");return blob;}catch(err){notify(err.message||"PNG export failed.","error");return null;}
  }

  function asciiBytes(text) { return new TextEncoder().encode(text); }
  function concatBytes(parts) { const len=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(len);let at=0;parts.forEach(p=>{out.set(p,at);at+=p.length;});return out; }
  function buildPdfFromJpegBytes(jpegBytes, imageWidth, imageHeight, pageWidth=1190.55, pageHeight=841.89) {
    const objects=[]; const pushObject=parts=>objects.push(Array.isArray(parts)?parts:[asciiBytes(parts)]);
    pushObject("<< /Type /Catalog /Pages 2 0 R >>");
    pushObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    pushObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    pushObject([asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${Math.round(imageWidth)} /Height ${Math.round(imageHeight)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),jpegBytes,asciiBytes("\nendstream")]);
    const content=`q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`; pushObject(`<< /Length ${asciiBytes(content).length} >>\nstream\n${content}endstream`);
    const parts=[asciiBytes("%PDF-1.4\n%SOLAR-v2.2\n")],offsets=[0]; let length=parts[0].length;
    objects.forEach((obj,index)=>{offsets[index+1]=length;const start=asciiBytes(`${index+1} 0 obj\n`),end=asciiBytes("\nendobj\n");parts.push(start,...obj,end);length+=start.length+obj.reduce((s,p)=>s+p.length,0)+end.length;});
    const xrefOffset=length;let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)xref+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;xref+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;parts.push(asciiBytes(xref));return concatBytes(parts);
  }
  function dataUrlToBytes(dataUrl) { const base64=dataUrl.split(",")[1]||"";if(typeof atob==="function"){const binary=atob(base64),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}if(typeof Buffer!=="undefined")return Uint8Array.from(Buffer.from(base64,"base64"));throw new Error("Base64 decoder unavailable."); }
  async function exportPdf() {
    try{const canvas=await svgToCanvas(2);const jpeg=dataUrlToBytes(canvas.toDataURL("image/jpeg",0.94));const pdf=buildPdfFromJpegBytes(jpeg,canvas.width,canvas.height);const blob=new Blob([pdf],{type:"application/pdf"});downloadBlob(artifactName("SLD","pdf"),blob);notify("PDF SLD exported.","success");return blob;}catch(err){notify(err.message||"PDF export failed.","error");return null;}
  }

  function bootstrap() {
    if(typeof document==="undefined")return; makeToolbar(); makeEditor(); updateChrome();
    document.addEventListener("keydown",event=>{if(!editorOpen||["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;const key=event.key.toLowerCase();if((event.ctrlKey||event.metaKey)&&key==="z"){event.preventDefault();event.shiftKey?redo():undo();}else if((event.ctrlKey||event.metaKey)&&key==="y"){event.preventDefault();redo();}else if((event.ctrlKey||event.metaKey)&&key==="c"){if(copyAnnotations()){event.preventDefault();}}else if((event.ctrlKey||event.metaKey)&&key==="v"){if(annotationClipboard.length){event.preventDefault();pasteAnnotations();}}else if((event.ctrlKey||event.metaKey)&&(key==="+"||key==="=")){event.preventDefault();setZoom(viewZoom+0.15);}else if((event.ctrlKey||event.metaKey)&&key==="-"){event.preventDefault();setZoom(viewZoom-0.15);}else if(event.key==="Delete"||event.key==="Backspace"){if(selectedIds.size){event.preventDefault();deleteSelected();}}else if(event.key==="Escape"){selectedIds.clear();selectedEdgeId=null;renderEditorCanvas();}});
    global.addEventListener?.("solar:designstale",event=>markStale(event.detail?.reason||"Upstream design changed."));
  }

  const API={
    VERSION:"2.2.0",bootstrap,setElectricalModel,refreshFromCurrentElectrical,markStale,renderPreview,openEditor,closeEditor,
    getDrawing:()=>drawing,getElectricalModel:()=>electricalModel,isCurrent,getPreflight:currentPreflight,visualState,undo,redo,resetAutoLayout,
    copyAnnotations,pasteAnnotations,rerouteSelectedEdge,setZoom,
    exportSvg,exportPng,exportPdf,exportDxf,buildPdfFromJpegBytes,dataUrlToBytes
  };
  global.SolarPVSLDEditor=API;
  if(typeof module!=="undefined"&&module.exports) module.exports={ buildPdfFromJpegBytes, visualStateFromDrawing: visualState };
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
})(typeof globalThis!=="undefined"?globalThis:this);
