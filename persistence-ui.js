(function (global) {
  "use strict";

  const PREFIX = "solarPvDesignPlatform.v2.2.workingDraft.";
  const DEBOUNCE_MS = 1200;
  let timer = null;
  let saving = false;
  let initialized = false;
  let lastDraftFingerprint = null;
  let recoveryCandidate = null;
  const byId = id => typeof document !== "undefined" ? document.getElementById(id) : null;

  function capture() {
    try { return typeof captureProjectSnapshot === "function" ? captureProjectSnapshot({ savedAt: new Date().toISOString() }) : null; }
    catch (_) { return null; }
  }
  function keyFor(snapshot) { return `${PREFIX}${snapshot?.projectId || "working-project"}`; }
  function setState(text, kind = "neutral") {
    const el=byId("solarDraftState"); if(!el)return; el.textContent=text; el.dataset.state=kind;
  }
  function ensureStatus() {
    if(typeof document==="undefined"||byId("solarDraftState"))return;
    const host=document.querySelector(".topbar-status"); if(!host)return;
    const el=document.createElement("span");el.id="solarDraftState";el.className="solar-draft-state";el.textContent="Draft idle";host.prepend(el);
  }
  function saveDraft() {
    if(typeof localStorage==="undefined"||saving)return null;
    const snapshot=capture(); if(!snapshot)return null;
    saving=true;setState("Saving draft…","saving");
    try {
      const record={draftVersion:"2.2",savedAt:new Date().toISOString(),stateFingerprint:snapshot.stateFingerprint,projectId:snapshot.projectId,snapshot};
      localStorage.setItem(keyFor(snapshot),JSON.stringify(record));
      lastDraftFingerprint=snapshot.stateFingerprint;setState("Draft saved","saved");
      global.dispatchEvent?.(new CustomEvent("solar:draftsaved",{detail:{projectId:snapshot.projectId,stateFingerprint:snapshot.stateFingerprint}}));
      return record;
    } catch (error) {
      setState("Draft save failed","error"); global.SolarPVNotifications?.toast?.(`Working draft could not be saved: ${error.message}`,{type:"warning"}); return null;
    } finally { saving=false; }
  }
  function schedule(reason = "Project changed") {
    if(!initialized)return; clearTimeout(timer);setState("Unsaved changes","dirty");
    timer=setTimeout(()=>saveDraft(reason),DEBOUNCE_MS);
  }
  function readDraft(snapshot) {
    if(typeof localStorage==="undefined"||!snapshot)return null;
    try{const record=JSON.parse(localStorage.getItem(keyFor(snapshot))||"null");return record?.snapshot?record:null;}catch(_){return null;}
  }
  function evaluateRecovery() {
    const current=capture(); if(!current)return;
    const record=readDraft(current); if(!record)return;
    if(record.stateFingerprint===current.stateFingerprint){lastDraftFingerprint=record.stateFingerprint;setState("Draft saved","saved");return;}
    // captureProjectSnapshot stamps a fresh savedAt value on every capture, so comparing
    // that timestamp with the draft would make every persisted draft look older. The
    // recovery decision is intentionally fingerprint-based: a differing autosave is
    // offered to the user, never restored silently and never replaces a formal revision.
    recoveryCandidate=record;showRecoveryBanner(record);
  }
  function showRecoveryBanner(record) {
    if(typeof document==="undefined"||byId("solarDraftRecovery"))return;
    const hero=document.querySelector(".workspace-hero");if(!hero)return;
    const el=document.createElement("div");el.id="solarDraftRecovery";el.className="solar-draft-recovery";
    el.innerHTML=`<div><strong>Working draft available</strong><span>An autosaved working copy from ${new Date(record.savedAt).toLocaleString()} differs from the current project state. Formal immutable revisions are unchanged.</span></div><button type="button" id="solarRecoverDraft">Recover draft</button><button type="button" id="solarDismissDraft">Keep current</button>`;
    hero.after(el);
    byId("solarRecoverDraft")?.addEventListener("click",recoverDraft);
    byId("solarDismissDraft")?.addEventListener("click",()=>{el.remove();recoveryCandidate=null;});
  }
  function recoverDraft() {
    if(!recoveryCandidate)return false;
    try {
      if(typeof restoreProjectSnapshot!=="function")throw new Error("Project restore function is unavailable.");
      restoreProjectSnapshot(recoveryCandidate.snapshot);lastDraftFingerprint=recoveryCandidate.stateFingerprint;
      byId("solarDraftRecovery")?.remove();recoveryCandidate=null;setState("Draft recovered","saved");
      global.SolarPVNotifications?.toast?.("Working draft recovered. Commit a formal revision when you are ready.",{type:"success"});return true;
    } catch(error){global.SolarPVNotifications?.toast?.(`Draft recovery failed: ${error.message}`,{type:"error"});return false;}
  }
  function clearDraft() {
    const snapshot=capture();if(!snapshot||typeof localStorage==="undefined")return false;
    try{localStorage.removeItem(keyFor(snapshot));lastDraftFingerprint=null;setState("Draft cleared","neutral");return true;}catch(_){return false;}
  }
  function bindEvents() {
    document.addEventListener("input",event=>{if(event.target?.matches?.("input,select,textarea"))schedule("Field edited");},{passive:true});
    document.addEventListener("change",event=>{if(event.target?.matches?.("input,select,textarea"))schedule("Field changed");},{passive:true});
    global.addEventListener?.("solar:panelchange",()=>schedule("Panel layout edited"));
    global.addEventListener?.("solar:sldrefresh",()=>schedule("Drawing state refreshed"));
    global.addEventListener?.("beforeunload",()=>{if(timer){clearTimeout(timer);saveDraft();}});
  }
  function bootstrap() {
    if(initialized||typeof document==="undefined")return;initialized=true;ensureStatus();bindEvents();
    setTimeout(evaluateRecovery,700);
  }

  const API={bootstrap,schedule,saveDraft,readDraft,recoverDraft,clearDraft,getLastFingerprint:()=>lastDraftFingerprint};
  global.SolarPVPersistenceUI=API;
  if(typeof module!=="undefined"&&module.exports)module.exports={};
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
})(typeof globalThis!=="undefined"?globalThis:this);
