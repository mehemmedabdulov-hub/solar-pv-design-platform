(function (global) {
  "use strict";

  const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const byId = id => typeof document !== "undefined" ? document.getElementById(id) : null;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const csv = value => { const text=String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text; };
  const safeName = value => String(value || "Solar-PV-Project").trim().replace(/[^a-z0-9._-]+/gi,"-").replace(/^-+|-+$/g,"") || "Solar-PV-Project";

  function getText(id, fallback = "-") { const value=byId(id)?.textContent?.trim(); return value || fallback; }
  function getElectricalModel() {
    const fromEditor = global.SolarPVSLDEditor?.getElectricalModel?.();
    if (fromEditor) return fromEditor;
    try { return typeof buildElectricalObjectModel === "function" ? buildElectricalObjectModel() : null; } catch (_) { return null; }
  }
  function currentSnapshot() { try { return typeof captureProjectSnapshot === "function" ? captureProjectSnapshot() : null; } catch (_) { return null; } }
  function validationLabel() { return byId("validationSummary")?.textContent?.trim() || byId("validationStatus")?.textContent?.trim() || "Not validated"; }

  function buildDashboard() {
    if (typeof document === "undefined" || byId("solarReviewDashboard")) return;
    const results = byId("results"); if (!results) return;
    const section = document.createElement("section"); section.id="solarReviewDashboard"; section.className="solar-review-dashboard";
    section.innerHTML = `
      <div class="solar-review-head"><div><span class="eyebrow">Review &amp; Export</span><h2>Project design summary</h2><p>Core engineering results first. Expand the retained v2.1 cards below for full detail.</p></div><span id="solarReviewValidation" class="solar-review-validation">Validation pending</span></div>
      <div class="solar-review-kpis">
        <article><span>PV DC capacity</span><strong id="solarKpiDc">-</strong></article>
        <article><span>Modules</span><strong id="solarKpiModules">-</strong></article>
        <article><span>Annual AC energy</span><strong id="solarKpiEnergy">-</strong></article>
        <article><span>Specific yield</span><strong id="solarKpiYield">-</strong></article>
        <article><span>Performance ratio</span><strong id="solarKpiPr">-</strong></article>
        <article><span>Inverters</span><strong id="solarKpiInverters">-</strong></article>
        <article><span>AC capacity</span><strong id="solarKpiAc">-</strong></article>
        <article><span>DC / AC ratio</span><strong id="solarKpiRatio">-</strong></article>
      </div>
      <div class="solar-review-actions" aria-label="Project exports">
        <button type="button" id="solarReviewSave">Save / Revision</button>
        <button type="button" id="solarReviewValidate">Validate</button>
        <button type="button" id="solarReviewReport">Download Report</button>
        <button type="button" id="solarReviewSld">Download SLD</button>
        <button type="button" id="solarReviewBom">Download BOM</button>
        <button type="button" id="solarReviewPack" class="primary">Download Engineering Pack</button>
        <button type="button" id="solarReviewProject">Export Project JSON</button>
      </div>
      <div id="solarReviewExportState" class="solar-review-export-state">Preliminary engineering outputs remain subject to project validation and independent review.</div>`;
    results.before(section);
    byId("solarReviewSave")?.addEventListener("click",()=>{try{saveProjectToBrowser();}catch(err){notify(err.message,"error");}});
    byId("solarReviewValidate")?.addEventListener("click",()=>{try{runRooftopValidation(true);}catch(err){notify(err.message,"error");}});
    byId("solarReviewReport")?.addEventListener("click",()=>{try{exportEngineeringReport();}catch(err){notify(err.message,"error");}});
    byId("solarReviewSld")?.addEventListener("click",()=>global.SolarPVSLDEditor?.exportSvg?.());
    byId("solarReviewBom")?.addEventListener("click",()=>{try{exportBomCsv();}catch(err){notify(err.message,"error");}});
    byId("solarReviewPack")?.addEventListener("click",()=>exportEngineeringPack());
    byId("solarReviewProject")?.addEventListener("click",()=>{try{exportProjectJson();}catch(err){notify(err.message,"error");}});
    updateDashboard();
  }
  function notify(message,type="info") { global.SolarPVNotifications?.toast?.(message,{type}); }
  function updateDashboard() {
    if (!byId("solarReviewDashboard")) return;
    byId("solarKpiDc").textContent=getText("dcCapacity");
    byId("solarKpiModules").textContent=getText("panelCount");
    byId("solarKpiEnergy").textContent=getText("annualEnergy");
    byId("solarKpiYield").textContent=getText("resultSpecificYield");
    byId("solarKpiPr").textContent=getText("resultPerformanceRatio");
    byId("solarKpiInverters").textContent=getText("resultInverterQuantity");
    const model=getElectricalModel(); const ac=(model?.inverters||[]).reduce((sum,item)=>sum+Number(item.acKW||0),0);
    byId("solarKpiAc").textContent=ac>0?`${ac.toFixed(1)} kW` : "-";
    byId("solarKpiRatio").textContent=getText("dcAcRatio");
    const status=byId("solarReviewValidation"); if(status){status.textContent=validationLabel();status.classList.toggle("ready",/pass|ready|valid/i.test(status.textContent));}
  }

  function readPolygonPoints(layer) {
    try { return typeof getPolygonPoints === "function" ? getPolygonPoints(layer).map(p=>({lat:Number(p.lat),lng:Number(p.lng)})) : []; } catch (_) { return []; }
  }
  function siteGeometryData() {
    try {
      const surfaces=(typeof roofFaces!=="undefined"?roofFaces:[]).map(face=>({ id:face.roofFaceId,name:face.roofFaceName,kind:face.surfaceKind,points:readPolygonPoints(face) }));
      const panels=(typeof placedPanels!=="undefined"?placedPanels:[]).map(panel=>({ id:`P-${panel.panelNumber}`,surfaceId:panel.panelRoofFaceId,stringId:panel.stringId||null,points:readPolygonPoints(panel) }));
      return {surfaces,panels};
    } catch (_) { return {surfaces:[],panels:[]}; }
  }
  function geometrySvg(data, mode="site") {
    const all=[...data.surfaces.flatMap(s=>s.points),...data.panels.flatMap(p=>p.points)];
    if(!all.length)return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700"><rect width="1200" height="700" fill="white"/><text x="60" y="100" font-family="Arial" font-size="24">Geometry not available in the current project snapshot.</text></svg>`;
    const minLat=Math.min(...all.map(p=>p.lat)),maxLat=Math.max(...all.map(p=>p.lat)),minLng=Math.min(...all.map(p=>p.lng)),maxLng=Math.max(...all.map(p=>p.lng));
    const pad=70,w=1200,h=700,spanLat=Math.max(maxLat-minLat,1e-8),spanLng=Math.max(maxLng-minLng,1e-8);
    const xy=p=>({x:pad+(p.lng-minLng)/spanLng*(w-pad*2),y:h-pad-(p.lat-minLat)/spanLat*(h-pad*2)});
    const poly=points=>points.map(p=>{const q=xy(p);return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;}).join(" ");
    const surfaceSvg=data.surfaces.map(s=>`<polygon points="${poly(s.points)}" fill="#edf7f2" stroke="#0f766e" stroke-width="3"/><text x="${xy(s.points[0]||all[0]).x}" y="${xy(s.points[0]||all[0]).y-8}" font-family="Arial" font-size="14" fill="#0f5b48">${esc(s.name||s.id)}</text>`).join("");
    const panelSvg=data.panels.map(p=>`<polygon points="${poly(p.points)}" fill="#2f5d73" stroke="#173c4d" stroke-width="1"/><title>${esc(p.id)}${p.stringId?` · ${esc(p.stringId)}`:""}</title>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img"><rect width="${w}" height="${h}" fill="white"/><text x="55" y="38" font-family="Arial" font-size="20" font-weight="700" fill="#17343c">${mode==="array"?"PV-201 ARRAY LAYOUT":"PV-101 SITE PLAN"}</text>${surfaceSvg}${panelSvg}<text x="55" y="675" font-family="Arial" font-size="12" fill="#64748b">Preliminary schematic export from current project geometry · NTS</text></svg>`;
  }
  function stringCsv(model) {
    const rows=[["String ID","Sub-array","Inverter","MPPT","Modules","DC kW","Voc cold V","Vmp STC V"]];
    (model?.strings||[]).forEach(s=>rows.push([s.id,s.subArrayId,s.inverterNumber,s.mpptNumber,s.moduleCount,s.powerKW ?? s.dcKW,s.vocColdV,s.vmpStcV]));
    return rows.map(row=>row.map(csv).join(",")).join("\r\n")+"\r\n";
  }
  function bomCsv(model) {
    const rows=[["Category","Item","Specification","Quantity","Unit"]];
    (model?.bom||[]).forEach(item=>rows.push([item.category,item.item,item.spec,item.quantity,item.unit]));
    return rows.map(row=>row.map(csv).join(",")).join("\r\n")+"\r\n";
  }
  function coverHtml(model,snapshot) {
    const p=model?.project||{}; const dc=(model?.subArrays||[]).reduce((sum,a)=>sum+Number(a.dcKW||0),0),ac=(model?.inverters||[]).reduce((sum,a)=>sum+Number(a.acKW||0),0);
    return `<!doctype html><meta charset="utf-8"><title>G-001 Project Summary</title><style>body{font:14px Arial;margin:40px;color:#1f2937}h1{color:#12372a;border-bottom:3px solid #12372a;padding-bottom:10px}table{border-collapse:collapse;width:100%;max-width:900px}th,td{border:1px solid #cbd5e1;padding:9px;text-align:left}th{background:#f1f5f9}.warn{border-left:5px solid #d97706;background:#fff7ed;padding:12px;margin:20px 0}</style><h1>G-001 · Preliminary Engineering Pack</h1><p><strong>${esc(p.name||"Untitled Project")}</strong> · ${esc(p.customer||"Customer NOT SPECIFIED")}</p><div class="warn">PRELIMINARY · NOT FOR CONSTRUCTION. Final jurisdictional compliance and independent engineering review are outside this generated pack unless separately evidenced.</div><table><tr><th>Project ID</th><td>${esc(p.id)}</td></tr><tr><th>Revision</th><td>${esc(p.revisionNumber)}</td></tr><tr><th>Source fingerprint</th><td>${esc(model.sourceFingerprint)}</td></tr><tr><th>Project schema</th><td>${esc(snapshot?.schemaVersion||"2.0")}</td></tr><tr><th>DC capacity</th><td>${dc.toFixed(2)} kWp</td></tr><tr><th>AC capacity</th><td>${ac.toFixed(2)} kW</td></tr><tr><th>Modules</th><td>${(model.subArrays||[]).reduce((s,a)=>s+Number(a.moduleCount||0),0)}</td></tr><tr><th>Strings / inverters</th><td>${(model.strings||[]).length} / ${(model.inverters||[]).length}</td></tr></table><h2>Drawing index</h2><ol><li>G-001 Cover / Project Summary</li><li>PV-101 Site Plan</li><li>PV-201 Array Layout</li><li>E-301 String / MPPT Plan</li><li>E-401 Single-Line Diagram</li><li>E-501 Electrical Schedule / BOM</li></ol>`;
  }
  function printPackHtml(model, snapshot, siteSvg, arraySvg, sldSvg, strings, bom) {
    const sheet=(id,title,content)=>`<section class="sheet" data-sheet="${id}" data-source-fingerprint="${esc(model.sourceFingerprint)}"><header><strong>${id}</strong><span>${esc(title)}</span><small>Source ${esc(model.sourceFingerprint)}</small></header>${content}<footer>PRELIMINARY · NOT FOR CONSTRUCTION · Solar UX/Drawings v2.2 · calculation engine v2.1 · project schema ${esc(snapshot?.schemaVersion||"2.0")}</footer></section>`;
    const table=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const stringRows=(model.strings||[]).map(s=>[s.id,s.subArrayId,`INV-${s.inverterNumber}`,`MPPT-${s.mpptNumber}`,s.moduleCount,Number(s.powerKW ?? s.dcKW ?? 0).toFixed(2)]);
    const bomRows=(model.bom||[]).map(b=>[b.category,b.item,b.spec,b.quantity,b.unit]);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Preliminary Engineering Pack</title><style>@page{size:A3 landscape;margin:10mm}body{font:12px Arial;color:#1f2937;margin:0}.sheet{page-break-after:always;min-height:1080px;padding:24px;box-sizing:border-box}.sheet>header{display:flex;gap:18px;border-bottom:2px solid #17343c;padding-bottom:8px;margin-bottom:14px}.sheet>header small{margin-left:auto}.sheet>footer{margin-top:10px;border-top:1px solid #94a3b8;padding-top:7px;color:#9a3412}svg{max-width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:6px}th{background:#f1f5f9}</style></head><body>${sheet("G-001","Cover / Project Summary",coverHtml(model,snapshot).replace(/^.*?<h1>/s,"<h1>").replace(/<\/body>.*$/s,""))}${sheet("PV-101","Site Plan",siteSvg)}${sheet("PV-201","Array Layout",arraySvg)}${sheet("E-301","String / MPPT Plan",table(["String","Sub-array","Inverter","MPPT","Modules","DC kW"],stringRows))}${sheet("E-401","Single-Line Diagram",sldSvg)}${sheet("E-501","Electrical Schedule / BOM",table(["Category","Item","Specification","Qty","Unit"],bomRows))}</body></html>`;
  }

  function crc32(bytes) {
    let crc=0xffffffff;
    for(let i=0;i<bytes.length;i++){crc^=bytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return (crc^0xffffffff)>>>0;
  }
  function u16(n){return Uint8Array.from([n&255,(n>>>8)&255]);}
  function u32(n){return Uint8Array.from([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
  function concat(parts){const len=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(len);let at=0;parts.forEach(p=>{out.set(p,at);at+=p.length;});return out;}
  function bytes(value){return value instanceof Uint8Array?value:enc.encode(String(value));}
  function buildStoreZip(entries) {
    if(!enc)throw new Error("TextEncoder is required for Engineering Pack ZIP export.");
    const locals=[],centrals=[];let offset=0;
    entries.forEach(entry=>{
      const name=bytes(entry.name),data=bytes(entry.data),crc=crc32(data);
      const local=concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
      locals.push(local);
      const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
      centrals.push(central);offset+=local.length;
    });
    const centralSize=centrals.reduce((s,p)=>s+p.length,0),end=concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralSize),u32(offset),u16(0)]);
    return concat([...locals,...centrals,end]);
  }

  function buildEngineeringPackEntries(model, snapshot) {
    if(!model)throw new Error("A current electrical object model is required.");
    const source=model.sourceFingerprint||"NOT-SPECIFIED"; const snapshotFingerprint=snapshot?.stateFingerprint||"NOT-SPECIFIED"; const geom=siteGeometryData(),siteSvg=geometrySvg(geom,"site"),arraySvg=geometrySvg(geom,"array");
    const existingDrawing=global.SolarPVSLDEditor?.getDrawing?.();
    const drawing=existingDrawing?.sourceFingerprint===source ? existingDrawing : global.SolarPVSLDDrawing?.createDrawingModel?.(model,{mode:existingDrawing?.mode||"compact",profile:existingDrawing?.profile||"IEC"});
    const sldSvg=drawing&&global.SolarPVSLDDrawing?global.SolarPVSLDDrawing.renderSvg(drawing,model):"";
    const sldPreflight=drawing&&global.SolarPVSLDDrawing?global.SolarPVSLDDrawing.preflightDrawing(drawing,model):{ok:false,errors:["SLD drawing unavailable"],warnings:[]};
    const strings=stringCsv(model),bom=bomCsv(model),print=printPackHtml(model,snapshot,siteSvg,arraySvg,sldSvg,strings,bom);
    const manifest={packVersion:"2.2.0",status:"PRELIMINARY - NOT FOR CONSTRUCTION",project:model.project,sourceFingerprint:source,projectStateFingerprint:snapshotFingerprint,projectSchema:snapshot?.schemaVersion||"2.0",calculationEngineVersion:"2.1",sldPreflight,generatedAt:new Date().toISOString(),sheets:["G-001","PV-101","PV-201","E-301","E-401","E-501"],files:["README.txt","G-001_Project_Summary.html","PV-101_Site_Plan.svg","PV-201_Array_Layout.svg","E-301_String_MPPT.csv","E-401_Single_Line_Diagram.svg","E-501_BOM.csv","Engineering_Pack_Print.html"]};
    return [
      {name:"manifest.json",data:JSON.stringify(manifest,null,2)},
      {name:"README.txt",data:`SOLAR v2.2 PRELIMINARY ENGINEERING PACK\r\nElectrical source fingerprint: ${source}\r\nProject state fingerprint: ${snapshotFingerprint}\r\nSLD preflight: ${sldPreflight.errors.length} error(s), ${sldPreflight.warnings.length} warning(s)\r\nAll sheets in this archive were generated together from the same current project/electrical snapshot.\r\nPRELIMINARY - NOT FOR CONSTRUCTION. Independent engineering and jurisdictional review remain required.\r\n`},
      {name:"G-001_Project_Summary.html",data:coverHtml(model,snapshot)},
      {name:"PV-101_Site_Plan.svg",data:siteSvg},
      {name:"PV-201_Array_Layout.svg",data:arraySvg},
      {name:"E-301_String_MPPT.csv",data:strings},
      {name:"E-401_Single_Line_Diagram.svg",data:sldSvg},
      {name:"E-501_BOM.csv",data:bom},
      {name:"Engineering_Pack_Print.html",data:print}
    ];
  }

  function saveBlob(name,blob){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportEngineeringPack() {
    let model=getElectricalModel();
    try {
      if(typeof updateEngineeringDeliverables==="function") model=updateEngineeringDeliverables(false,{force:true})||model;
    } catch (_) {}
    if(!model){notify("Generate and refresh the electrical design before creating the Engineering Pack.","warning");return null;}
    if(global.SolarPVSLDEditor&&!global.SolarPVSLDEditor.isCurrent())global.SolarPVSLDEditor.setElectricalModel(model,{force:true});
    const snapshot=currentSnapshot(); const entries=buildEngineeringPackEntries(model,snapshot); const zip=buildStoreZip(entries);
    saveBlob(`${safeName(model.project?.name)}_Preliminary_Engineering_Pack.zip`,new Blob([zip],{type:"application/zip"}));
    const state=byId("solarReviewExportState");if(state)state.textContent=`Engineering Pack generated from source ${model.sourceFingerprint}. ${entries.length} coordinated files included.`;
    notify("Preliminary Engineering Pack exported as a coordinated ZIP.","success");return zip;
  }

  function bootstrap(){if(typeof document==="undefined")return;buildDashboard();updateDashboard();
    global.addEventListener?.("solar:stagechange",()=>setTimeout(updateDashboard,50));
    global.addEventListener?.("solar:sldrefresh",updateDashboard);
    global.addEventListener?.("solar:panelchange",updateDashboard);
    const results=byId("results");if(results&&typeof MutationObserver!=="undefined")new MutationObserver(()=>updateDashboard()).observe(results,{subtree:true,childList:true,characterData:true});
  }

  const API={bootstrap,updateDashboard,refresh:updateDashboard,buildStoreZip,buildEngineeringPackEntries,exportEngineeringPack,geometrySvg,stringCsv,bomCsv};
  global.SolarPVResultsUI=API;
  if(typeof module!=="undefined"&&module.exports)module.exports={buildStoreZip,crc32,stringCsv,bomCsv};
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
})(typeof globalThis!=="undefined"?globalThis:this);
