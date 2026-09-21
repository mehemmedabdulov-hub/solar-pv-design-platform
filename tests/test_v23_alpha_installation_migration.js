"use strict";
const assert = require("assert");
const alpha = require("../v23-alpha-controller.js");

const TYPES = ["Rooftop Solar", "Ground-Mounted Solar", "Solar Carport"];
for (let i = 0; i < TYPES.length; i++) {
  const from = TYPES[i];
  const to = TYPES[(i + 1) % TYPES.length];
  const state = alpha.createInstallationMigrationState(from);
  assert.strictEqual(state.getCommittedType(), from);
  assert.deepStrictEqual(state.request(to, false).action, "apply");
  assert.strictEqual(state.getCommittedType(), to, `${from} -> ${to} without geometry should apply immediately`);
}

const state = alpha.createInstallationMigrationState("Rooftop Solar");
let decision = state.request("Ground-Mounted Solar", true);
assert.strictEqual(decision.action, "migrate");
assert.strictEqual(state.getCommittedType(), "Rooftop Solar");
assert.strictEqual(state.getPendingType(), "Ground-Mounted Solar");
const beforeCancel = JSON.stringify({ committed: state.getCommittedType(), surfaces: [{x:1}], fingerprint: "pv-same" });
state.cancel();
const afterCancel = JSON.stringify({ committed: state.getCommittedType(), surfaces: [{x:1}], fingerprint: "pv-same" });
assert.strictEqual(afterCancel, beforeCancel, "cancel must leave committed state/fingerprint-equivalent fixture unchanged");

const faces = [
  { roofFaceId: "RF-1", roofFaceName: "Roof Face 1", subArrayId: "SA-1", surfaceKind: "Rooftop Solar", latLngs: [{lat:1,lng:2}] },
  { roofFaceId: "RF-2", roofFaceName: "West Roof – keep", subArrayId: "CUSTOM-WEST", surfaceKind: "Rooftop Solar", latLngs: [{lat:3,lng:4}] },
  { roofFaceId: "RF-3", roofFaceName: "Roof Face 3", subArrayId: "CUSTOM-3", surfaceKind: "Rooftop Solar", latLngs: [{lat:5,lng:6}] }
];
const plan = alpha.planInstallationMigration(faces, "Rooftop Solar", "Ground-Mounted Solar");
assert.strictEqual(plan[0].roofFaceName, "Ground Block 1");
assert.strictEqual(plan[0].subArrayId, "GA-1");
assert.strictEqual(plan[1].roofFaceName, "West Roof – keep");
assert.strictEqual(plan[1].subArrayId, "CUSTOM-WEST");
assert.strictEqual(plan[2].roofFaceName, "Ground Block 3");
assert.strictEqual(plan[2].subArrayId, "CUSTOM-3");
assert.deepStrictEqual(faces[0].latLngs, [{lat:1,lng:2}], "planning must not mutate polygon data");

for (const [from, to] of [["Ground-Mounted Solar","Solar Carport"],["Solar Carport","Rooftop Solar"]]) {
  const sample = [{roofFaceId:"RF-7", roofFaceName:alpha.defaultSurfaceName(from,7), subArrayId:alpha.defaultSubArrayId(from,7)}];
  const result = alpha.planInstallationMigration(sample, from, to)[0];
  assert.strictEqual(result.roofFaceName, alpha.defaultSurfaceName(to,7));
  assert.strictEqual(result.subArrayId, alpha.defaultSubArrayId(to,7));
}

console.log("v2.3 Alpha A2 installation migration: PASS");
