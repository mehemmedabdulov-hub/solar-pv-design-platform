const assert = require('assert');
const alpha = require('../v23-alpha-controller.js');

function fingerprint(state) { return JSON.stringify(state); }

const lifecycle = alpha.createLocationLifecycle({ latitude: 40.4093, longitude: 49.8671 });
assert.strictEqual(lifecycle.getState(), alpha.LOCATION_STATES.UNCONFIRMED);
assert.strictEqual(lifecycle.isConfirmed(), false);

let request = lifecycle.requestChange({ latitude: 40.41, longitude: 49.87, source: 'map', hasBoundData: false, requiresSetMode: true });
assert.strictEqual(request.action, 'ignored', 'ordinary map click must not relocate outside Set Location mode');
assert.deepStrictEqual(lifecycle.getAppliedCoordinates(), { lat: 40.4093, lng: 49.8671 });

lifecycle.beginSetMode();
request = lifecycle.requestChange({ latitude: 40.41, longitude: 49.87, source: 'map', hasBoundData: false, requiresSetMode: true });
assert.strictEqual(request.action, 'apply');
lifecycle.recordApplied(request.coordinates.lat, request.coordinates.lng);
assert.strictEqual(lifecycle.getState(), alpha.LOCATION_STATES.UNCONFIRMED);
assert.deepStrictEqual(lifecycle.getAppliedCoordinates(), { lat: 40.41, lng: 49.87 });
assert.strictEqual(lifecycle.confirmApplied(), true);
assert.strictEqual(lifecycle.getState(), alpha.LOCATION_STATES.CONFIRMED);

lifecycle.setBoundDataPresent(true);
assert.strictEqual(lifecycle.getState(), alpha.LOCATION_STATES.LOCKED);
const beforeCancel = {
  state: lifecycle.getState(),
  applied: lifecycle.getAppliedCoordinates(),
  confirmed: lifecycle.getConfirmedCoordinates(),
  geometry: [{ id: 'RF-1', polygon: [[1, 2], [3, 4], [5, 6]] }],
  shadingOrigin: { lat: 40.41, lng: 49.87 },
  resourceFingerprint: 'resource-old',
  sldFingerprint: 'sld-old'
};
lifecycle.beginSetMode();
request = lifecycle.requestChange({ latitude: 41.0, longitude: 50.0, source: 'map', hasBoundData: true, requiresSetMode: true });
assert.strictEqual(request.action, 'relocate');
const afterCancel = {
  state: lifecycle.getState(),
  applied: lifecycle.getAppliedCoordinates(),
  confirmed: lifecycle.getConfirmedCoordinates(),
  geometry: beforeCancel.geometry,
  shadingOrigin: beforeCancel.shadingOrigin,
  resourceFingerprint: beforeCancel.resourceFingerprint,
  sldFingerprint: beforeCancel.sldFingerprint
};
assert.strictEqual(fingerprint(afterCancel), fingerprint(beforeCancel), 'cancel/request-only path must not mutate project-bound state');

lifecycle.setBoundDataPresent(false);
const relocated = lifecycle.applyRelocation(41.0, 50.0);
assert.strictEqual(relocated.ok, true);
assert.strictEqual(lifecycle.getState(), alpha.LOCATION_STATES.CONFIRMED);
assert.deepStrictEqual(lifecycle.getConfirmedCoordinates(), { lat: 41, lng: 50 });

for (const [lat, lng, field] of [[91, 0, 'latitude'], [-91, 0, 'latitude'], [0, 181, 'longitude'], [0, -181, 'longitude'], ['x', 0, 'latitude']]) {
  const invalid = alpha.validateCoordinates(lat, lng);
  assert.strictEqual(invalid.ok, false);
  assert(invalid.errors[field]);
}
assert.strictEqual(alpha.validateCoordinates(-90, -180).ok, true);
assert.strictEqual(alpha.validateCoordinates(90, 180).ok, true);

console.log('v2.3 Alpha A1 location lifecycle/guard: PASS');
