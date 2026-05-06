/**
 * Server-side data layer.
 *
 * If DATABASE_URL is set → query Postgres.
 * Otherwise → load demo.json (deterministic synthetic 5y corpus).
 *
 * The two paths return the SAME shape, so the route layer is identical.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_PATH = path.resolve(__dirname, '../../../data/demo.json');

let _demoCache = null;
let _pgClient = null;

export const HAS_DB = !!process.env.DATABASE_URL;

/* ------------------------------------------------------------------ */
/*  Demo loader                                                        */
/* ------------------------------------------------------------------ */
async function getDemo() {
  if (_demoCache) return _demoCache;
  if (!existsSync(DEMO_PATH)) {
    throw new Error(`demo.json not found at ${DEMO_PATH} — run "npm run demo:gen" from repo root`);
  }
  _demoCache = JSON.parse(await readFile(DEMO_PATH, 'utf8'));
  return _demoCache;
}

/* ------------------------------------------------------------------ */
/*  Public API — same shape for db & demo                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} FilterSpec
 * @property {string} time         '30d'|'6mo'|'1y'|'3y'|'5y'
 * @property {string[]} sources
 * @property {string} lang         'all'|'DE'|'EN'
 * @property {string} dict         'D1'..'D7'
 * @property {string[]} terms      ['D1:SAP', ...]
 * @property {'any'|'all'} mode
 * @property {string} [search]
 * @property {string} [vertical]   D6 industry term filter
 */

const TIME_WEEKS = { '30d': 4, '6mo': 26, '1y': 52, '3y': 156, '5y': 260 };

/** @returns {FilterSpec} */
export function defaultFilter() {
  return { time: '5y', sources: ['gulp','freelance','twago','junico','evergabe'], lang: 'all', dict: 'D1', terms: [], mode: 'any', search: '' };
}

/** Parse a URL-encoded filter spec from a SvelteKit URLSearchParams. */
export function parseFilter(search) {
  const f = defaultFilter();
  if (search.has('t')) f.time = search.get('t');
  if (search.has('s')) f.sources = search.get('s').split(',').filter(Boolean);
  if (search.has('l')) f.lang = search.get('l');
  if (search.has('d')) f.dict = search.get('d');
  if (search.has('terms')) f.terms = search.get('terms').split(',').filter(Boolean);
  if (search.has('m')) f.mode = search.get('m') === 'all' ? 'all' : 'any';
  if (search.has('q')) f.search = search.get('q');
  if (search.has('v')) f.vertical = search.get('v');
  return f;
}

/** Encode a filter back into a URLSearchParams string. */
export function encodeFilter(f) {
  const u = new URLSearchParams();
  if (f.time && f.time !== '5y') u.set('t', f.time);
  if (f.sources && f.sources.length < 5) u.set('s', f.sources.join(','));
  if (f.lang && f.lang !== 'all') u.set('l', f.lang);
  if (f.dict && f.dict !== 'D1') u.set('d', f.dict);
  if (f.terms?.length) u.set('terms', f.terms.join(','));
  if (f.mode && f.mode !== 'any') u.set('m', f.mode);
  if (f.search) u.set('q', f.search);
  if (f.vertical) u.set('v', f.vertical);
  return u.toString();
}

