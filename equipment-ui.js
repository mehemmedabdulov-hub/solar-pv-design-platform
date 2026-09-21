(function (global) {
  "use strict";

  const byId=id=>typeof document!=="undefined"?document.getElementById(id):null;
  let defaults={module:null,inverter:null};

  function moveLocationIntoProjectStage(){
    const project=byId("projectInfoCard"),site=byId("siteDesignCard");if(!project||!site||byId("solarProjectLocationBlock"))return;
    const grid=site.querySelector(":scope > .grid"),buttons=site.querySelector(":scope > .location-buttons");if(!grid)return;
    const block=document.createElement("section");block.id="solarProjectLocationBlock";block.className="solar-project-location-block";
    block.innerHTML='<div class="solar-subsection-heading"><span>Location</span><strong>Find or confirm the project site</strong><small>Use coordinates or GPS. The same location values feed every retained calculation and resource lookup.</small></div>';
    block.appendChild(grid);if(buttons)block.appendChild(buttons);project.appendChild(block);
  }

  function decorateInstallations(){
    const copy={
      "Rooftop Solar":"PV on one or more roof surfaces with setbacks and obstacles.",
      "Ground-Mounted Solar":"Rows on land blocks with pitch, clearance and slope assumptions.",
      "Solar Carport":"PV canopy zones with vehicle and column-clearance constraints."
    };
    document.querySelectorAll(".installation-option").forEach(label=>{
      const radio=label.querySelector('input[name="installation"]');if(!radio||label.querySelector(".solar-install-copy"))return;
      const span=document.createElement("span");span.className="solar-install-copy";span.textContent=copy[radio.value]||"Installation workflow";label.appendChild(span);
    });
  }

  function addSiteInstructions(){
    const site=byId("siteDesignCard");if(!site||byId("solarSiteInstructions"))return;
    const el=document.createElement("aside");el.id="solarSiteInstructions";el.className="solar-site-instructions";
    el.innerHTML='<span>Site & Geometry</span><strong>What to do</strong><ol><li>Confirm the site location in Stage 1.</li><li>Draw the usable roof / land / canopy surface.</li><li>Add obstacles only when needed.</li></ol><div id="solarSiteNextAction">Next required action: draw one design surface.</div>';
    const tools=site.querySelector(".design-tools");if(tools)tools.before(el);else site.prepend(el);
  }

  function equipmentRecord(kind,id){
    try{
      const list=kind==="module"?(typeof MODULE_DATABASE!=="undefined"?MODULE_DATABASE:[]):(typeof INVERTER_DATABASE!=="undefined"?INVERTER_DATABASE:[]);
      return list.find(item=>item.id===id)||null;
    }catch(_){return null;}
  }
  function recordLine(kind,record,option){
    if(!record)return {title:option?.textContent||"Equipment",meta:"Existing equipment record",id:option?.value||""};
    if(kind==="module")return {title:`${record.manufacturer} ${record.model} ${record.variant||""}`.trim(),meta:`${record.powerW} W · ${record.efficiencyPct}% efficiency · ${record.widthM} × ${record.heightM} m`,id:record.id};
    return {title:`${record.manufacturer} ${record.model}`.trim(),meta:`${record.acPowerKW} kW AC · ${record.maxEfficiencyPct}% max efficiency · ${record.mpptCount} MPPT`,id:record.id};
  }
  function fireSelect(select,value){
    if(!select)return;select.value=value;select.dispatchEvent(new Event("change",{bubbles:true}));select.dispatchEvent(new Event("input",{bubbles:true}));
    try{if(typeof updateEquipmentDisplays==="function")updateEquipmentDisplays();}catch(_){}
    global.SolarPVWorkflow?.scheduleRefresh?.(20);
  }
  function buildPicker(kind,select){
    const wrap=document.createElement("section");wrap.className="solar-equipment-picker";wrap.dataset.kind=kind;
    const label=kind==="module"?"Solar module":"Inverter";
    wrap.innerHTML=`<div class="solar-equipment-picker-head"><div><span>${label}</span><strong id="solar${kind}Selected">Selected equipment</strong></div><input type="search" id="solar${kind}Search" placeholder="Search manufacturer or model" aria-label="Search ${label.toLowerCase()}"></div><div class="solar-equipment-options" id="solar${kind}Options"></div>`;
    const search=wrap.querySelector("input"),optionsHost=wrap.querySelector(".solar-equipment-options"),selected=wrap.querySelector("strong");
    function render(){
      const q=(search.value||"").trim().toLowerCase();const options=[...select.options].filter(o=>o.value);const rows=options.map(o=>({option:o,record:equipmentRecord(kind,o.value)})).filter(row=>!q||`${row.option.textContent} ${row.record?.manufacturer||""} ${row.record?.model||""}`.toLowerCase().includes(q)).slice(0,8);
      optionsHost.innerHTML=rows.map(row=>{const info=recordLine(kind,row.record,row.option),active=select.value===info.id;return `<button type="button" class="solar-equipment-card${active?" active":""}" data-equipment-id="${info.id}"><strong>${escapeHtml(info.title)}</strong><small>${escapeHtml(info.meta)}</small>${active?'<em>Selected</em>':''}</button>`;}).join("")||'<div class="solar-equipment-empty">No equipment records match this search.</div>';
      optionsHost.querySelectorAll("[data-equipment-id]").forEach(btn=>btn.addEventListener("click",()=>{fireSelect(select,btn.dataset.equipmentId);render();syncSelected();}));
    }
    function syncSelected(){const option=select.selectedOptions?.[0],record=equipmentRecord(kind,select.value),info=recordLine(kind,record,option);selected.textContent=info.title;render();}
    search.addEventListener("input",render);select.addEventListener("change",syncSelected);syncSelected();return wrap;
  }
  function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}

  function buildEquipmentWorkspace(){
    const card=byId("equipmentCard"),moduleSelect=byId("panel"),inverterSelect=byId("inverter");if(!card||!moduleSelect||!inverterSelect||byId("solarEquipmentWorkspace"))return;
    defaults={module:moduleSelect.value,inverter:inverterSelect.value};
    const workspace=document.createElement("section");workspace.id="solarEquipmentWorkspace";workspace.className="solar-equipment-workspace";
    const head=document.createElement("div");head.className="solar-equipment-workspace-head";head.innerHTML='<div><span>Recommended defaults + manual choice</span><strong>Choose equipment</strong><small>The picker drives the same tested equipment selects used by the v2.1 electrical engine.</small></div><button type="button" id="solarUseRecommendedEquipment">Use Recommended Defaults</button>';
    const grid=document.createElement("div");grid.className="solar-equipment-picker-grid";grid.append(buildPicker("module",moduleSelect),buildPicker("inverter",inverterSelect));workspace.append(head,grid);
    card.querySelector(".grid")?.before(workspace);
    byId("solarUseRecommendedEquipment")?.addEventListener("click",()=>{fireSelect(moduleSelect,defaults.module);fireSelect(inverterSelect,defaults.inverter);global.SolarPVNotifications?.toast?.("Restored the repository's tested default module and inverter selections.",{type:"success"});});
    card.querySelector(".grid")?.classList.add("solar-legacy-equipment-selects");
  }

  function updateSiteStatus(){
    const el=byId("solarSiteNextAction");if(!el)return;let count=0;try{count=roofFaces.length;}catch(_){}el.textContent=count?`${count} design surface${count===1?"":"s"} ready. Review exact buildable geometry and continue to PV System.`:"Next required action: draw one design surface on the map.";
  }

  function bootstrap(){
    if(typeof document==="undefined")return;moveLocationIntoProjectStage();decorateInstallations();addSiteInstructions();buildEquipmentWorkspace();updateSiteStatus();
    global.addEventListener?.("solar:stagechange",()=>setTimeout(updateSiteStatus,30));
    document.addEventListener("change",event=>{if(event.target?.name==="installation")decorateInstallations();});
    try{["draw:created","draw:edited","draw:deleted"].forEach(name=>map.on(name,()=>setTimeout(updateSiteStatus,20)));}catch(_){}
  }

  const API={bootstrap,moveLocationIntoProjectStage,buildEquipmentWorkspace};
  global.SolarPVEquipmentUI=API;
  if(typeof module!=="undefined"&&module.exports)module.exports={};
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
})(typeof globalThis!=="undefined"?globalThis:this);
