"use strict";

/* Focused deliverable-provenance regression.
   Functions are extracted verbatim from index.html and run with a deterministic
   minimal object model so Alpha 1 can prove SLD/BOM provenance without changing
   the established electrical calculation path. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} missing from index.html`);
  const end = source.indexOf(`\nfunction ${nextName}(`, start);
  assert(end > start, `${nextName} boundary missing after ${name}`);
  return source.slice(start, end).trim();
}

const APP_VERSION = "2.0-alpha1";
const APP_VERSION_LABEL = "Version 2.0 Alpha 1";
const PROJECT_SCHEMA_VERSION = "2.0";
const activeRevisionNumber = 7;
const activeEngineeringRuleContext = null;
function ensureActiveProjectIdentity() { return "P-PROVENANCE-TEST"; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"})[ch]);
}
function getProtectionLabelForInverter() { return "not-used"; }

// eslint-disable-next-line no-eval
eval(`${extractFunction("getDeliverableProvenance", "getElectricalDeliverableReadiness")}\nglobalThis.__getDeliverableProvenance=getDeliverableProvenance;`);
const getDeliverableProvenance = globalThis.__getDeliverableProvenance;
// eslint-disable-next-line no-eval
eval(`${extractFunction("buildSldSvg", "renderBom")}\nglobalThis.__buildSldSvg=buildSldSvg;`);
const buildSldSvg = globalThis.__buildSldSvg;
// csvEscape + buildBomCsvText live consecutively before exportBomCsv.
const csvStart = source.indexOf("function csvEscape(");
const csvEnd = source.indexOf("\nfunction exportBomCsv(", csvStart);
assert(csvStart >= 0 && csvEnd > csvStart);
// eslint-disable-next-line no-eval
eval(`${source.slice(csvStart, csvEnd)}\nglobalThis.__buildBomCsvText=buildBomCsvText;`);
const buildBomCsvText = globalThis.__buildBomCsvText;

const model = {
  sourceFingerprint: "elec-test-source",
  generatedAt: "2026-08-29T00:00:00.000Z",
  project: {
    name: "Provenance Test",
    installation: "Rooftop Solar"
  },
  module: {
    datasheetVersion: "module-ds-1",
    sourceLabel: "test module source"
  },
  inverter: {
    sourceLabel: "test inverter source"
  },
  engineeringRules: {
    packId: "SPVDP-GLOBAL-PRELIM-2026",
    packVersion: "1.0.0",
    fingerprint: "rule-7cf5c696",
    jurisdiction: "Preliminary generic",
    standardReference: "No compliance claim",
    rulePackSchemaVersion: "2.0.0",
    contractEngineeringVersion: "1.0.0",
    contractFingerprint: "rulepack-v2-sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    contractFingerprintAlgorithm: "spvdp-rulepack-canonical-json-v1+sha256",
    compatibilityMode: "v1.9-adapter",
    compatibilityState: "compatible",
    compatibilityReasons: [],
    lifecycleStatus: "preliminary",
    claims: {
      softwareImplementation: "implemented",
      deterministicTests: "passing",
      engineeringEvidence: "not-validated",
      independentReview: "not-completed",
      regulatoryComplianceClaim: "not-permitted"
    },
    capabilities: {
      "conductor-sizing": { state: "implemented-preliminary", validationStatus: "not-validated" },
      "fault-current": { state: "unsupported", validationStatus: "not-validated" }
    },
    evidenceReferences: [
      { id: "v19-pack:SPVDP-GLOBAL-PRELIM-2026:1.0.0", locator: "frozen v1.9 built-in pack" }
    ],
    overlayPolicy: "strict-v2",
    overlayFingerprint: "rule-overlay-test",
    overlayPresent: true,
    trace: []
  },
  inverters: [],
  strings: [],
  circuits: [],
  bom: [
    { category: "PV field", item: "PV module", spec: "fixture", quantity: 1, unit: "ea" }
  ]
};

const provenance = getDeliverableProvenance(model);
assert.deepStrictEqual({
  app: provenance.applicationVersion,
  projectSchema: provenance.projectSchema,
  rule: provenance.rulePackFingerprint,
  ruleSchema: provenance.rulePackSchemaVersion,
  contract: provenance.ruleContractFingerprint,
  mode: provenance.ruleCompatibilityMode,
  state: provenance.ruleCompatibilityState,
  lifecycle: provenance.ruleLifecycleStatus,
  evidence: provenance.ruleClaims.engineeringEvidence,
  review: provenance.ruleClaims.independentReview,
  compliance: provenance.ruleClaims.regulatoryComplianceClaim,
  overlayPolicy: provenance.ruleOverlayPolicy,
  overlayFingerprint: provenance.ruleOverlayFingerprint
}, {
  app: "2.0-alpha1",
  projectSchema: "2.0",
  rule: "rule-7cf5c696",
  ruleSchema: "2.0.0",
  contract: model.engineeringRules.contractFingerprint,
  mode: "v1.9-adapter",
  state: "compatible",
  lifecycle: "preliminary",
  evidence: "not-validated",
  review: "not-completed",
  compliance: "not-permitted",
  overlayPolicy: "strict-v2",
  overlayFingerprint: "rule-overlay-test"
});
assert.strictEqual(provenance.ruleCapabilities["fault-current"].state, "unsupported");
assert.strictEqual(provenance.ruleEvidenceReferences.length, 1);

const sld = buildSldSvg(model);
for (const token of [
  'data-rule-fingerprint="rule-7cf5c696"',
  'data-rule-schema-version="2.0.0"',
  `data-rule-contract-fingerprint="${model.engineeringRules.contractFingerprint}"`,
  'data-rule-compliance-claim="not-permitted"',
  "Evidence not-validated",
  "Independent review not-completed",
  "PRELIMINARY"
]) assert(sld.includes(token), `SLD missing provenance token: ${token}`);

const bomCsv = buildBomCsvText(model);
for (const token of [
  "Rule Pack Fingerprint,rule-7cf5c696",
  "Rule Pack Schema Version,2.0.0",
  `Rule Contract Fingerprint,${model.engineeringRules.contractFingerprint}`,
  "Rule Compatibility Mode,v1.9-adapter",
  "Rule Compatibility State,compatible",
  "Engineering Evidence Status,not-validated",
  "Independent Review Status,not-completed",
  "Regulatory Compliance Claim,not-permitted",
  "fault-current=unsupported/not-validated",
  "Project Overlay Policy,strict-v2",
  "Project Overlay Fingerprint,rule-overlay-test"
]) assert(bomCsv.includes(token), `BOM CSV missing provenance token: ${token}`);

// Engineering-report output is still constructed by the retained shell; assert
// its exact source contains the formal provenance fields and preliminary claim boundary.
for (const token of [
  "engineering-rule-schema-version",
  "engineering-rule-contract-fingerprint",
  "engineering-evidence-status",
  "engineering-independent-review",
  "v1.9 compatibility fingerprint",
  "Formal contract fingerprint",
  "Regulatory compliance claim",
  "Evidence / provenance references",
  "Project overlay",
  "It is not construction-ready"
]) assert(source.includes(token), `Engineering report source missing: ${token}`);

console.log(JSON.stringify({
  ok: true,
  source: "index.html deliverable functions",
  sldProvenance: true,
  bomProvenance: true,
  reportProvenanceSource: true,
  legacyRuleFingerprintPreserved: provenance.rulePackFingerprint,
  formalRuleSchema: provenance.rulePackSchemaVersion,
  formalContractFingerprint: provenance.ruleContractFingerprint,
  complianceClaim: provenance.ruleClaims.regulatoryComplianceClaim
}, null, 2));
