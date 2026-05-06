import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollingMean, logSlope, poissonZ, cusum, forecast, lifecycle, quantile } from '../src/trend.js';

test('rollingMean with window 3 returns same length', () => {
  const out = rollingMean([1,2,3,4,5,6], 3);
  assert.equal(out.length, 6);
  assert.equal(out[5], 5); // (4+5+6)/3
});

test('logSlope is positive for increasing series', () => {
  const inc = [1,2,4,8,16,32];
  assert.ok(logSlope(inc) > 0.5);
});

test('logSlope is negative for decreasing series', () => {
  const dec = [32,16,8,4,2,1];
  assert.ok(logSlope(dec) < -0.5);
});

test('poissonZ flags an obvious spike', () => {
  const z = poissonZ([2,3,2,3,2,40]);
  assert.ok(z > 3, `expected z>3, got ${z}`);
});

test('cusum returns no points for stable series', () => {
  const stable = [10,11,9,10,11,10,9,10];
  assert.deepEqual(cusum(stable, 0.5, 4), []);
});

test('cusum picks up sustained shift', () => {
  const shift = [1,1,1,1,1,8,8,8,8,8,8,8];
  const cps = cusum(shift, 0.5, 2);
  assert.ok(cps.length > 0);
});

test('forecast returns n future values, all >= 0', () => {
  const out = forecast([5,6,7,8,9,10], 4);
  assert.equal(out.length, 4);
  for (const v of out) assert.ok(v >= 0);
});

test('lifecycle classifies a flat series as stable', () => {
  const flat = [10,10,10,10];
  assert.equal(lifecycle(flat, flat), 'stable');
});

test('lifecycle classifies a fading series as declining or dying', () => {
  const baseline = [10,10,10,10,10,10,10,10];
  const recent = [3,2,1,1,0,0,1,0];
  const cls = lifecycle(recent, baseline);
  assert.ok(cls === 'declining' || cls === 'dying', `got ${cls}`);
});

test('quantile returns p50 of a known distribution', () => {
  assert.equal(quantile([1,2,3,4,5], 0.5), 3);
});
