"use strict";

const assert = require("assert");
const SLD = require("../sld-drawing-model.js");

function fixture(fingerprint = "elec-test-001") {
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    sourceFingerprint: fingerprint,
    project: {
      id: "PROJECT-TEST",
      revisionNumber: 7,
      name: "V2.2 Drawing Model Test",
      customer: "Verification Customer",
      latitude: 40.4093,
      longitude: 49.8671,
      installation: "Rooftop"
    },
    module: { id: "MOD-550", manufacturer: "Example Solar", model: "ES-550", powerW: 550 },
    inverter: { id: "INV-MODEL-25", manufacturer: "Example Power", model: "EP-25K", acPowerKW: 25 },
    engineeringRules: { packId: "RULE-TEST", packVersion: "2.0.0", fingerprint: "rules-abc", conductorMaterial: "Copper" },
    subArrays: [
      { id: "SA-01", surfaceId: "RF-01", name: "South Roof", moduleCount: 36, dcKW: 19.8, stringIds: ["STR-A", "STR-B"] }
    ],
    strings: [
      { id: "STR-A", subArrayId: "SA-01", moduleCount: 18, inverterNumber: 1, mpptNumber: 1, inputNumber: 1, powerKW: 9.9, status: "pass" },
      { id: "STR-B", subArrayId: "SA-01", moduleCount: 18, inverterNumber: 1, mpptNumber: 1, inputNumber: 2, powerKW: 9.9, status: "pass" }
    ],
    inverters: [
      { id: "INV-1", number: 1, manufacturer: "Example Power", model: "EP-25K", acKW: 25, assignedDcKW: 19.8, mppts: [1], stringIds: ["STR-A", "STR-B"] }
    ],
    circuits: [
      { circuit: "STR-A DC string", category: "dc-string", designCurrentA: 13.1, oneWayLengthM: 24, cableSizeMm2: 6, conductorMaterial: "Copper", voltageV: 720, dropPct: 0.7, protection: "20 A gPV fuse", capacityA: 46, status: "pass" },
      { circuit: "STR-B DC string", category: "dc-string", designCurrentA: 13.1, oneWayLengthM: 28, cableSizeMm2: 6, conductorMaterial: "Copper", voltageV: 720, dropPct: 0.8, protection: "20 A gPV fuse", capacityA: 46, status: "pass" },
      { circuit: "DC homerun 1:1", category: "dc-homerun", designCurrentA: 26.2, oneWayLengthM: 18, cableSizeMm2: 10, conductorMaterial: "Copper", voltageV: 720, dropPct: 0.4, protection: "40 A DC OCPD", capacityA: 61, status: "pass" },
      { circuit: "Inverter 1 DC protection", category: "protection", designCurrentA: 30, protection: "40 A DC isolator + SPD", status: "pass" },
      { circuit: "Inverter 1 AC feeder", category: "ac-feeder", designCurrentA: 36.1, oneWayLengthM: 21, cableSizeMm2: 10, conductorMaterial: "Copper", voltageV: 400, dropPct: 0.6, protection: "50 A MCCB + AC SPD", capacityA: 58, status: "pass" },
      { circuit: "Inverter 1 PE", category: "earthing", oneWayLengthM: 20, cableSizeMm2: 10, conductorMaterial: "Copper", protection: "PE conductor", status: "pass" }
    ],
    bom: [{ category: "Module", item: "ES-550", qty: 36, unit: "ea" }]
  };
}

const model = fixture();
const compact = SLD.createDrawingModel(model, { mode: "compact", profile: "IEC", generatedAt: model.generatedAt });
const compactAgain = SLD.createDrawingModel(model, { mode: "compact", profile: "IEC", generatedAt: model.generatedAt });
const detailed = SLD.createDrawingModel(model, { mode: "detailed", profile: "IEC", generatedAt: model.generatedAt });

