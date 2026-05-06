/**
 * Trend math: rolling mean, OLS slope (log-counts), Poisson z-score, CUSUM,
 * and a tiny Holt-Winters-ish forecast.
 *
 * All functions take/return plain arrays of numbers — no objects, no deps.
 */

/**
 * Simple rolling mean over window w (right-aligned).
 * @param {number[]} arr
 * @param {number} w
 * @returns {number[]}
 */
export function rollingMean(arr, w) {
  if (w <= 1) return arr.slice();
  const out = new Array(arr.length).fill(0);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= w) sum -= arr[i - w];
    out[i] = i >= w - 1 ? sum / w : sum / (i + 1);
  }
  return out;
}

/**
 * OLS slope on log(1 + count) vs index — robust to zeros.
 * Returns the slope per unit index.
 * @param {number[]} arr
 * @returns {number}
 */
export function logSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const xs = arr.map((_, i) => i);
  const ys = arr.map(v => Math.log(1 + v));
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Poisson z-score for the last value of arr vs the mean of the rest.
 * Handles small counts gracefully.
 * @param {number[]} arr
 * @returns {number}
 */
export function poissonZ(arr) {
  if (arr.length < 4) return 0;
  const last = arr[arr.length - 1];
  const past = arr.slice(0, -1);
  const mean = past.reduce((a, b) => a + b, 0) / past.length;
  if (mean === 0) return last > 3 ? 99 : 0;
  return (last - mean) / Math.sqrt(mean);
}

/**
 * Simple CUSUM change-point detector.
 * Returns indices where positive cumulative sum exceeds h*sigma.
 * @param {number[]} arr
 * @param {number} k drift parameter (default 0.5)
 * @param {number} h threshold multiplier (default 4)
 * @returns {number[]}
 */
export function cusum(arr, k = 0.5, h = 4) {
  if (arr.length < 4) return [];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 1;
  let posCum = 0, negCum = 0;
  const points = [];
  for (let i = 0; i < arr.length; i++) {
    const z = (arr[i] - mean) / sd;
    posCum = Math.max(0, posCum + z - k);
    negCum = Math.min(0, negCum + z + k);
    if (posCum > h || negCum < -h) {
      points.push(i);
      posCum = 0; negCum = 0;
    }
  }
  return points;
}

/**
 * Forecast next n values using EMA-on-trend.
 * Lightweight stand-in for Holt-Winters.
 * @param {number[]} arr
 * @param {number} n number of future steps
 * @param {number} alpha smoothing factor 0..1
 * @returns {number[]}
 */
export function forecast(arr, n, alpha = 0.4) {
  if (arr.length === 0) return new Array(n).fill(0);
  let level = arr[0];
  let trend = arr.length > 1 ? arr[1] - arr[0] : 0;
  for (let i = 1; i < arr.length; i++) {
    const prev = level;
    level = alpha * arr[i] + (1 - alpha) * (level + trend);
    trend = alpha * (level - prev) + (1 - alpha) * trend;
  }
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = Math.max(0, level + (k + 1) * trend);
  return out;
}

/**
 * Classify a term's lifecycle from a recent series + a longer baseline.
 * @param {number[]} recent last N weekly counts
 * @param {number[]} baseline preceding period of same length
 * @returns {'emerging'|'growing'|'stable'|'declining'|'dying'}
 */
export function lifecycle(recent, baseline) {
  const rSum = sum(recent);
  const bSum = sum(baseline);
  const slope = logSlope(recent);
  const isLow = rSum < 5;
  const isVeryLow = rSum < 2;

  if (isVeryLow && bSum > 0) return 'dying';
  if (isLow && bSum < 2) return 'emerging';
  if (slope > 0.05) return rSum > bSum ? 'growing' : 'emerging';
  if (slope < -0.05) return rSum < bSum * 0.6 ? 'dying' : 'declining';
  return 'stable';
}

const sum = a => a.reduce((x, y) => x + y, 0);

/**
 * Quantile from a sorted-or-unsorted array.
 * @param {number[]} arr
 * @param {number} q in [0,1]
 */
export function quantile(arr, q) {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(s.length * q));
  return s[i];
}
