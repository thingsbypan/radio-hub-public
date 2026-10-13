const { test } = require('node:test');
const assert = require('node:assert/strict');
const { metricModel, audioLevels } = require('../dashboard/components');
const modules = require('../modules');
const receivers = require('../receivers');
const fs = require('node:fs');
const path = require('node:path');
const now = Date.parse('2026-10-01T00:00:00Z');
const sample = { value: -62, unit: 'dBm', min: -120, max: 0, observedAt: '2026-09-30T23:59:50Z', maxAgeMs: 30000 };
test('real RF readings retain units and calibrated meter range', () => {
  const result = metricModel(sample, now);
  assert.equal(result.state, 'live'); assert.equal(result.value, -62);
  assert.equal(result.fraction, 58 / 120);
});
test('audio meters use actual RMS and peak in dBFS', () => {
  const result = audioLevels(new Float32Array([.5, -.5, .5, -.5]));
  assert.ok(Math.abs(result.rms + 6.0206) < .0001);
  assert.equal(result.rms, result.peak);
  assert.deepEqual(audioLevels(new Float32Array([0,0])), { rms: -100, peak: -100 });
  assert.deepEqual(audioLevels([]), { rms: null, peak: null });
  assert.deepEqual(audioLevels([NaN]), { rms: null, peak: null });
});
test('missing, invalid and disconnected data never becomes zero', () => {
  for (const value of [null, undefined, NaN, Infinity, '42']) assert.equal(metricModel({ ...sample, value }, now).value, null);
  assert.equal(metricModel({ ...sample, state: 'not-connected' }, now).value, null);
  assert.equal(metricModel({ ...sample, observedAt: undefined }, now).state, 'unavailable');
});
test('stale readings retain value but are marked stale', () => {
  const result = metricModel(sample, now + 60000);
  assert.equal(result.state, 'stale'); assert.equal(result.value, -62);
});
test('future timestamps and invalid ranges are not plausible live data', () => {
  assert.equal(metricModel({ ...sample, observedAt: '2026-10-02T00:00:00Z' }, now).state, 'unavailable');
  assert.equal(metricModel({ ...sample, min: 1, max: 1 }, now).fraction, null);
  assert.equal(metricModel({ ...sample, value: 10 }, now).fraction, 1);
});
test('module navigation covers the three supported receiver modules', () => {
  assert.deepEqual(modules.map(m => m.id), ['hf', 'noaa', 'radio']);
  assert.ok(receivers.some(r => r.id === 'twente'));
  assert.equal(new Set([...modules, ...receivers].map(m => m.id)).size, modules.length + receivers.length);
  for (const module of modules) assert.ok(fs.existsSync(path.join(__dirname, '..', module.file)));
});