assert(compact, "compact drawing should be generated");
assert.strictEqual(compact.sourceFingerprint, model.sourceFingerprint);
assert.strictEqual(compact.metadata.calculationEngineVersion, "2.1");
assert.strictEqual(compact.metadata.projectSchema, "2.0");
assert.strictEqual(compact.metadata.status, "PRELIMINARY · NOT FOR CONSTRUCTION");
assert.deepStrictEqual(
  compact.nodes.map(({ id, designRef, designType, tag }) => ({ id, designRef, designType, tag })),
  compactAgain.nodes.map(({ id, designRef, designType, tag }) => ({ id, designRef, designType, tag })),
  "drawing identities and tags must be deterministic"
);
assert(detailed.nodes.length > compact.nodes.length, "detailed mode should expand string detail");
assert(compact.nodes.some(node => node.designType === "stringGroup"));
assert(detailed.nodes.filter(node => node.designType === "string").length === 2);
assert(compact.nodes.some(node => node.designType === "combiner"));
assert(compact.nodes.some(node => node.designType === "board"));
assert(compact.nodes.some(node => node.designType === "grid"));
assert(!compact.nodes.some(node => node.designType === "meter"), "meter must not be invented when project data does not support one");
assert(compact.nodes.every(node => node.bound === true), "generated electrical nodes must be design-bound");
assert(compact.edges.every(edge => edge.bound === true), "generated circuit edges must be design-bound");

const inv = compact.nodes.find(node => node.designType === "inverter");
inv.x += 47;
inv.y += 13;
inv.displayTag = "INV-MANUAL";
inv.note = "Display note only";
inv.manualPosition = true;
const ann = SLD.addAnnotation(compact, "note", { id: "ANN-TEST", x: 700, y: 700, text: "Drawing-only note" });
assert(ann && ann.bound === false);
const regenerated = SLD.createDrawingModel(model, { mode: "compact", profile: "ANSI", previous: compact, generatedAt: model.generatedAt });
const regeneratedInv = regenerated.nodes.find(node => node.designRef === inv.designRef);
assert.strictEqual(regeneratedInv.x, inv.x, "manual drawing position must survive source-preserving regeneration");
assert.strictEqual(regeneratedInv.y, inv.y);
assert.strictEqual(regeneratedInv.displayTag, "INV-MANUAL");
assert.strictEqual(regeneratedInv.note, "Display note only");
assert.strictEqual(regenerated.annotations.length, 1);
assert.strictEqual(regenerated.annotations[0].id, "ANN-TEST");
assert.strictEqual(regenerated.annotations[0].bound, false, "annotation-only objects must remain non-electrical");
assert.strictEqual(regenerated.profile, "ANSI");

const check = SLD.preflightDrawing(regenerated, model);
assert.strictEqual(check.ok, true, `preflight should pass fixture without fatal errors: ${check.errors.join("; ")}`);
assert.deepStrictEqual(check.errors, []);

const svg = SLD.renderSvg(regenerated, model);
assert(svg.startsWith("<svg"));
assert(svg.includes("PRELIMINARY SINGLE-LINE DIAGRAM"));
assert(svg.includes("NOT FOR CONSTRUCTION"));
assert(svg.includes("E-401"));
assert(svg.includes(model.sourceFingerprint));
assert(svg.includes("data-sld-node"));
assert(svg.includes("INV-MANUAL"));
assert(svg.includes("Copper"));
assert(svg.includes("ΔV 0.70%") || svg.includes("ΔV 0.40%") || svg.includes("ΔV 0.60%"), "SVG should carry circuit voltage-drop annotations");

const staleModel = fixture("elec-test-CHANGED");
const stale = SLD.preflightDrawing(regenerated, staleModel);
assert.strictEqual(stale.ok, false);
assert(stale.errors.some(message => /fingerprint/i.test(message)), "stale source fingerprint must be a blocking preflight error");

const dxf = SLD.buildDxf(regenerated, model);
assert(dxf.includes("AC1015"));
assert(dxf.includes("ELECTRICAL"));
assert(dxf.includes("TITLE_BLOCK"));
assert(dxf.includes("LWPOLYLINE"));
assert(dxf.includes("AcDbPolyline"));
assert(dxf.includes("AcDbLine"));
assert(dxf.includes("AcDbText"));
assert(dxf.includes("\r\nEOF\r\n"));
assert(!/\.dwg\b/i.test(dxf), "DXF writer must never masquerade as DWG");

console.log(`v2.2 SLD drawing model: PASS (${compact.nodes.length} compact nodes, ${detailed.nodes.length} detailed nodes, ${regenerated.edges.length} edges)`);
