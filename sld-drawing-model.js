(function (global) {
  "use strict";

  const VERSION = "2.2.0";
  const SHEET = { width: 1680, height: 1188, margin: 36, contentTop: 128, contentBottom: 914 };
  const LAYERS = ["Electrical", "Labels", "Notes", "Title Block", "Optional Details"];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }
  function n(value, fallback = null) { const num = Number(value); return Number.isFinite(num) ? num : fallback; }
  function text(value, fallback = "NOT SPECIFIED") { const v = String(value ?? "").trim(); return v || fallback; }
  function fmt(value, digits = 1, suffix = "") { return Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}${suffix}` : "NOT SPECIFIED"; }
  function fnv1a(value) {
    let hash = 0x811c9dc5;
    const string = String(value);
    for (let i = 0; i < string.length; i += 1) { hash ^= string.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function stableStringify(value) {
    if (value == null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  function makeTag(prefix, index) { return `${prefix}-${String(index).padStart(2, "0")}`; }
  function routeData(row) {
    if (!row) return null;
    return {
      circuit: row.circuit || null,
      category: row.category || null,
      qty: n(row.qty),
      designCurrentA: n(row.designCurrentA),
      oneWayLengthM: n(row.oneWayLengthM),
      cableSizeMm2: n(row.cableSizeMm2),
      conductorMaterial: row.conductorMaterial || null,
      voltageV: n(row.voltageV),
      dropPct: n(row.dropPct),
      protection: row.protection || null,
      capacityA: n(row.capacityA),
      status: row.status || null
    };
  }
  function findCircuit(model, predicate) { return (model?.circuits || []).find(predicate) || null; }
  function circuitByString(model, stringId) {
    return findCircuit(model, row => row.category === "dc-string" && String(row.circuit || "").includes(String(stringId)));
  }
  function circuitByMppt(model, inv, mppt) {
    const needle = `${inv}:${mppt}`;
    return findCircuit(model, row => row.category === "dc-homerun" && String(row.circuit || "").includes(needle));
  }
  function circuitDcProtection(model, inv) {
    return findCircuit(model, row => row.category === "protection" && String(row.circuit || "").startsWith(`Inverter ${inv}`));
  }
  function circuitAc(model, inv) {
    return findCircuit(model, row => row.category === "ac-feeder" && String(row.circuit || "").startsWith(`Inverter ${inv}`));
  }
  function circuitEarth(model, inv) {
    return findCircuit(model, row => row.category === "earthing" && String(row.circuit || "").startsWith(`Inverter ${inv}`));
  }

  function defaultPosition(type, index, context = {}) {
    const invIndex = context.invIndex || 0;
    const laneY = 230 + invIndex * 210;
    const typeX = { string: 105, stringGroup: 105, mppt: 350, combiner: 500, dcProtection: 615, inverter: 790, acProtection: 1010, board: 1200, meter: 1355, grid: 1510, earth: 875 };
    const offsets = { string: (index % 5) * 32, stringGroup: 0, mppt: (index % 4) * 42, combiner: 0, dcProtection: 0, inverter: 0, acProtection: 0, board: 0, meter: 0, grid: 0, earth: 80 };
    return { x: typeX[type] ?? 100, y: laneY + (offsets[type] || 0) };
  }

  function preserve(previous, node) {
    const prev = previous?.nodes?.find(item => item.designRef === node.designRef && item.designType === node.designType);
    if (!prev) return node;
    return {
      ...node,
      x: n(prev.x, node.x), y: n(prev.y, node.y),
      displayTag: text(prev.displayTag, node.tag),
      note: String(prev.note || ""),
      hidden: !!prev.hidden,
      layer: LAYERS.includes(prev.layer) ? prev.layer : node.layer,
      manualPosition: !!prev.manualPosition
    };
  }

  function addNode(drawing, node, previous) {
    const saved = preserve(previous, node);
    drawing.nodes.push(saved);
    return saved;
  }
  function addEdge(drawing, from, to, id, circuit, kind = "link", previous = null) {
    const prev = previous?.edges?.find(item => item.id === id);
    drawing.edges.push({
      id, from: from.id, to: to.id, designRef: circuit?.circuit || id, designType: circuit?.category || kind,
      bound: true, layer: "Electrical", kind, circuit: routeData(circuit),
      labelOffsetX: n(prev?.labelOffsetX, 0), labelOffsetY: n(prev?.labelOffsetY, 0), route: Array.isArray(prev?.route) ? prev.route.map(p => ({x:n(p.x,0), y:n(p.y,0)})) : []
    });
  }

  function createDrawingModel(electricalModel, options = {}) {
    if (!electricalModel) return null;
    const mode = options.mode === "detailed" ? "detailed" : "compact";
    const profile = String(options.profile || "IEC").toUpperCase() === "ANSI" ? "ANSI" : "IEC";
    const previous = options.previous || null;
    const drawing = {
      schemaVersion: "1.0",
      drawingVersion: VERSION,
      sourceFingerprint: electricalModel.sourceFingerprint || null,
      sourceProjectId: electricalModel.project?.id || null,
      sourceRevisionNumber: n(electricalModel.project?.revisionNumber, 0),
      mode, profile,
      sheet: { ...SHEET, size: "A3", orientation: "landscape", scale: "NTS" },
      layers: LAYERS.map(name => ({ name, visible: previous?.layers?.find(item => item.name === name)?.visible !== false })),
      nodes: [], edges: [], annotations: [],
      metadata: {
        title: "PRELIMINARY SINGLE-LINE DIAGRAM",
        number: "E-401",
        revision: text(options.revision, `R${n(electricalModel.project?.revisionNumber,0)}`),
        designer: text(options.designer, "NOT SPECIFIED"),
        reviewer: text(options.reviewer, "NOT SPECIFIED"),
        status: "PRELIMINARY · NOT FOR CONSTRUCTION",
        applicationVersion: "2.2",
        calculationEngineVersion: "2.1",
        projectSchema: "2.0",
        generatedAt: options.generatedAt || electricalModel.generatedAt || new Date().toISOString()
      }
    };

    const strings = electricalModel.strings || [];
    const inverters = electricalModel.inverters || [];
    const mpptKeyMap = new Map();
    strings.forEach(string => {
      const key = `${string.inverterNumber}:${string.mpptNumber}`;
      if (!mpptKeyMap.has(key)) mpptKeyMap.set(key, []);
      mpptKeyMap.get(key).push(string);
    });

    let stringTagIndex = 0, mpptTagIndex = 0;
    const globalBoard = addNode(drawing, { id: "node-ac-board", designRef: "SITE-AC-BUS", designType: "board", bound: true, tag: "DB-01", displayTag: "DB-01", label: "SITE AC DISTRIBUTION", x: 1190, y: 450, w: 120, h: 70, layer: "Electrical", data: {} }, previous);
    const meterData = electricalModel.meter || electricalModel.project?.meter || null;
    const meter = meterData ? addNode(drawing, { id: "node-meter", designRef: meterData.id || "SITE-METER", designType: "meter", bound: true, tag: "MTR-01", displayTag: "MTR-01", label: text(meterData.label || meterData.model, "METER"), x: 1370, y: 450, w: 80, h: 80, layer: "Electrical", data: { ...meterData } }, previous) : null;
    const grid = addNode(drawing, { id: "node-grid", designRef: "SITE-GRID", designType: "grid", bound: true, tag: "GRID-01", displayTag: "GRID-01", label: "UTILITY / GRID", x: 1515, y: 450, w: 100, h: 80, layer: "Electrical", data: { acSystemVoltageV: electricalModel.circuits?.find(row => row.category === "ac-feeder")?.voltageV ?? null } }, previous);
    if (meter) {
      addEdge(drawing, globalBoard, meter, "edge-board-meter", null, "ac", previous);
      addEdge(drawing, meter, grid, "edge-meter-grid", null, "ac", previous);
    } else {
      addEdge(drawing, globalBoard, grid, "edge-board-grid", null, "ac", previous);
    }

    inverters.forEach((inv, invIndex) => {
      const invNode = addNode(drawing, { id: `node-inv-${inv.number}`, designRef: inv.id || `INV-${inv.number}`, designType: "inverter", bound: true, tag: makeTag("INV", inv.number), displayTag: makeTag("INV", inv.number), label: `${text(inv.manufacturer,"")} ${text(inv.model,"")}`.trim() || "INVERTER", x: 790, y: 210 + invIndex * 210, w: 150, h: 100, layer: "Electrical", data: { acKW:n(inv.acKW), assignedDcKW:n(inv.assignedDcKW), mppts:inv.mppts || [] } }, previous);
      const dcRow = circuitDcProtection(electricalModel, inv.number);
      const dcNode = addNode(drawing, { id: `node-dc-prot-${inv.number}`, designRef: dcRow?.circuit || `INV-${inv.number}-DC-PROTECTION`, designType: "dcProtection", bound: true, tag: makeTag("DC-ISO", inv.number), displayTag: makeTag("DC-ISO", inv.number), label: "DC ISOLATOR / SPD", x: 610, y: 220 + invIndex * 210, w: 130, h: 80, layer: "Electrical", data: routeData(dcRow) || {} }, previous);
      const acRow = circuitAc(electricalModel, inv.number);
      const acNode = addNode(drawing, { id: `node-ac-prot-${inv.number}`, designRef: acRow?.circuit || `INV-${inv.number}-AC-PROTECTION`, designType: "acProtection", bound: true, tag: makeTag("AC-MCCB", inv.number), displayTag: makeTag("AC-MCCB", inv.number), label: "AC BREAKER / ISOLATOR / SPD", x: 990, y: 220 + invIndex * 210, w: 150, h: 80, layer: "Electrical", data: routeData(acRow) || {} }, previous);
      addEdge(drawing, dcNode, invNode, `edge-dcprot-inv-${inv.number}`, dcRow, "dc", previous);
      addEdge(drawing, invNode, acNode, `edge-inv-acprot-${inv.number}`, acRow, "ac", previous);
      addEdge(drawing, acNode, globalBoard, `edge-acprot-board-${inv.number}`, acRow, "ac", previous);

      const earthRow = circuitEarth(electricalModel, inv.number);
      if (earthRow) {
        const earthNode = addNode(drawing, { id: `node-earth-${inv.number}`, designRef: earthRow.circuit, designType: "earth", bound: true, tag: makeTag("PE", inv.number), displayTag: makeTag("PE", inv.number), label: "EARTH / PE", x: 860, y: 330 + invIndex * 210, w: 80, h: 60, layer: "Electrical", data: routeData(earthRow) }, previous);
        addEdge(drawing, invNode, earthNode, `edge-earth-${inv.number}`, earthRow, "earth", previous);
      }

      const invMppts = [...mpptKeyMap.entries()].filter(([key]) => key.startsWith(`${inv.number}:`));
      invMppts.forEach(([key, keyStrings], mpptLocalIndex) => {
        mpptTagIndex += 1;
        const mpptNumber = Number(key.split(":")[1]);
        const mpptNode = addNode(drawing, { id: `node-mppt-${inv.number}-${mpptNumber}`, designRef: `INV-${inv.number}-MPPT-${mpptNumber}`, designType: "mppt", bound: true, tag: makeTag("MPPT", mpptTagIndex), displayTag: makeTag("MPPT", mpptTagIndex), label: `MPPT ${mpptNumber}`, x: 390, y: 205 + invIndex * 210 + mpptLocalIndex * 52, w: 90, h: 54, layer: "Electrical", data: { inverterNumber:inv.number, mpptNumber, stringIds:keyStrings.map(item=>item.id) } }, previous);
        const homerun = circuitByMppt(electricalModel, inv.number, mpptNumber);
        if (homerun || keyStrings.length > 1) {
          const combinerNode = addNode(drawing, { id: `node-combiner-${inv.number}-${mpptNumber}`, designRef: homerun?.circuit || `INV-${inv.number}-MPPT-${mpptNumber}-COMBINER`, designType: "combiner", bound: true, tag: makeTag("DC-CMB", mpptTagIndex), displayTag: makeTag("DC-CMB", mpptTagIndex), label: keyStrings.length > 1 ? "MPPT COMBINER" : "DC HOMERUN", x: 505, y: mpptNode.y, w: 90, h: 54, layer: "Electrical", data: routeData(homerun) || { stringCount:keyStrings.length } }, previous);
          addEdge(drawing, mpptNode, combinerNode, `edge-mppt-combiner-${inv.number}-${mpptNumber}`, homerun, "dc", previous);
          addEdge(drawing, combinerNode, dcNode, `edge-combiner-dcprot-${inv.number}-${mpptNumber}`, homerun, "dc", previous);
        } else {
          addEdge(drawing, mpptNode, dcNode, `edge-mppt-dcprot-${inv.number}-${mpptNumber}`, null, "dc", previous);
        }

        const renderedStrings = mode === "detailed" ? keyStrings : [{
          id: `GROUP-${inv.number}-${mpptNumber}`, moduleCount: keyStrings.reduce((s,item)=>s+n(item.moduleCount,0),0),
          groupCount: keyStrings.length, subArrayId:[...new Set(keyStrings.map(item=>item.subArrayId))].join(", "), inverterNumber:inv.number,
          mpptNumber, powerKW:keyStrings.reduce((s,item)=>s+n(item.powerKW,0),0), status:keyStrings.some(item=>item.status === "fail") ? "fail" : "pass",
          sourceStrings:keyStrings
        }];
        renderedStrings.forEach((string, localIndex) => {
          stringTagIndex += 1;
          const isGroup = !!string.groupCount;
          const stringNode = addNode(drawing, { id: `node-string-${String(string.id).replace(/[^A-Za-z0-9_-]/g,"-")}`, designRef: isGroup ? `GROUP:${keyStrings.map(item=>item.id).join("|")}` : String(string.id), designType: isGroup ? "stringGroup" : "string", bound: true, tag: makeTag("STR", stringTagIndex), displayTag: makeTag("STR", stringTagIndex), label: isGroup ? `${string.groupCount} STRINGS · MPPT ${mpptNumber}` : String(string.id), x: 105, y: 190 + invIndex * 210 + (mpptLocalIndex * 65) + localIndex * 46, w: 170, h: 58, layer: "Electrical", data: { moduleCount:n(string.moduleCount), groupCount:n(string.groupCount), subArrayId:string.subArrayId, inverterNumber:inv.number, mpptNumber, powerKW:n(string.powerKW), status:string.status, stringIds:isGroup?keyStrings.map(item=>item.id):[string.id] } }, previous);
          const stringCircuit = isGroup ? circuitByString(electricalModel, keyStrings[0]?.id) : circuitByString(electricalModel, string.id);
          addEdge(drawing, stringNode, mpptNode, `edge-string-mppt-${stringTagIndex}`, stringCircuit, "dc", previous);
        });
      });
    });

    // Preserve drawing-only objects through regeneration. They never create design objects or ratings.
    drawing.annotations = (previous?.annotations || []).map(item => ({ ...item, bound:false, layer: LAYERS.includes(item.layer) ? item.layer : "Notes" }));
    drawing.drawingFingerprint = calculateDrawingFingerprint(drawing);
    drawing.preflight = preflightDrawing(drawing, electricalModel);
    return drawing;
  }

  function calculateDrawingFingerprint(drawing) {
    if (!drawing) return null;
    const payload = {
      sourceFingerprint:drawing.sourceFingerprint, mode:drawing.mode, profile:drawing.profile,
      nodes:drawing.nodes.map(node=>({id:node.id,designRef:node.designRef,x:n(node.x,0),y:n(node.y,0),tag:node.displayTag||node.tag,note:node.note||"",hidden:!!node.hidden})),
      edges:drawing.edges.map(edge=>({id:edge.id,from:edge.from,to:edge.to,route:edge.route||[]})),
      annotations:drawing.annotations.map(item=>({id:item.id,type:item.type,x:item.x,y:item.y,text:item.text||""}))
    };
    return `sld-${fnv1a(stableStringify(payload))}`;
  }

  function preflightDrawing(drawing, electricalModel) {
    const warnings = [], errors = [];
    if (!drawing || !electricalModel) return { ok:false, errors:["No current drawing/electrical model."], warnings:[] };
    if (!electricalModel.module?.id || !electricalModel.module?.model) warnings.push("Module identity is incomplete.");
    if (!electricalModel.inverter?.id || !electricalModel.inverter?.model) warnings.push("Inverter identity is incomplete.");
    (electricalModel.strings || []).forEach(string => {
      if (!Number.isFinite(Number(string.inverterNumber)) || !Number.isFinite(Number(string.mpptNumber))) errors.push(`${string.id || "String"} has no complete inverter/MPPT assignment.`);
    });
    (drawing.edges || []).filter(edge => ["dc","ac","earth"].includes(edge.kind)).forEach(edge => {
      const circuit = edge.circuit;
      if (circuit && !circuit.protection && ["ac","dc"].includes(edge.kind)) warnings.push(`${circuit.circuit || edge.id}: protection is NOT SPECIFIED.`);
      if (circuit && ["dc-string","dc-homerun","ac-feeder"].includes(circuit.category)) {
        if (!Number.isFinite(circuit.cableSizeMm2)) warnings.push(`${circuit.circuit || edge.id}: conductor size is NOT SPECIFIED.`);
        if (!Number.isFinite(circuit.oneWayLengthM)) warnings.push(`${circuit.circuit || edge.id}: cable length is NOT SPECIFIED.`);
      }
    });
    const nodeIds = new Set((drawing.nodes || []).map(node=>node.id));
    const connected = new Set();
    (drawing.edges || []).forEach(edge => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`${edge.id}: connector references a missing drawing node.`);
      connected.add(edge.from); connected.add(edge.to);
    });
    (drawing.nodes || []).filter(node => node.bound && !node.hidden && node.designType !== "earth").forEach(node => { if (!connected.has(node.id)) errors.push(`${node.displayTag || node.tag}: design-bound node is unconnected.`); });
    const tags = new Map();
    (drawing.nodes || []).filter(node=>!node.hidden).forEach(node => {
      const tag = text(node.displayTag || node.tag, "");
      if (!tag) warnings.push(`${node.id}: display tag is NOT SPECIFIED.`);
      else { tags.set(tag, (tags.get(tag)||0)+1); }
      if (n(node.x,-1) < 35 || n(node.x,99999) > SHEET.width-35 || n(node.y,-1) < 125 || n(node.y,99999) > SHEET.contentBottom) errors.push(`${tag || node.id}: object is off the drawing sheet.`);
    });
    [...tags.entries()].filter(([,count])=>count>1).forEach(([tag]) => errors.push(`Duplicate drawing tag: ${tag}.`));
    if (drawing.sourceFingerprint !== electricalModel.sourceFingerprint) errors.push("Drawing source fingerprint is stale relative to the current electrical object model.");
    const unsupported = (drawing.nodes || []).filter(node => !["string","stringGroup","mppt","combiner","dcProtection","inverter","acProtection","board","meter","grid","earth"].includes(node.designType));
    if (unsupported.length) warnings.push(`${unsupported.length} unsupported design-bound component type(s) are present.`);
    return { ok:errors.length===0, errors:[...new Set(errors)], warnings:[...new Set(warnings)] };
  }

  function nodeById(drawing, id) { return drawing?.nodes?.find(node=>node.id===id) || null; }
  function edgeLabel(edge, options = {}) {
    const c = edge.circuit;
    if (!c) return "";
    const bits = [];
    if (Number.isFinite(c.cableSizeMm2)) bits.push(`${c.cableSizeMm2} mm² ${text(c.conductorMaterial || options.conductorMaterial, "")}`.trim());
    else if (["dc-string","dc-homerun","ac-feeder","earthing"].includes(c.category)) bits.push("CONDUCTOR NOT SPECIFIED");
    if (Number.isFinite(c.oneWayLengthM)) bits.push(`${c.oneWayLengthM.toFixed(1)} m`);
    if (Number.isFinite(c.designCurrentA) && c.designCurrentA > 0) bits.push(`Ib ${c.designCurrentA.toFixed(1)} A`);
    if (Number.isFinite(c.dropPct) && ["dc-string","dc-homerun","ac-feeder"].includes(c.category)) bits.push(`ΔV ${c.dropPct.toFixed(2)}%`);
    return bits.join(" · ");
  }

  function protectionShort(circuit) {
    if (!circuit?.protection) return "NOT SPECIFIED";
    const str = String(circuit.protection);
    return str.length > 78 ? `${str.slice(0,75)}…` : str;
  }

  function symbol(node) {
    const x=node.x, y=node.y, w=node.w||100, h=node.h||60, tag=esc(node.displayTag||node.tag), label=esc(node.label), data=node.data||{};
    const boundAttr = `data-sld-node="${esc(node.id)}" data-design-bound="${node.bound ? "true":"false"}" tabindex="0"`;
    if (node.designType === "string" || node.designType === "stringGroup") {
      const modules = Number.isFinite(data.moduleCount) ? `${data.moduleCount} modules${data.groupCount?" total":""}` : "NOT SPECIFIED";
      return `<g class="sld-node sld-string" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="4"/><g class="pv-mini"><rect x="8" y="12" width="18" height="26"/><rect x="29" y="12" width="18" height="26"/><rect x="50" y="12" width="18" height="26"/></g><text class="tag" x="78" y="18">${tag}</text><text x="78" y="34">${label}</text><text class="small" x="78" y="49">${esc(modules)}</text></g>`;
    }
    if (node.designType === "mppt") return `<g class="sld-node sld-mppt" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="3"/><text class="tag" x="8" y="19">${tag}</text><text x="8" y="38">${label}</text><circle cx="${w-12}" cy="${h/2}" r="5"/></g>`;
    if (node.designType === "combiner") return `<g class="sld-node" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="3"/><text class="tag" x="7" y="18">${tag}</text><text class="small" x="7" y="36">${label}</text><path d="M12 ${h-10} H${w-12} M${w/2} 10 V${h-10}"/></g>`;
    if (node.designType === "dcProtection") return `<g class="sld-node sld-dc-prot" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="3"/><text class="tag" x="7" y="17">${tag}</text><path d="M18 40 H38 L51 28 M51 40 H74"/><path d="M88 30 L101 43 L88 56 L75 43 Z"/><text class="small" x="7" y="${h-7}">${label}</text></g>`;
    if (node.designType === "inverter") return `<g class="sld-node sld-inverter" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="5"/><text class="tag" x="9" y="20">${tag}</text><path d="M18 ${h/2+8} C35 ${h/2-15},50 ${h/2+31},68 ${h/2+8} S100 ${h/2-15},120 ${h/2+8}"/><text x="9" y="${h-25}">${label}</text><text class="small" x="9" y="${h-9}">${fmt(data.acKW,1," kW AC")}</text></g>`;
    if (node.designType === "acProtection") return `<g class="sld-node sld-ac-prot" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="3"/><text class="tag" x="7" y="18">${tag}</text><path d="M18 43 H42 L55 29 M55 43 H82"/><rect x="94" y="28" width="24" height="28"/><text class="small" x="7" y="${h-7}">${label}</text></g>`;
    if (node.designType === "board") return `<g class="sld-node sld-board" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}"/><line x1="14" y1="${h/2}" x2="${w-14}" y2="${h/2}" class="bus"/><text class="tag" x="7" y="18">${tag}</text><text class="small" x="7" y="${h-7}">${label}</text></g>`;
    if (node.designType === "meter") return `<g class="sld-node sld-meter" ${boundAttr} transform="translate(${x} ${y})"><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/2-5}"/><text class="meter-m" x="${w/2}" y="${h/2+8}" text-anchor="middle">M</text><text class="tag" x="${w/2}" y="${h+17}" text-anchor="middle">${tag}</text></g>`;
    if (node.designType === "grid") return `<g class="sld-node sld-grid" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}"/><text class="tag" x="${w/2}" y="23" text-anchor="middle">${tag}</text><path d="M${w/2} 31 V58 M${w/2-14} 45 H${w/2+14} M${w/2-10} 51 H${w/2+10} M${w/2-5} 57 H${w/2+5}"/><text class="small" x="${w/2}" y="${h-7}" text-anchor="middle">GRID</text></g>`;
    if (node.designType === "earth") return `<g class="sld-node sld-earth" ${boundAttr} transform="translate(${x} ${y})"><text class="tag" x="40" y="12" text-anchor="middle">${tag}</text><path d="M40 20 V36 M22 36 H58 M27 43 H53 M32 50 H48"/><text class="small" x="40" y="64" text-anchor="middle">PE / EARTH</text></g>`;
    return `<g class="sld-node" ${boundAttr} transform="translate(${x} ${y})"><rect width="${w}" height="${h}"/><text class="tag" x="7" y="18">${tag}</text><text x="7" y="36">${label}</text></g>`;
  }

  function orthogonalPath(from, to, edge) {
    if (edge.route?.length) {
      const pts = [{x:from.x+(from.w||100),y:from.y+(from.h||60)/2}, ...edge.route, {x:to.x,y:to.y+(to.h||60)/2}];
      return `M${pts.map((p,i)=>`${i?"L":""}${p.x} ${p.y}`).join(" ")}`;
    }
    const start = { x:from.x+(from.w||100), y:from.y+(from.h||60)/2 };
    const end = { x:to.x, y:to.y+(to.h||60)/2 };
    const mid = (start.x+end.x)/2;
    return `M${start.x} ${start.y} H${mid} V${end.y} H${end.x}`;
  }

  function renderSvg(drawing, electricalModel, options = {}) {
    if (!drawing || !electricalModel) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 220"><text x="30" y="60" font-family="Arial" font-size="20">Generate a valid current electrical design to create the SLD.</text></svg>`;
    drawing.preflight = preflightDrawing(drawing, electricalModel);
    drawing.drawingFingerprint = calculateDrawingFingerprint(drawing);
    const p = electricalModel.project || {}, rules = electricalModel.engineeringRules || {};
    const dcKW = (electricalModel.subArrays || []).reduce((s,a)=>s+n(a.dcKW,0),0);
    const acKW = (electricalModel.inverters || []).reduce((s,a)=>s+n(a.acKW,0),0);
    const moduleCount = (electricalModel.subArrays || []).reduce((s,a)=>s+n(a.moduleCount,0),0);
    const ratio = acKW > 0 ? dcKW/acKW : null;
    const preflightText = drawing.preflight.errors.length ? `${drawing.preflight.errors.length} error(s), ${drawing.preflight.warnings.length} warning(s)` : drawing.preflight.warnings.length ? `${drawing.preflight.warnings.length} warning(s)` : "PASS — drawing/source checks complete";
    const visibleNodes = drawing.nodes.filter(node=>!node.hidden && drawing.layers.find(layer=>layer.name===node.layer)?.visible!==false);
    const visibleIds = new Set(visibleNodes.map(node=>node.id));
    const edgeSvg = drawing.edges.filter(edge=>visibleIds.has(edge.from)&&visibleIds.has(edge.to)&&drawing.layers.find(layer=>layer.name===edge.layer)?.visible!==false).map(edge => {
      const from=nodeById(drawing,edge.from), to=nodeById(drawing,edge.to); if(!from||!to)return "";
      const path=orthogonalPath(from,to,edge), label=edgeLabel(edge,{conductorMaterial:rules.conductorMaterial});
      const sx=from.x+(from.w||100), sy=from.y+(from.h||60)/2, ex=to.x, ey=to.y+(to.h||60)/2;
      const lx=(sx+ex)/2+n(edge.labelOffsetX,0), ly=(sy+ey)/2-7+n(edge.labelOffsetY,0);
      return `<g class="sld-edge sld-edge-${esc(edge.kind)}" data-sld-edge="${esc(edge.id)}"><path d="${path}"/><text class="edge-label" x="${lx}" y="${ly}" text-anchor="middle">${esc(label)}</text></g>`;
    }).join("");
    const nodeSvg = visibleNodes.map(symbol).join("");
    const annotations = drawing.annotations.filter(item=>drawing.layers.find(layer=>layer.name===item.layer)?.visible!==false).map(item => {
      const content=esc(item.text||""); const x=n(item.x,400),y=n(item.y,700);
      if(item.type==="arrow") return `<g class="sld-annotation" data-sld-annotation="${esc(item.id)}"><path d="M${x} ${y} l80 0 -10 -6 m10 6 -10 6"/><text x="${x}" y="${y-8}">${content}</text></g>`;
      if(item.type==="cloud") return `<g class="sld-annotation cloud" data-sld-annotation="${esc(item.id)}"><rect x="${x}" y="${y}" width="180" height="60" rx="18"/><text x="${x+10}" y="${y+34}">${content}</text></g>`;
      return `<g class="sld-annotation" data-sld-annotation="${esc(item.id)}"><text x="${x}" y="${y}">${content}</text></g>`;
    }).join("");
    const symbolTypes = [...new Set(visibleNodes.map(node=>node.designType))];
    const legendNames = {string:"PV string",stringGroup:"PV string group",mppt:"MPPT",combiner:"Combiner/homerun",dcProtection:"DC isolator/SPD",inverter:"Inverter",acProtection:"AC breaker/isolator/SPD",board:"Distribution board",meter:"Meter",grid:"Grid",earth:"Earth/PE"};
    const legend = symbolTypes.map((type,index)=>`<text x="${1050+(index%3)*180}" y="${790+Math.floor(index/3)*18}">• ${esc(legendNames[type]||type)}</text>`).join("");
    const sourceMatch = drawing.sourceFingerprint === electricalModel.sourceFingerprint;
    const date = (()=>{try{return new Date(drawing.metadata.generatedAt).toISOString().slice(0,10);}catch(_){return "NOT SPECIFIED";}})();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.width} ${SHEET.height}" role="img" aria-label="Preliminary solar PV single-line diagram" data-sld-drawing-version="${VERSION}" data-app-version="2.2" data-calculation-engine-version="2.1" data-project-schema="2.0" data-source-fingerprint="${esc(drawing.sourceFingerprint||"")}" data-drawing-fingerprint="${esc(drawing.drawingFingerprint||"")}" data-drawing-current="${sourceMatch}">
      <title>${esc(text(p.name,"Untitled Project"))} — Preliminary Single-Line Diagram</title>
      <desc>CAD-style drawing generated from the deterministic electrical object model. Drawing positions and annotations do not change electrical calculations.</desc>
      <metadata>${esc(JSON.stringify({sourceFingerprint:drawing.sourceFingerprint,drawingFingerprint:drawing.drawingFingerprint,rulePack:rules.packId,ruleFingerprint:rules.fingerprint,preflight:drawing.preflight}))}</metadata>
      <style>
        .sheet{fill:#fff;stroke:#17252a;stroke-width:2}.zone{fill:none;stroke:#bac7ca;stroke-width:1}.zone-title{font:bold 12px Arial;fill:#40616b;letter-spacing:1px}.sld-node rect,.sld-node circle{fill:#fff;stroke:#20383f;stroke-width:1.8}.sld-node path,.sld-node line{fill:none;stroke:#20383f;stroke-width:1.8}.sld-node text,.sld-annotation text{font:11px Arial;fill:#233940}.sld-node .tag{font:bold 11px Arial;fill:#0d5d4b}.sld-node .small{font:9px Arial;fill:#52686f}.sld-inverter rect{fill:#f0f7f9;stroke:#2a6876}.sld-dc-prot rect{fill:#fff8ee;stroke:#b77318}.sld-ac-prot rect{fill:#fff2f1;stroke:#a93a32}.sld-string rect{fill:#eef8f4;stroke:#0d7657}.sld-edge path{fill:none;stroke-width:2}.sld-edge-dc path{stroke:#236fa1}.sld-edge-ac path{stroke:#a83b33}.sld-edge-earth path{stroke:#277a58;stroke-dasharray:5 4}.edge-label{font:8px Arial;fill:#465b62}.bus{stroke-width:4!important}.meter-m{font:bold 25px Arial!important}.header-title{font:bold 22px Arial;fill:#132e36;letter-spacing:.8px}.header-sub{font:10px Arial;fill:#5d7077}.spec-label{font:bold 9px Arial;fill:#6a7b81}.spec-value{font:10px Arial;fill:#233940}.block-title{font:bold 11px Arial;fill:#0c5f4b}.note{font:9px Arial;fill:#42575e}.warn{font:bold 9px Arial;fill:#9a3412}.title-label{font:bold 8px Arial;fill:#65767c}.title-value{font:10px Arial;fill:#172f36}.sld-annotation path,.sld-annotation rect{fill:none;stroke:#42575e;stroke-width:1.2}.cloud rect{stroke-dasharray:4 3}
        @media print {.sld-edge-dc path,.sld-edge-ac path,.sld-edge-earth path{stroke:#111}.sld-edge-earth path{stroke-dasharray:5 4}.sld-node .tag{fill:#111}.sld-inverter rect,.sld-dc-prot rect,.sld-ac-prot rect,.sld-string rect{fill:#fff;stroke:#111}}
      </style>
      <rect class="sheet" x="18" y="18" width="1644" height="1152"/>
      <text class="header-title" x="45" y="56">PRELIMINARY SINGLE-LINE DIAGRAM</text>
      <text class="header-sub" x="45" y="78">PV system electrical path · auto-generated from the current project electrical object model · ${esc(drawing.profile)} profile · ${esc(drawing.mode.toUpperCase())}</text>
      <text class="warn" x="45" y="101">${esc(drawing.metadata.status)} · Drawing ${sourceMatch?"CURRENT":"STALE"} · Source ${esc(text(drawing.sourceFingerprint))}</text>
      <rect class="zone" x="45" y="135" width="520" height="610"/><text class="zone-title" x="58" y="158">PV ARRAY / DC</text>
      <rect class="zone" x="575" y="135" width="400" height="610"/><text class="zone-title" x="588" y="158">INVERTER / PROTECTION</text>
      <rect class="zone" x="985" y="135" width="300" height="610"/><text class="zone-title" x="998" y="158">AC DISTRIBUTION</text>
      <rect class="zone" x="1295" y="135" width="335" height="610"/><text class="zone-title" x="1308" y="158">METER / GRID</text>
      ${edgeSvg}${nodeSvg}${annotations}
      <rect class="zone" x="45" y="760" width="700" height="176"/><text class="block-title" x="58" y="782">SYSTEM SPECIFICATIONS</text>
      <text class="spec-label" x="58" y="805">MODULE</text><text class="spec-value" x="175" y="805">${esc(`${text(electricalModel.module?.manufacturer,"")} ${text(electricalModel.module?.model)} ${text(electricalModel.module?.variant,"")}`.trim())}</text>
      <text class="spec-label" x="58" y="824">MODULE COUNT / DC</text><text class="spec-value" x="175" y="824">${moduleCount} modules · ${dcKW.toFixed(2)} kWp</text>
      <text class="spec-label" x="58" y="843">INVERTER</text><text class="spec-value" x="175" y="843">${esc(`${text(electricalModel.inverter?.manufacturer,"")} ${text(electricalModel.inverter?.model)}`.trim())} · ${invertersCount(electricalModel)} unit(s) · ${acKW.toFixed(1)} kW AC</text>
      <text class="spec-label" x="58" y="862">DC / AC RATIO</text><text class="spec-value" x="175" y="862">${Number.isFinite(ratio)?ratio.toFixed(2):"NOT SPECIFIED"}</text>
      <text class="spec-label" x="58" y="881">STRINGS</text><text class="spec-value" x="175" y="881">${(electricalModel.strings||[]).length} string(s) · lengths ${esc([...new Set((electricalModel.strings||[]).map(item=>item.moduleCount))].sort((a,b)=>a-b).join(", ")||"NOT SPECIFIED")}</text>
      <text class="spec-label" x="58" y="900">RULE PACK</text><text class="spec-value" x="175" y="900">${esc(`${text(rules.packId)}@${text(rules.packVersion)} · ${text(rules.fingerprint)}`)}</text>
      <text class="spec-label" x="58" y="919">DESIGN STATUS</text><text class="spec-value" x="175" y="919">${esc(preflightText)}</text>
      <rect class="zone" x="755" y="760" width="875" height="176"/><text class="block-title" x="768" y="782">LEGEND / PREFLIGHT</text>${legend}
      <text class="note" x="768" y="892">1. Electrical ratings shown are data-bound to the current design; missing values print as NOT SPECIFIED.</text>
      <text class="note" x="768" y="909">2. Visual edits may move symbols, tags and annotations only; upstream electrical forms govern calculated ratings.</text>
      <text class="warn" x="768" y="926">3. Preliminary output. Final fault levels, breaking capacity, coordination, earthing and jurisdiction-specific compliance require independent review.</text>
      <rect class="zone" x="45" y="950" width="935" height="195"/><text class="block-title" x="58" y="973">GENERAL NOTES / REVISION</text>
      <text class="note" x="58" y="997">Drawing generated from source fingerprint ${esc(text(drawing.sourceFingerprint))}. Manual drawing layout cannot alter the fingerprinted electrical source.</text>
      <text class="note" x="58" y="1016">Cable/protection labels are shown only when present in the detailed electrical result. No missing code value is fabricated.</text>
      <text class="note" x="58" y="1035">Screen colors distinguish DC/AC paths; monochrome output remains readable using labels and line styles.</text>
      <line x1="58" y1="1060" x2="965" y2="1060" stroke="#cad3d6"/><text class="title-label" x="60" y="1078">REV</text><text class="title-label" x="130" y="1078">DATE</text><text class="title-label" x="260" y="1078">DESCRIPTION</text><text class="title-label" x="720" y="1078">DESIGNER</text><text class="title-label" x="840" y="1078">REVIEWER</text>
      <text class="title-value" x="60" y="1102">${esc(drawing.metadata.revision)}</text><text class="title-value" x="130" y="1102">${esc(date)}</text><text class="title-value" x="260" y="1102">Auto-generated preliminary drawing</text><text class="title-value" x="720" y="1102">${esc(drawing.metadata.designer)}</text><text class="title-value" x="840" y="1102">${esc(drawing.metadata.reviewer)}</text>
      <rect x="990" y="950" width="640" height="195" fill="#fff" stroke="#17252a" stroke-width="1.4"/>
      <line x1="990" y1="1003" x2="1630" y2="1003" stroke="#17252a"/><line x1="990" y1="1053" x2="1630" y2="1053" stroke="#17252a"/><line x1="990" y1="1102" x2="1630" y2="1102" stroke="#17252a"/>
      <line x1="1290" y1="1053" x2="1290" y2="1145" stroke="#17252a"/><line x1="1455" y1="1053" x2="1455" y2="1145" stroke="#17252a"/>
      <text class="title-label" x="1003" y="970">PROJECT / SITE</text><text class="title-value" x="1003" y="990">${esc(text(p.name,"Untitled Project"))} · ${esc(text(p.customer,"Customer NOT SPECIFIED"))}</text>
      <text class="title-label" x="1003" y="1022">DRAWING TITLE</text><text class="title-value" x="1003" y="1043">SINGLE-LINE DIAGRAM · E-401</text>
      <text class="title-label" x="1003" y="1071">STATUS</text><text class="title-value" x="1003" y="1092">PRELIMINARY · NOT FOR CONSTRUCTION</text>
      <text class="title-label" x="1303" y="1071">SHEET / SCALE</text><text class="title-value" x="1303" y="1092">A3 LANDSCAPE · NTS</text>
      <text class="title-label" x="1468" y="1071">REV / DATE</text><text class="title-value" x="1468" y="1092">${esc(drawing.metadata.revision)} · ${esc(date)}</text>
      <text class="title-label" x="1003" y="1120">SOLAR VERSION / PROJECT SCHEMA</text><text class="title-value" x="1003" y="1139">v2.2 UX + Drawings · calculation engine v2.1 · schema 2.0</text>
      <text class="title-label" x="1303" y="1120">RULE PACK</text><text class="title-value" x="1303" y="1139">${esc(text(rules.packId))}</text>
      <text class="title-label" x="1468" y="1120">SOURCE</text><text class="title-value" x="1468" y="1139">${esc(String(drawing.sourceFingerprint||"NOT SPECIFIED").slice(0,22))}</text>
    </svg>`;
  }

  function invertersCount(model) { return (model?.inverters || []).length; }

  function addAnnotation(drawing, type = "note", payload = {}) {
    if (!drawing) return null;
    const allowed = new Set(["note","label","arrow","cloud","detail"]);
    const normalized = allowed.has(type) ? type : "note";
    const item = {
      id: payload.id || `ANN-${fnv1a(`${Date.now()}-${Math.random()}-${drawing.annotations.length}`)}`,
      type: normalized, bound:false, layer: "Notes", x:n(payload.x,700), y:n(payload.y,700),
      text:String(payload.text || (normalized === "cloud" ? "REVISION" : "Drawing note")), style:{ ...(payload.style||{}) }
    };
    drawing.annotations.push(item);
    drawing.drawingFingerprint = calculateDrawingFingerprint(drawing);
    return item;
  }

  function autoLayout(drawing, electricalModel) {
    return createDrawingModel(electricalModel, { mode:drawing?.mode, profile:drawing?.profile, previous:{ annotations:drawing?.annotations||[], layers:drawing?.layers||[] } });
  }

  function buildDxf(drawing, electricalModel) {
    if (!drawing || !electricalModel) return null;
    const lines = [];
    const push = (...parts) => lines.push(...parts.map(String));
    push("0","SECTION","2","HEADER","9","$ACADVER","1","AC1015","0","ENDSEC");
    push("0","SECTION","2","TABLES","0","TABLE","2","LAYER","100","AcDbSymbolTable","70",String(LAYERS.length));
    const layerMap = {"Electrical":"ELECTRICAL","Labels":"LABELS","Notes":"NOTES","Title Block":"TITLE_BLOCK","Optional Details":"OPTIONAL_DETAILS"};
    LAYERS.forEach((name,index)=>push("0","LAYER","100","AcDbSymbolTableRecord","100","AcDbLayerTableRecord","2",layerMap[name],"70","0","62",String(index+1),"6","CONTINUOUS"));
    push("0","ENDTAB","0","ENDSEC","0","SECTION","2","ENTITIES");
    function y(value){ return SHEET.height - Number(value); }
    drawing.edges.forEach(edge => {
      const from=nodeById(drawing,edge.from),to=nodeById(drawing,edge.to); if(!from||!to)return;
      const sx=from.x+(from.w||100), sy=from.y+(from.h||60)/2, ex=to.x, ey=to.y+(to.h||60)/2, mid=(sx+ex)/2;
      [[sx,sy,mid,sy],[mid,sy,mid,ey],[mid,ey,ex,ey]].forEach(seg=>push("0","LINE","100","AcDbEntity","8","ELECTRICAL","100","AcDbLine","10",seg[0],"20",y(seg[1]),"30","0","11",seg[2],"21",y(seg[3]),"31","0"));
      const label=edgeLabel(edge,{conductorMaterial:electricalModel.engineeringRules?.conductorMaterial});
      if(label) push("0","TEXT","100","AcDbEntity","8","LABELS","100","AcDbText","10",mid,"20",y((sy+ey)/2-8),"30","0","40","7","1",label);
    });
    drawing.nodes.filter(node=>!node.hidden).forEach(node => {
      const w=node.w||100,h=node.h||60,x=node.x,yy=node.y;
      push("0","LWPOLYLINE","100","AcDbEntity","8","ELECTRICAL","100","AcDbPolyline","90","4","70","1",
        "10",x,"20",y(yy),"10",x+w,"20",y(yy),"10",x+w,"20",y(yy+h),"10",x,"20",y(yy+h));
      push("0","TEXT","100","AcDbEntity","8","LABELS","100","AcDbText","10",x+5,"20",y(yy+18),"30","0","40","8","1",String(node.displayTag||node.tag||"NOT SPECIFIED"));
    });
    drawing.annotations.forEach(item=>push("0","TEXT","100","AcDbEntity","8","NOTES","100","AcDbText","10",n(item.x,0),"20",y(n(item.y,0)),"30","0","40","8","1",String(item.text||"")));
    // Sheet/title boundary so CAD viewers retain the intended drawing extents/layer semantics.
    push("0","LWPOLYLINE","100","AcDbEntity","8","TITLE_BLOCK","100","AcDbPolyline","90","4","70","1","10","18","20",y(18),"10",String(SHEET.width-18),"20",y(18),"10",String(SHEET.width-18),"20",y(SHEET.height-18),"10","18","20",y(SHEET.height-18));
    push("0","TEXT","100","AcDbEntity","8","TITLE_BLOCK","100","AcDbText","10","995","20",y(1040),"30","0","40","9","1",`E-401 PRELIMINARY SLD SOURCE ${drawing.sourceFingerprint||"NOT SPECIFIED"}`);
    push("0","ENDSEC","0","EOF");
    return lines.join("\r\n") + "\r\n";
  }

  const API = { VERSION, SHEET, LAYERS, createDrawingModel, calculateDrawingFingerprint, preflightDrawing, renderSvg, addAnnotation, autoLayout, buildDxf, stableStringify, fnv1a };
  global.SolarPVSLDDrawing = Object.freeze(API);
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