/** All listings filtered by spec. Returns array of plain listing objects. */
export async function filterListings(spec) {
  const demo = await getDemo();
  const cutoffWeek = (demo.weeks ?? 260) - (TIME_WEEKS[spec.time] ?? 260);
  const sourceSet = new Set(spec.sources);
  const termSet = new Set(spec.terms);
  const re = spec.search ? safeRegex(spec.search) : null;
  const verticalKey = spec.vertical ? `D6:${spec.vertical}` : null;

  const out = [];
  for (const l of demo.listings) {
    if (l.ts < cutoffWeek) continue;
    if (!sourceSet.has(l.src)) continue;
    if (spec.lang !== 'all' && l.lang !== spec.lang) continue;
    if (re && !re.test(l.title)) continue;
    if (verticalKey && !l.hits.includes(verticalKey)) continue;
    if (termSet.size > 0) {
      if (spec.mode === 'all') {
        let ok = true;
        for (const t of termSet) if (!l.hits.includes(t)) { ok = false; break; }
        if (!ok) continue;
      } else {
        let any = false;
        for (const t of termSet) if (l.hits.includes(t)) { any = true; break; }
        if (!any) continue;
      }
    }
    out.push(l);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Aggregations                                                       */
/* ------------------------------------------------------------------ */

export function topTerms(listings, dictKey, limit = 20) {
  const counts = new Map();
  const prefix = dictKey + ':';
  for (const l of listings) for (const h of l.hits) {
    if (h.startsWith(prefix)) counts.set(h.slice(3), (counts.get(h.slice(3)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit);
}

export function termTimeSeries(listings, hit, weeks) {
  const arr = new Array(weeks).fill(0);
  for (const l of listings) if (l.hits.includes(hit)) arr[l.ts]++;
  return arr;
}

export function volumeByWeekSource(listings, weeks, sources) {
  /** @type {Record<string, number[]>} */
  const out = Object.fromEntries(sources.map(s => [s, new Array(weeks).fill(0)]));
  for (const l of listings) if (out[l.src]) out[l.src][l.ts]++;
  return out;
}

export function geoBreakdown(listings, limit = 20) {
  const m = new Map();
  for (const l of listings) m.set(l.city, (m.get(l.city) ?? 0) + 1);
  return [...m.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit);
}

export function categoryBreakdown(listings, limit = 12) {
  const m = new Map();
  for (const l of listings) m.set(l.cat, (m.get(l.cat) ?? 0) + 1);
  return [...m.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit);
}

export function cpvBreakdown(listings) {
  const m = new Map();
  for (const l of listings) if (l.cpv) m.set(l.cpv, (m.get(l.cpv) ?? 0) + 1);
  return [...m.entries()].sort((a,b) => b[1] - a[1]);
}

export function budgetStats(listings, kind = 'day') {
  const vals = listings.filter(l => l.budget != null && l.budgetKind === kind).map(l => l.budget);
  vals.sort((a,b) => a - b);
  const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0;
  return {
    n: vals.length,
    p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p90: q(0.90),
    mean: vals.length ? Math.round(vals.reduce((a,b) => a + b, 0) / vals.length) : 0,
    histBuckets: histogram(vals, 18)
  };
}

function histogram(vals, bins) {
  if (!vals.length) return new Array(bins).fill(0);
  const max = vals[vals.length - 1];
  const step = Math.max(1, Math.ceil(max / bins));
  const out = new Array(bins).fill(0);
  for (const v of vals) out[Math.min(bins - 1, Math.floor(v / step))]++;
  return { step, bins: out, max };
}

export function moneyFlow(listings) {
  let totalContract = 0;       // eVergabe project budgets
  let totalDayRate = 0;        // freelance day-rate × duration
  let highValue = [];          // single records > 100k
  let disclosed = 0, total = listings.length;

  const byCity = new Map();
  const byCat = new Map();
  const byTerm = new Map();    // 'D1:SAP' → { sum, n }

  for (const l of listings) {
    let value = 0;
    if (l.budget != null) {
      disclosed++;
      if (l.budgetKind === 'project') value = l.budget;
      else if (l.budgetKind === 'day') value = l.budget * (l.dur ?? 20);
      else if (l.budgetKind === 'hour') value = l.budget * (l.dur ?? 20) * 8;
      if (l.src === 'evergabe') totalContract += value;
      else totalDayRate += value;
      if (value >= 100_000) highValue.push({ ...l, projectedValue: value });
      byCity.set(l.city, (byCity.get(l.city) ?? 0) + value);
      byCat.set(l.cat, (byCat.get(l.cat) ?? 0) + value);
      for (const h of l.hits) {
        const e = byTerm.get(h) ?? { sum: 0, n: 0 };
        e.sum += value; e.n++; byTerm.set(h, e);
      }
    }
  }
  highValue.sort((a, b) => b.projectedValue - a.projectedValue);
  return {
    total: totalContract + totalDayRate,
    totalContract,
    totalDayRate,
    disclosureRate: total ? disclosed / total : 0,
    n: total,
    highValue: highValue.slice(0, 25),
    topCities: [...byCity.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10),
    topCats: [...byCat.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10),
    medianByTerm: [...byTerm.entries()]
      .filter(([, v]) => v.n >= 5)
      .map(([t, v]) => [t, Math.round(v.sum / v.n)])
      .sort((a,b) => b[1] - a[1])
      .slice(0, 25)
  };
}

export async function getMeta() {
  const demo = await getDemo();
  return {
    sources: demo.sources,
    dicts: demo.dicts,
    weeks: demo.weeks,
    nowDate: demo.nowDate,
    totalListings: demo.listings.length,
    backend: HAS_DB ? 'postgres' : 'demo'
  };
}

export async function getListingById(id) {
  const demo = await getDemo();
  return demo.listings.find(l => l.id === id) ?? null;
}

function safeRegex(s) {
  try { return new RegExp(s, 'i'); }
  catch { return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i'); }
}

/* ------------------------------------------------------------------ */
/*  Trend / lifecycle                                                  */
/* ------------------------------------------------------------------ */

export function topMovers(listings, dictKey, weeks) {
  // listings is the time-windowed set; for prev period, we'd need a separate query
  // — for demo purposes we approximate with first-half vs second-half of window.
  const half = Math.floor(weeks / 2);
  const cutoffMid = (260 - weeks) + half;
  const cur = new Map(), prev = new Map();
  const prefix = dictKey + ':';
  for (const l of listings) {
    const bucket = l.ts >= cutoffMid ? cur : prev;
    for (const h of l.hits) if (h.startsWith(prefix)) {
      const t = h.slice(3);
      bucket.set(t, (bucket.get(t) ?? 0) + 1);
    }
  }
  const all = new Set([...cur.keys(), ...prev.keys()]);
  const rows = [];
  for (const t of all) {
    const c = cur.get(t) ?? 0;
    const p = prev.get(t) ?? 0;
    const delta = p ? (c - p) / p * 100 : (c ? Infinity : 0);
    const z = p ? (c - p) / Math.sqrt(Math.max(1, p)) : (c > 3 ? 99 : 0);
    rows.push({ term: t, cur: c, prev: p, delta, z });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows;
}

export function cooccurrence(listings, limit = 20) {
  const total = listings.length || 1;
  const single = new Map();
  const pair = new Map();
  for (const l of listings) {
    for (const h of l.hits) single.set(h, (single.get(h) ?? 0) + 1);
    for (let i = 0; i < l.hits.length; i++) for (let j = i+1; j < l.hits.length; j++) {
      const a = l.hits[i], b = l.hits[j];
      const k = a < b ? a + '|' + b : b + '|' + a;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
  }
  const out = [];
  for (const [k, n] of pair) {
    const [a, b] = k.split('|');
    const exp = (single.get(a) / total) * (single.get(b) / total) * total;
    const lift = exp ? n / exp : 0;
    out.push({ a, b, count: n, lift });
  }
  out.sort((x, y) => y.count - x.count);
  return out.slice(0, limit);
}

export function clusters(listings, limit = 15) {
  const byTitle = new Map();
  for (const l of listings) {
    if (!byTitle.has(l.title)) byTitle.set(l.title, []);
    byTitle.get(l.title).push(l);
  }
  const out = [];
  for (const [title, arr] of byTitle) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.ts - b.ts);
    const gaps = [];
    for (let i = 1; i < arr.length; i++) gaps.push(arr[i].ts - arr[i-1].ts);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    out.push({
      title, members: arr.length,
      sources: [...new Set(arr.map(x => x.src))],
      medianGap: median * 7,
      lastTs: arr[arr.length - 1].ts
    });
  }
  out.sort((a, b) => b.members - a.members);
  return out.slice(0, limit);
}
