"use strict";

(function initSolarPVCore(global) {
  const APP_VERSION = "1.9";
  const APP_VERSION_LABEL = "Version 1.9";
  const PROJECT_SCHEMA_VERSION = "1.9";

  const PROJECT_STORAGE_KEY = "solarPvDesignPlatform.v1.9.project";
  const LEGACY_PROJECT_STORAGE_KEYS = Object.freeze([
    "solarPvDesignPlatform.v1.8.project",
    "solarPvDesignPlatform.v1.7.alpha6.project",
    "solarPvDesignPlatform.v1.7.alpha5.project",
    "solarPvDesignPlatform.v1.7.alpha4.project",
    "solarPvDesignPlatform.v1.7.alpha3.project",
    "solarPvDesignPlatform.v1.7.alpha2.project",
    "solarPvDesignPlatform.v1.7.alpha1.project",
    "solarPvDesignPlatform.v1.6.project",
    "solarPvDesignPlatform.v1.6.rc2.project",
    "solarPvDesignPlatform.v1.6.rc1.project",
    "solarPvDesignPlatform.v1.6.beta3.project",
    "solarPvDesignPlatform.v1.6.beta2.project",
    "solarPvDesignPlatform.v1.6.beta1.project",
    "solarPvDesignPlatform.v1.6.alpha1.project"
  ]);

  const SUPPORTED_PROJECT_SCHEMA_VERSIONS = new Set([
    PROJECT_SCHEMA_VERSION,
    "1.8",
    "1.8-final",
    "1.8-rulepacks",
    "1.7-alpha6",
    "1.7-alpha5",
    "1.7-alpha4",
    "1.7-alpha3",
    "1.7-alpha2",
    "1.7-alpha1",
    "1.6",
    "1.6-beta3",
    "1.6-beta2",
    "1.6-beta1",
    "1.6-alpha1"
  ]);

  const PROJECT_REVISION_INDEX_KEY =
    "solarPvDesignPlatform.v1.9.revisionIndex";

  const PROJECT_REVISION_KEY_PREFIX =
    "solarPvDesignPlatform.v1.9.revision";

  const LEGACY_PROJECT_REVISION_INDEX_KEYS = Object.freeze([
    "solarPvDesignPlatform.v1.8.revisionIndex",
    "solarPvDesignPlatform.v1.7.alpha6.revisionIndex",
    "solarPvDesignPlatform.v1.7.alpha5.revisionIndex",
    "solarPvDesignPlatform.v1.7.alpha4.revisionIndex",
    "solarPvDesignPlatform.v1.7.alpha3.revisionIndex",
    "solarPvDesignPlatform.v1.7.alpha2.revisionIndex",
    "solarPvDesignPlatform.v1.7.alpha1.revisionIndex"
  ]);

  const LEGACY_PROJECT_REVISION_KEY_PREFIXES = Object.freeze([
    "solarPvDesignPlatform.v1.8.revision",
    "solarPvDesignPlatform.v1.7.alpha6.revision",
    "solarPvDesignPlatform.v1.7.alpha5.revision",
    "solarPvDesignPlatform.v1.7.alpha4.revision",
    "solarPvDesignPlatform.v1.7.alpha3.revision",
    "solarPvDesignPlatform.v1.7.alpha2.revision",
    "solarPvDesignPlatform.v1.7.alpha1.revision"
  ]);

  const MAX_BROWSER_PROJECT_REVISIONS = 8;

  const REMOTE_REPOSITORY_SETTINGS_KEY =
    "solarPvDesignPlatform.v1.9.remoteSettings";

  const LEGACY_REMOTE_REPOSITORY_SETTINGS_KEYS = Object.freeze([
    "solarPvDesignPlatform.v1.8.remoteSettings",
    "solarPvDesignPlatform.v1.7.alpha6.remoteSettings",
    "solarPvDesignPlatform.v1.7.alpha5.remoteSettings",
    "solarPvDesignPlatform.v1.7.alpha4.remoteSettings",
    "solarPvDesignPlatform.v1.7.alpha3.remoteSettings",
    "solarPvDesignPlatform.v1.7.alpha2.remoteSettings"
  ]);

  const REMOTE_SYNC_QUEUE_KEY =
    "solarPvDesignPlatform.v1.9.remoteSyncQueue";

  const LEGACY_REMOTE_SYNC_QUEUE_KEYS = Object.freeze([
    "solarPvDesignPlatform.v1.8.remoteSyncQueue",
    "solarPvDesignPlatform.v1.7.alpha6.remoteSyncQueue",
    "solarPvDesignPlatform.v1.7.alpha5.remoteSyncQueue",
    "solarPvDesignPlatform.v1.7.alpha4.remoteSyncQueue",
    "solarPvDesignPlatform.v1.7.alpha3.remoteSyncQueue",
    "solarPvDesignPlatform.v1.7.alpha2.remoteSyncQueue"
  ]);

  const MAX_REMOTE_SYNC_QUEUE = 20;

  const DETERMINISTIC_WORKER_SCRIPT =
    "solar_pv_design_platform_v1.9_worker.js";

  const DETERMINISTIC_WORKER_VERSION =
    "1.9.0";

  const DETERMINISTIC_WORKER_TASK_TIMEOUT_MS =
    45000;

  const ENGINE_REGISTRY = Object.freeze([
    Object.freeze({
      id: "geometry",
      label: "GIS / geometry",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "layout",
      label: "PV layout",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "electrical",
      label: "String / MPPT electrical",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "detail-electrical",
      label: "Detailed electrical",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "energy",
      label: "Monthly energy",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "deliverables",
      label: "SLD / BOM / report",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "finance",
      label: "Financial analysis",
      version: "1.6.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "shading",
      label: "3D shading",
      version: "1.6.0",
      execution: "main-thread-indexed",
      deterministic: true
    }),
    Object.freeze({
      id: "point-cloud-import",
      label: "3D point-cloud summarization",
      version: "1.9.0",
      execution: "external-worker-with-main-thread-fallback",
      deterministic: true
    }),
    Object.freeze({
      id: "engineering-rule-packs",
      label: "Configurable engineering rule packs",
      version: "1.8.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "engineering-rule-audit",
      label: "Rule scenario comparison / decision trace",
      version: "1.9.0",
      execution: "main-thread",
      deterministic: true
    }),
    Object.freeze({
      id: "persistence",
      label: "Project repository",
      version: "1.9.0",
      execution: "browser-repository + HTTP/SQLite server",
      deterministic: true
    })
  ]);

  const MODULE_BOUNDARY_REGISTRY = Object.freeze([
    Object.freeze({
      id: "application-shell",
      label: "Application shell / UI",
      version: "1.9.0",
      owns: "DOM wiring, map interaction, form state, rendering",
      interface: "UI events + explicit engine calls",
      extraction: "Inline shell"
    }),
    Object.freeze({
      id: "architecture-core",
      label: "Architecture core",
      version: "1.9.0",
      owns: "Versions, storage/schema keys, manifests, pure validation helpers",
      interface: "window.SolarPVCore",
      extraction: "External module extracted"
    }),
    Object.freeze({
      id: "geometry-layout",
      label: "Geometry + layout",
      version: "1.6.0",
      owns: "Buildable polygons, placement, manual geometry checks",
      interface: "Deterministic geometry/layout functions",
      extraction: "Inline legacy core"
    }),
    Object.freeze({
      id: "electrical",
      label: "Electrical engineering",
      version: "1.6.0",
      owns: "Strings, MPPTs, cables, protection",
      interface: "Structured electrical result objects",
      extraction: "Inline legacy core"
    }),
    Object.freeze({
      id: "energy",
      label: "Solar + energy",
      version: "1.6.0",
      owns: "Resource transposition, temperature, loss chain, monthly energy",
      interface: "Structured simulation result",
      extraction: "Inline legacy core"
    }),
    Object.freeze({
      id: "outputs-commercial",
      label: "Outputs + finance",
      version: "1.6.0",
      owns: "SLD, BOM, report, cash flow",
      interface: "Electrical object model + energy result",
      extraction: "Inline legacy core"
    }),
    Object.freeze({
      id: "shading",
      label: "3D shading",
      version: "1.9.0",
      owns: "Point import, obstruction index, LOS sampling",
      interface: "Canonical local ENU obstruction records",
      extraction: "Worker-assisted boundary"
    }),
    Object.freeze({
      id: "engineering-rules",
      label: "Engineering rule packs + audit",
      version: "1.9.0",
      owns: "Rule-pack metadata, deterministic derating/protection defaults, project overlays, rule trace and scenario comparisons",
      interface: "window.SolarPVRulePacks",
      extraction: "External module extracted"
    }),
    Object.freeze({
      id: "repository",
      label: "Persistence + revisions",
      version: "1.9.0",
      owns: "Browser revisions and HTTP repository adapter",
      interface: "window.SolarPVRepository factories",
      extraction: "External module extracted"
    }),
    Object.freeze({
      id: "server-repository",
      label: "Server + database repository",
      version: "1.9.0",
      owns: "Same-origin REST API, immutable remote revisions, SQLite persistence",
      interface: "HTTP /api/solar-pv + SQLite",
      extraction: "External Python service extracted"
    }),
    Object.freeze({
      id: "execution",
      label: "Deterministic execution",
      version: "1.9.0",
      owns: "Worker lifecycle, task protocol, timeout/fallback metrics",
      interface: "run(task, payload, transfer, fallback)",
      extraction: "External worker module extracted"
    })
  ]);

  const ARCHITECTURE_SERVICE_REGISTRY = Object.freeze([
    Object.freeze({
      id: "architecture-core",
      label: "Architecture core module",
      version: "1.9.0",
      role: "Owns version/schema/storage constants and architecture manifests",
      networkRequired: false
    }),
    Object.freeze({
      id: "repository-contract",
      label: "Repository contract",
      version: "1.9.0",
      role: "Normalizes local and HTTP project-repository operations",
      networkRequired: false
    }),
    Object.freeze({
      id: "engineering-rule-service",
      label: "Engineering rule-pack service",
      version: "1.9.0",
      role: "Resolves versioned rule packs, project overlays, provenance fingerprints, scenario comparisons and deterministic design traces",
      networkRequired: false
    }),
    Object.freeze({
      id: "revision-service",
      label: "Revision service",
      version: "1.9.0",
      role: "Immutable revision chain and local retention in external repository module",
      networkRequired: false
    }),
    Object.freeze({
      id: "working-copy",
      label: "Working-copy tracker",
      version: "1.9.0",
      role: "Detects committed vs uncommitted project state",
      networkRequired: false
    }),
    Object.freeze({
      id: "remote-http",
      label: "HTTP repository adapter",
      version: "1.9.0",
      role: "Health, push, pull, and revision API client in external repository module",
      networkRequired: true
    }),
    Object.freeze({
      id: "server-api",
      label: "Same-origin repository API",
      version: "1.9.0",
      role: "Serves the application plus project/revision REST endpoints",
      networkRequired: false
    }),
    Object.freeze({
      id: "sqlite-repository",
      label: "SQLite revision store",
      version: "1.9.0",
      role: "Persists immutable project revisions and current-revision pointers",
      networkRequired: false
    }),
    Object.freeze({
      id: "sync-queue",
      label: "Local-first sync queue",
      version: "1.9.0",
      role: "Queues failed/automatic remote revision pushes",
      networkRequired: false
    }),
    Object.freeze({
      id: "module-boundaries",
      label: "Module-boundary registry",
      version: "1.9.0",
      role: "Declares ownership and physical extraction state",
      networkRequired: false
    }),
    Object.freeze({
      id: "execution-service",
      label: "Deterministic execution service",
      version: "1.9.0",
      role: "Runs supported heavy tasks in a worker with explicit deterministic fallback",
      networkRequired: false
    }),
    Object.freeze({
      id: "worker-adapter",
      label: "Point-cloud worker adapter",
      version: "1.9.0",
      role: "Transfers packed point buffers to the physically separate worker module",
      networkRequired: false
    })
  ]);

  function getProjectRevisionStorageKey(
    projectId,
    revisionNumber,
    prefix = PROJECT_REVISION_KEY_PREFIX
  ) {
    return `${prefix}.${encodeURIComponent(
      String(projectId || "")
    )}.${Number(revisionNumber)}`;
  }

  function parseProjectRevisionIndexRaw(
    raw,
    label = "Browser revision index"
  ) {
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error(`${label} is malformed.`);
    }

    return parsed.filter(
      item =>
        item &&
        typeof item === "object" &&
        item.projectId &&
        Number.isInteger(Number(item.revisionNumber))
    );
  }

  function sanitizeRemoteRepositoryBaseUrl(
    value,
    baseHref =
      global?.location?.href ||
      "http://localhost/"
  ) {
    const input = String(value || "").trim();

    if (!input) return "";

    let url;

    try {
      url = new URL(input, baseHref);
    } catch {
      throw new Error(
        "Enter a valid HTTP or HTTPS remote API base URL."
      );
    }

    if (!new Set(["http:", "https:"]).has(url.protocol)) {
      throw new Error(
        "Remote repository URLs must use HTTP or HTTPS."
      );
    }

    if (url.username || url.password) {
      throw new Error(
        "Do not place credentials in the remote repository URL."
      );
    }

    if (url.search || url.hash) {
      throw new Error(
        "Remote repository base URL cannot contain a query string or fragment."
      );
    }

    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }

  function getDefaultRemoteRepositorySettings() {
    const protocol =
      String(global?.location?.protocol || "");

    const origin =
      String(global?.location?.origin || "");

    const sameOriginApi =
      new Set(["http:", "https:"]).has(protocol) && origin
        ? `${origin}/api/solar-pv`
        : "";

    return {
      mode: sameOriginApi ? "manual" : "off",
      baseUrl: sameOriginApi,
      timeoutMs: 10000
    };
  }

  global.SolarPVCore = Object.freeze({
    APP_VERSION,
    APP_VERSION_LABEL,
    PROJECT_SCHEMA_VERSION,
    PROJECT_STORAGE_KEY,
    LEGACY_PROJECT_STORAGE_KEYS,
    SUPPORTED_PROJECT_SCHEMA_VERSIONS,
    PROJECT_REVISION_INDEX_KEY,
    PROJECT_REVISION_KEY_PREFIX,
    LEGACY_PROJECT_REVISION_INDEX_KEYS,
    LEGACY_PROJECT_REVISION_KEY_PREFIXES,
    MAX_BROWSER_PROJECT_REVISIONS,
    REMOTE_REPOSITORY_SETTINGS_KEY,
    LEGACY_REMOTE_REPOSITORY_SETTINGS_KEYS,
    REMOTE_SYNC_QUEUE_KEY,
    LEGACY_REMOTE_SYNC_QUEUE_KEYS,
    MAX_REMOTE_SYNC_QUEUE,
    DETERMINISTIC_WORKER_SCRIPT,
    DETERMINISTIC_WORKER_VERSION,
    DETERMINISTIC_WORKER_TASK_TIMEOUT_MS,
    ENGINE_REGISTRY,
    MODULE_BOUNDARY_REGISTRY,
    ARCHITECTURE_SERVICE_REGISTRY,
    getProjectRevisionStorageKey,
    parseProjectRevisionIndexRaw,
    sanitizeRemoteRepositoryBaseUrl,
    getDefaultRemoteRepositorySettings
  });
})(globalThis);
