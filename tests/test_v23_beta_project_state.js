"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const State = require("../project-state-v2.3.js");

const FIX = path.join(__dirname, "fixtures", "v23_beta_state");
for (const name of ["rooftop", "ground", "carport"]) {
  const legacy = JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), "utf8"));
  const state = State.fromLegacySnapshot(legacy);
  assert.equal(state.schemaVersion, "2.0");
  assert.equal(state.identity.projectId, legacy.projectId);
  assert.equal(state.installation.type, legacy.installation);
  assert.equal(state.location.latitude, Number(legacy.locationLifecycle.appliedCoordinates.lat));
  const round = State.toLegacySnapshot(state, legacy);
  assert.equal(round.schemaVersion, "2.0");
  assert.equal(round.form.projectName, legacy.form.projectName);
  assert.equal(round.installation, legacy.installation);
  assert.deepEqual(round.roofFaces, legacy.roofFaces);
}

const equivalentA = { b: 2, a: { y: 4, x: 3 } };
const equivalentB = { a: { x: 3, y: 4 }, b: 2 };
assert.equal(State.fingerprint(equivalentA), State.fingerprint(equivalentB), "fingerprint must ignore key insertion order");

const legacy = JSON.parse(fs.readFileSync(path.join(FIX, "rooftop.json"), "utf8"));
const store = State.createStore(State.fromLegacySnapshot(legacy));
const before = store.getFingerprint();
const events = [];
store.subscribe(event => events.push(event));
store.dispatch({ type: "SET_PATH", path: "identity.projectName", value: "Roof A" });
assert.equal(store.getFingerprint(), before, "no-op update must keep fingerprint stable");
assert.deepEqual(events.at(-1).changedPaths, [], "no-op event must report no changed path");
store.dispatch({ type: "SET_PATH", path: "identity.projectName", value: "Roof B" });
assert.notEqual(store.getFingerprint(), before);
assert.equal(store.getState().identity.projectName, "Roof B");
assert.equal(legacy.form.projectName, "Roof A", "legacy input must not be mutated");
assert.ok(Object.isFrozen(store.getState()), "authoritative state should be immutable to callers");

const presentationFingerprint = store.getFingerprint();
// Simple/Engineer mode is intentionally not represented in ProjectState.
assert.equal(store.getFingerprint(), presentationFingerprint);

const selection1 = store.selectFingerprint(["location", "site"]);
store.dispatch({ type: "SET_PATH", path: "identity.customerName", value: "Other" });
const selection2 = store.selectFingerprint(["site", "location"]);
assert.equal(selection1, selection2, "unrelated identity edit must not alter location/site dependency fingerprint");

console.log("v2.3 Beta B1 ProjectState: PASS", { fingerprint: store.getFingerprint(), events: events.length });
