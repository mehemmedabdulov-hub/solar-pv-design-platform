(function (global) {
  "use strict";

  const RELEASE_VERSION = "2.3 Alpha";
  const MODE_KEY = "solarPvDesignPlatform.v2.2.mode";
  const STAGE_KEY = "solarPvDesignPlatform.v2.2.stage";
  const VALID_STATES = new Set(["Current", "Stale", "Missing", "Calculating", "Warning", "Failed"]);
  const STAGES = [
    { id: 1, label: "Project & Location", short: "Project", target: "projectInfoCard" },
    { id: 2, label: "Site Geometry", short: "Site", target: "siteDesignCard" },
    { id: 3, label: "PV System", short: "PV System", target: "equipmentCard" },
    { id: 4, label: "Electrical + SLD", short: "Electrical + SLD", target: "electricalDesignCard" },
    { id: 5, label: "Review & Export", short: "Review & Export", target: "results" }
  ];
  const CARD_STAGE_MAP = {
    projectInfoCard: [1],
    installationCard: [1],
    siteInfoCard: [1],
    resourceDataCard: [1],
    siteDesignCard: [1, 2, 3],
    equipmentCard: [3],
    layoutSettingsCard: [3],
    manualPanelCard: [3],
    generateDesignCard: [3],
    electricalDesignCard: [4],
    detailedElectricalCard: [4],
    deliverablesCard: [4],
    energySimulationCard: [5],
    results: [5],
    validationCard: [5],
    financialCard: [5],
    shading3dCard: [5],
    architectureCard: [5],
    engineeringRulesCard: [5]
  };
  const ENGINEER_ONLY = new Set(["detailedElectricalCard", "financialCard", "shading3dCard", "architectureCard", "engineeringRulesCard"]);
  const scrollByStage = new Map();
  const forced = {
    electrical: { stale: false, reason: "" },
    sld: { stale: false, reason: "" }
  };
  let activeStage = 1;
  let mode = "simple";
  let initialized = false;
  let sticky = null;
  let stepper = null;
  let defaultAdvancedValues = new Map();
  let refreshTimer = null;

  function byId(id) { return typeof document === "undefined" ? null : document.getElementById(id); }
  function finite(value) { return Number.isFinite(Number(value)); }
  function readLocal(key, fallback) {
    try { return global.localStorage?.getItem(key) || fallback; } catch (_) { return fallback; }
  }
  function writeLocal(key, value) {
    try { global.localStorage?.setItem(key, value); } catch (_) { /* storage optional */ }
  }
  function setState(name, state, reason = "") {
    if (!VALID_STATES.has(state)) return;
    forced[name] = { stale: state === "Stale", reason: String(reason || "") };
  }

  function safely(fn, fallback = null) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function projectReady() {
    const lat = byId("latitude")?.value;
    const lng = byId("longitude")?.value;
    const coordinatesValid = finite(lat) && Number(lat) >= -90 && Number(lat) <= 90 && finite(lng) && Number(lng) >= -180 && Number(lng) <= 180;
    const locationConfirmed = !!global.SolarPVAlphaLocationLifecycle?.isConfirmed?.();
    const installationCommitted = !!document.querySelector('input[name="installation"]:checked') && !global.SolarPVAlphaInstallationMigrationState?.isPending?.();
    return coordinatesValid && locationConfirmed && installationCommitted;
  }
  function siteReady() {
    const count = safely(() => roofFaces.length, 0);
    const usable = Number(byId("usableArea")?.value || 0);
    return count > 0 && usable > 0;
  }
  function layoutReady() {
    return !!safely(() => layoutIsCurrent && currentLayoutContext && placedPanels.length > 0, false);
  }
  function electricalReady() {
    if (forced.electrical.stale) return false;
    return !!safely(() => ["pass", "warning"].includes(electricalDesignResult?.status) && Number.isFinite(electricalDesignResult?.inverterQuantity), false);
  }
  function drawingCurrent() {
    if (forced.sld.stale || forced.electrical.stale) return false;
    const electricalFingerprint = safely(() => engineeringDeliverablesResult?.sourceFingerprint, null);
    const drawingFingerprint = global.SolarPVSLDEditor?.getDrawing?.()?.sourceFingerprint || null;
    if (electricalFingerprint && drawingFingerprint) return electricalFingerprint === drawingFingerprint;
    return !!electricalFingerprint;
  }

  function dependencyStatus() {
    const project = projectReady() ? "Current" : "Missing";
    const site = siteReady() ? "Current" : "Missing";
    const layout = layoutReady() ? "Current" : "Missing";
    const electrical = forced.electrical.stale ? "Stale" : electricalReady() ? "Current" : layout === "Current" ? "Missing" : "Missing";
    const sld = forced.sld.stale || forced.electrical.stale ? "Stale" : drawingCurrent() ? "Current" : electrical === "Current" ? "Missing" : "Missing";
    const validationStatus = safely(() => rooftopValidationResult?.overallStatus || rooftopValidationResult?.status, null);
    const review = validationStatus === "fail" ? "Failed" : (validationStatus ? (validationStatus === "pass" ? "Current" : "Warning") : (sld === "Current" ? "Warning" : "Missing"));
    return { project, site, layout, electrical, sld, review };
  }

  function stageStatus(stageId, dep = dependencyStatus()) {
    if (stageId === 1) return dep.project;
    if (stageId === 2) return dep.site;
    if (stageId === 3) return dep.layout;
    if (stageId === 4) {
      if (dep.electrical === "Stale" || dep.sld === "Stale") return "Stale";
      if (dep.electrical === "Current" && dep.sld === "Current") return "Current";
      return dep.electrical === "Failed" ? "Failed" : "Missing";
    }
    return dep.review;
  }

  function statusClass(status) { return String(status || "Missing").toLowerCase(); }

  function renderStepper() {
    if (!stepper) return;
    const dep = dependencyStatus();
    stepper.innerHTML = "";
    STAGES.forEach(stage => {
      const status = stageStatus(stage.id, dep);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `solar-stage-step ${stage.id === activeStage ? "active" : ""} status-${statusClass(status)}`;
      button.dataset.stage = String(stage.id);
      button.setAttribute("aria-current", stage.id === activeStage ? "step" : "false");
      button.setAttribute("aria-label", `${stage.id}. ${stage.label}. ${status}.`);
      button.innerHTML = `<span class="solar-stage-index">${status === "Current" ? "✓" : stage.id}</span><span class="solar-stage-copy"><strong>${stage.short}</strong><small>${status}</small></span>`;
      button.addEventListener("click", () => goToStage(stage.id));
      stepper.appendChild(button);
    });
  }

  function createStepper() {
    const old = document.querySelector(".workflow-rail");
    stepper = document.createElement("nav");
    stepper.id = "solarStageStepper";
    stepper.className = "solar-stage-stepper";
    stepper.setAttribute("aria-label", "Five-stage solar design workflow");
    if (old) {
      old.insertAdjacentElement("afterend", stepper);
      old.classList.add("legacy-workflow-rail");
      old.setAttribute("aria-hidden", "true");
    } else {
      document.querySelector(".workspace-hero")?.insertAdjacentElement("afterend", stepper);
    }
    renderStepper();
  }

  function stageIntroCopy(stageId) {
    const copy = {
      1: ["Project & Location", "Name the project, confirm the site location and choose the installation type. Advanced resource and site metadata remain available without blocking the first decision."],
      2: ["Site Geometry", "Find the site, draw the usable roof/land/canopy area, then add obstacles only when needed. The map is the primary workspace."],
      3: ["PV System", "Choose equipment, generate the deterministic layout, then refine modules directly on the map. Geometry validation remains the same exact approval gate."],
      4: ["Electrical + SLD", "Refresh strings, MPPTs, cables and protection from the existing engine. The drawing is generated from those same design objects, never from free-form CAD values."],
      5: ["Review & Export", "Review capacity, energy, validation and engineering outputs, save a revision, and export coordinated preliminary deliverables from one source fingerprint."]
    };
    return copy[stageId] || copy[1];
  }

  function ensureStageIntro() {
    let intro = byId("solarStageIntro");
    if (!intro) {
      intro = document.createElement("section");
      intro.id = "solarStageIntro";
      intro.className = "solar-stage-intro";
      const firstCard = byId("projectInfoCard");
      firstCard?.insertAdjacentElement("beforebegin", intro);
    }
    const [title, description] = stageIntroCopy(activeStage);
    intro.innerHTML = `<div><span class="solar-stage-kicker">Stage ${activeStage} of 5</span><h2>${title}</h2><p>${description}</p></div><div class="solar-stage-mode-note">${mode === "simple" ? "Simple Mode · recommended controls" : "Engineer Mode · full technical controls"}</div>`;
    intro.dataset.stage = String(activeStage);
  }

  function assignCards() {
    Object.entries(CARD_STAGE_MAP).forEach(([id, stages]) => {
      const card = byId(id);
      if (!card) return;
      card.dataset.solarStages = stages.join(",");
      if (ENGINEER_ONLY.has(id)) card.dataset.engineerOnly = "true";
    });
    // Hide specialist packing-search controls in Simple Mode, but keep their values active.
    ["rotationSearchRange", "rotationSearchStep", "gridAnchorSamples", "edgeAlignmentCount", "layoutSearchMode", "orientationSearchMode"].forEach(id => {
      const group = byId(id)?.closest(".form-group");
      const grid = group?.parentElement;
      if (grid) grid.classList.add("advanced-layout-controls");
    });
    ["groundSiteSlope", "groundMaxSlope", "groundServiceRoadWidth", "groundSpacingRule", "carportCanopyHeight", "carportMinVehicleClearance", "carportColumnClearance", "carportDriveAisleWidth", "carportBayWidth", "carportBayDepth"].forEach(id => byId(id)?.closest(".form-group")?.classList.add("advanced-site-control"));
  }

  function updateCardVisibility() {
    Object.keys(CARD_STAGE_MAP).forEach(id => {
      const card = byId(id);
      if (!card) return;
      const stages = String(card.dataset.solarStages || "").split(",").map(Number);
      const stageMatch = stages.includes(activeStage);
      const modeMatch = !(mode === "simple" && card.dataset.engineerOnly === "true");
      card.hidden = !(stageMatch && modeMatch);
    });
    const releaseBanner = byId("releaseBanner");
    if (releaseBanner) releaseBanner.hidden = mode === "simple";
    const hero = document.querySelector(".workspace-hero");
    if (hero) hero.classList.toggle("compact", activeStage !== 1);
    document.body.dataset.solarStage = String(activeStage);
    document.body.dataset.solarMode = mode;
    ensureStageIntro();
    if (global.map && typeof global.map.invalidateSize === "function") setTimeout(() => global.map.invalidateSize(), 60);
    else safely(() => setTimeout(() => map.invalidateSize(), 60));
  }

  function updateSidebar() {
    const nav = document.querySelector(".sidebar-nav");
    if (!nav) return;
    nav.querySelectorAll(".solar-primary-nav").forEach(el => el.remove());
    const group = document.createElement("div");
    group.className = "nav-group solar-primary-nav";
    group.innerHTML = `<span class="nav-group-label">${mode === "simple" ? "Simple workflow" : "Primary stages"}</span>`;
    STAGES.forEach(stage => {
      const link = document.createElement("a");
      link.className = `nav-link solar-stage-nav-link${stage.id === activeStage ? " active" : ""}`;
      link.href = `#${stage.target}`;
      link.dataset.stage = String(stage.id);
      link.textContent = `${stage.id}. ${stage.label}`;
      link.addEventListener("click", event => { event.preventDefault(); goToStage(stage.id); });
      group.appendChild(link);
    });
    nav.prepend(group);
    [...nav.children].forEach(child => {
      if (child !== group) child.classList.toggle("engineer-nav-only", mode === "simple");
    });
  }

  function captureAdvancedDefaults() {
    const ids = [
      "layoutSearchMode", "orientationSearchMode", "rotationSearchRange", "rotationSearchStep", "gridAnchorSamples", "edgeAlignmentCount",
      "dcStringOneWayLengthM", "dcHomerunOneWayLengthM", "acFeederOneWayLengthM", "acSystemVoltageV", "acPowerFactor", "designCurrentFactor", "conductorTempFactor", "dcMaxVoltageDropPct", "acMaxVoltageDropPct", "dcCurrentDensityAmm2", "acCurrentDensityAmm2"
    ];
    ids.forEach(id => { const el = byId(id); if (el) defaultAdvancedValues.set(id, String(el.value)); });
  }

  function advancedModified() {
    for (const [id, value] of defaultAdvancedValues.entries()) {
      if (String(byId(id)?.value ?? "") !== value) return true;
    }
    return false;
  }

  function renderAdvancedIndicator() {
    let badge = byId("solarAdvancedModifiedBadge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "solarAdvancedModifiedBadge";
      badge.className = "solar-advanced-modified";
      const container = document.querySelector(".topbar-status");
      container?.prepend(badge);
    }
    if (!badge) return;
    const modified = advancedModified();
    badge.hidden = !(mode === "simple" && modified);
    badge.textContent = "Advanced settings modified";
  }

  function setMode(nextMode, options = {}) {
    mode = nextMode === "engineer" ? "engineer" : "simple";
    document.body.dataset.solarMode = mode;
    if (options.persist !== false) writeLocal(MODE_KEY, mode);
    document.querySelectorAll("[data-solar-mode-button]").forEach(btn => {
      const active = btn.dataset.solarModeButton === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    updateSidebar();
    updateCardVisibility();
    renderAdvancedIndicator();
    renderStepper();
    renderSticky();
    global.dispatchEvent?.(new CustomEvent("solar:modechange", { detail: { mode } }));
  }

  function createModeControl() {
    let control = byId("solarModeControl");
    if (!control) {
      control = document.createElement("div");
      control.id = "solarModeControl";
      control.className = "solar-mode-control";
      control.setAttribute("role", "group");
      control.setAttribute("aria-label", "Interface mode");
      control.innerHTML = `<button type="button" data-solar-mode-button="simple" aria-pressed="true">Simple</button><button type="button" data-solar-mode-button="engineer" aria-pressed="false">Engineer</button>`;
      document.querySelector(".topbar-status")?.prepend(control);
    }
    control.querySelectorAll("[data-solar-mode-button]").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.solarModeButton)));
  }

  function goToStage(stageId, options = {}) {
    const next = Math.min(5, Math.max(1, Number(stageId) || 1));
    if (next === activeStage && !options.force) return;
    scrollByStage.set(activeStage, global.scrollY || document.documentElement.scrollTop || 0);
    activeStage = next;
    writeLocal(STAGE_KEY, String(activeStage));
    updateCardVisibility();
    updateSidebar();
    renderStepper();
    renderSticky();
    const title = byId("currentSectionTitle");
    if (title) title.textContent = STAGES.find(item => item.id === activeStage)?.label || "Solar Design";
    const preferredScroll = options.restore ? (scrollByStage.get(activeStage) || 0) : 0;
    global.scrollTo?.({ top: preferredScroll, behavior: options.behavior || "auto" });
    if (!options.restore) byId("solarStageIntro")?.focus?.({ preventScroll: true });
    global.dispatchEvent?.(new CustomEvent("solar:stagechange", { detail: { stage: activeStage } }));
  }

  function currentMissingMessage(dep) {
    if (activeStage === 1 && dep.project !== "Current") {
      const lat = Number(byId("latitude")?.value);
      const lng = Number(byId("longitude")?.value);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return "Enter valid project coordinates before confirming the location.";
      if (!global.SolarPVAlphaLocationLifecycle?.isConfirmed?.()) return "Coordinates are valid but not confirmed. Confirm the project location before site geometry is created.";
      if (global.SolarPVAlphaInstallationMigrationState?.isPending?.()) return "Installation migration is awaiting a deliberate confirm/cancel decision; the committed type remains active.";
      return "Choose an installation type to complete Project & Location.";
    }
    if (activeStage === 2 && dep.site !== "Current") return "Draw at least one usable design surface on the map.";
    if (activeStage === 3 && dep.layout !== "Current") return "Generate a physical PV layout from the current geometry and equipment.";
    if (activeStage === 4 && dep.electrical === "Stale") return forced.electrical.reason || "Array geometry changed; refresh electrical design.";
    if (activeStage === 4 && dep.electrical !== "Current") return "Generate or refresh the string/MPPT and detailed electrical design.";
    if (activeStage === 4 && dep.sld === "Stale") return forced.sld.reason || "The drawing is out of date; refresh the SLD.";
    if (activeStage === 4 && dep.sld !== "Current") return "Generate the SLD from the current electrical object model.";
    if (activeStage === 5 && dep.review === "Missing") return "Complete the electrical drawing stage before final review/export.";
    return "Ready for the next action.";
  }

  function primaryAction(dep) {
    if (activeStage === 1) {
      return dep.project === "Current"
        ? { label: "Continue to Site Geometry", fn: () => goToStage(2) }
        : { label: "Confirm Project & Location", fn: () => byId("siteDesignCard")?.scrollIntoView({ behavior: "smooth", block: "start" }) };
    }
    if (activeStage === 2) {
      return dep.site === "Current"
        ? { label: "Continue to PV System", fn: () => goToStage(3) }
        : { label: "Draw Design Surface", fn: () => safely(() => startSiteBoundaryDrawing()) };
    }
    if (activeStage === 3) {
      return dep.layout === "Current"
        ? { label: "Continue to Electrical", fn: () => goToStage(4) }
        : { label: "Generate Solar Design", fn: () => safely(() => generateDesign()) };
    }
    if (activeStage === 4) {
      if (dep.electrical === "Stale" || dep.electrical !== "Current") return { label: "Refresh Electrical", fn: refreshElectricalAndSld };
      if (dep.sld !== "Current") return { label: "Refresh SLD", fn: refreshSld };
      return { label: "Continue to Review & Export", fn: () => goToStage(5) };
    }
    if (dep.sld === "Current") return { label: "Generate Engineering Pack", fn: () => global.SolarPVResultsUI?.exportEngineeringPack?.() };
    return { label: "Validate Project", fn: () => safely(() => runRooftopValidation(true)) };
  }

  function createSticky() {
    sticky = byId("solarStickyActionBar");
    if (sticky) return;
    sticky = document.createElement("div");
    sticky.id = "solarStickyActionBar";
    sticky.className = "solar-sticky-action";
    sticky.innerHTML = `<div class="solar-readiness"><strong>Project readiness</strong><div id="solarReadinessItems" class="solar-readiness-items"></div><div id="solarNextRequirement" class="solar-next-requirement"></div></div><button type="button" id="solarPrimaryStageAction" class="solar-primary-stage-action"></button>`;
    document.querySelector(".app-main")?.appendChild(sticky);
    renderSticky();
  }

  function renderSticky() {
    if (!sticky) return;
    const dep = dependencyStatus();
    const items = byId("solarReadinessItems");
    if (items) {
      const pairs = [["Project", dep.project], ["Site", dep.site], ["Layout", dep.layout], ["Electrical", dep.electrical], ["SLD", dep.sld]];
      items.innerHTML = pairs.map(([label, status]) => `<span class="solar-readiness-chip status-${statusClass(status)}"><b>${label}</b> ${status}</span>`).join("");
    }
    const next = byId("solarNextRequirement");
    if (next) next.textContent = currentMissingMessage(dep);
    const action = byId("solarPrimaryStageAction");
    const primary = primaryAction(dep);
    if (action) {
      action.textContent = primary.label;
      action.onclick = primary.fn;
    }
    renderStepper();
  }

  function markDependentStale(reason = "Array geometry changed. Refresh the electrical design before exporting the SLD.") {
    forced.electrical = { stale: true, reason: String(reason) };
    forced.sld = { stale: true, reason: String(reason) };
    renderSticky();
    global.SolarPVNotifications?.toast?.(`Electrical design out of date — ${reason}`, { type: "warning", timeout: 7000 });
    global.dispatchEvent?.(new CustomEvent("solar:dependencystale", { detail: { reason } }));
  }

  function markSldStale(reason = "Electrical design changed. Refresh the SLD before export.") {
    forced.sld = { stale: true, reason: String(reason) };
    renderSticky();
  }

  function clearStale(kind) {
    if (kind === "electrical" || kind === "all") forced.electrical = { stale: false, reason: "" };
    if (kind === "sld" || kind === "all") forced.sld = { stale: false, reason: "" };
    renderSticky();
  }

  function refreshElectricalAndSld() {
    try {
      // Reuse the existing deterministic dependency chain. No engineering formula is duplicated here.
      if (typeof updateDesignResults === "function" && layoutReady()) updateDesignResults(false);
      forced.electrical = { stale: false, reason: "" };
      forced.sld = { stale: false, reason: "" };
      if (typeof updateEngineeringDeliverables === "function") updateEngineeringDeliverables(false, { force: true });
      global.SolarPVNotifications?.toast?.("Electrical design and SLD refreshed from the current array.", { type: "success" });
    } catch (error) {
      global.SolarPVNotifications?.problem?.({ what: `Refresh failed — ${error.message || error}`, where: "Electrical + SLD stage", action: "resolve the highlighted design input and retry", type: "error" });
    }
    renderSticky();
  }

  function refreshSld() {
    try {
      forced.sld = { stale: false, reason: "" };
      if (typeof updateEngineeringDeliverables === "function") updateEngineeringDeliverables(false, { force: true });
      global.SolarPVNotifications?.toast?.("SLD refreshed from the current electrical object model.", { type: "success" });
    } catch (error) {
      global.SolarPVNotifications?.toast?.(`SLD refresh failed: ${error.message || error}`, { type: "error", timeout: 0 });
    }
    renderSticky();
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      renderSticky();
      renderAdvancedIndicator();
      global.SolarPVResultsUI?.refresh?.();
    }, delay);
  }

  function wireRefreshEvents() {
    document.addEventListener("change", () => scheduleRefresh(120), true);
    document.addEventListener("input", event => {
      if (event.target?.matches?.("input,select,textarea")) scheduleRefresh(250);
    }, true);
    ["draw:created", "draw:edited", "draw:deleted"].forEach(eventName => safely(() => map.on(eventName, () => scheduleRefresh(150))));
    global.addEventListener?.("solar:panelchange", () => scheduleRefresh(20));
    global.addEventListener?.("solar:sldchange", () => scheduleRefresh(20));
  }

  function bootstrap() {
    if (initialized || typeof document === "undefined") return;
    initialized = true;
    document.body.classList.add("solar-v22");
    assignCards();
    captureAdvancedDefaults();
    createModeControl();
    createStepper();
    createSticky();
    activeStage = Math.min(5, Math.max(1, Number(readLocal(STAGE_KEY, "1")) || 1));
    mode = readLocal(MODE_KEY, "simple") === "engineer" ? "engineer" : "simple";
    setMode(mode, { persist: false });
    goToStage(activeStage, { force: true, restore: false });
    wireRefreshEvents();
    scheduleRefresh(10);
  }

  const API = {
    RELEASE_VERSION,
    STAGES,
    bootstrap,
    getMode: () => mode,
    setMode,
    getActiveStage: () => activeStage,
    goToStage,
    getDependencyStatus: dependencyStatus,
    markDependentStale,
    markSldStale,
    clearStale,
    refreshElectricalAndSld,
    refreshSld,
    shouldHoldSld: () => forced.sld.stale || forced.electrical.stale,
    getStaleReason: () => forced.sld.reason || forced.electrical.reason || "",
    scheduleRefresh,
    advancedModified
  };

  global.SolarPVWorkflow = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
})(typeof globalThis !== "undefined" ? globalThis : this);
