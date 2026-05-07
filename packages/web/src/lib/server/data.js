/**
 * Server-side data layer.
 *
 * Postgres-first when DATABASE_URL is set. Demo JSON only when not.
 * Same return shapes either way, so the route layer is identical.
 *
 * Performance: filterListings fetches matching rows + hits in two queries
 * (~50-100 ms for 5k rows on the VPS). Aggregation helpers run in JS over
 * the filtered set — fast at this volume.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, HAS_DB } from './db.js';
import { SOURCE_META } from '@signalstack/core/types';
import { DICTS } from '@signalstack/core/dict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_PATH = path.resolve(__dirname, '../../../data/demo.json');

export { HAS_DB };

/* ------------------------------------------------------------------ */
/*  Anchor / week-index helpers                                        */
/* ------------------------------------------------------------------ */

const WEEKS = 260;

let _anchorPromise = null;
/** Anchor = max(posted_at) in DB, or today. ts=259 maps to anchor week. */
async function getAnchor() {
  if (_anchorPromise) return _anchorPromise;
  _anchorPromise = (async () => {
    let anchor = new Date();
    if (HAS_DB) {
      try {
        const sql = db();
        const rows = await sql`SELECT max(posted_at) AS m FROM listings`;
        if (rows[0]?.m) anchor = new Date(rows[0].m);
      } catch { /* fall back to today */ }
    } else {
      try {
        const demo = await getDemo();
        if (demo?.nowDate) anchor = new Date(demo.nowDate);
      } catch { /* fall back */ }
    }
    return anchor;
  })();
  // refresh anchor every 6 hours so it follows new ingest
  setTimeout(() => { _anchorPromise = null; }, 6 * 3600 * 1000).unref?.();
  return _anchorPromise;
}

function dateToTs(date, anchor) {
  const ms = anchor.getTime() - new Date(date).getTime();
  const wk = Math.floor(ms / (7 * 86400000));
  return Math.max(0, Math.min(WEEKS - 1, WEEKS - 1 - wk));
}
function isoWeekStr(date) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const w = Math.ceil((((d - start) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Demo loader (fallback / local dev)                                 */
/* ------------------------------------------------------------------ */
let _demoCache = null;
async function getDemo() {
  if (_demoCache) return _demoCache;
  if (!existsSync(DEMO_PATH)) {
    throw new Error(`demo.json not found at ${DEMO_PATH}`);
  }
  _demoCache = JSON.parse(await readFile(DEMO_PATH, 'utf8'));
  return _demoCache;
}

/* ------------------------------------------------------------------ */
/*  Filter spec                                                        */
/* ------------------------------------------------------------------ */
const TIME_WEEKS = { '30d': 4, '6mo': 26, '1y': 52, '3y': 156, '5y': 260 };

export function defaultFilter() {
  return {
    time: '5y',
    sources: ['ted','bund','hn','github','junico','freelancermap','remoteok','wwr','remotive','jobicy','arbeitnow','himalayas','nofluffjobs','workingnomads'],
    lang: 'all',
    dict: 'D1',
    terms: [],
    mode: 'any',
    search: ''
  };
}
export function parseFilter(searchParams) {
  const f = defaultFilter();
  if (searchParams.has('t')) f.time = searchParams.get('t');
  if (searchParams.has('s')) f.sources = searchParams.get('s').split(',').filter(Boolean);
  if (searchParams.has('l')) f.lang = searchParams.get('l');
  if (searchParams.has('d')) f.dict = searchParams.get('d');
  if (searchParams.has('terms')) f.terms = searchParams.get('terms').split(',').filter(Boolean);
  if (searchParams.has('m')) f.mode = searchParams.get('m') === 'all' ? 'all' : 'any';
  if (searchParams.has('q')) f.search = searchParams.get('q');
  if (searchParams.has('v')) f.vertical = searchParams.get('v');
  return f;
}
export function encodeFilter(f) {
  const u = new URLSearchParams();
  if (f.time && f.time !== '5y') u.set('t', f.time);
  if (f.sources && f.sources.length < 14) u.set('s', f.sources.join(','));
  if (f.lang && f.lang !== 'all') u.set('l', f.lang);
  if (f.dict && f.dict !== 'D1') u.set('d', f.dict);
  if (f.terms?.length) u.set('terms', f.terms.join(','));
  if (f.mode && f.mode !== 'any') u.set('m', f.mode);
  if (f.search) u.set('q', f.search);
  if (f.vertical) u.set('v', f.vertical);
  return u.toString();
}

/* ------------------------------------------------------------------ */
/*  filterListings — DB or demo, with in-process TTL cache             */
/* ------------------------------------------------------------------ */
const FILTER_CACHE = new Map();
const FILTER_TTL_MS = 60_000;
const FILTER_CACHE_MAX = 32;

function cacheKey(spec) {
  return JSON.stringify({
    t: spec.time, s: [...(spec.sources ?? [])].sort().join(','),
    l: spec.lang, d: spec.dict, terms: [...(spec.terms ?? [])].sort().join(','),
    m: spec.mode, q: spec.search ?? '', v: spec.vertical ?? ''
  });
}

export async function filterListings(spec) {
  const anchor = await getAnchor();
  const key = cacheKey(spec);
  const now = Date.now();
  const hit = FILTER_CACHE.get(key);
  if (hit && (now - hit.at) < FILTER_TTL_MS) return hit.value;

  const value = HAS_DB
    ? await filterListingsDb(spec, anchor)
    : await filterListingsDemo(spec, anchor);

  FILTER_CACHE.set(key, { at: now, value });
  // bound cache size
  if (FILTER_CACHE.size > FILTER_CACHE_MAX) {
    const oldest = [...FILTER_CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) FILTER_CACHE.delete(oldest[0]);
  }
  return value;
}

async function filterListingsDb(spec, anchor) {
  const sql = db();
  const wks = TIME_WEEKS[spec.time] ?? WEEKS;
  const cutoff = new Date(anchor);
  cutoff.setUTCDate(cutoff.getUTCDate() - (wks - 1) * 7);

  // Term filter — pre-compute eligible listing IDs via term_hits
  let pool = null;
  const allTerms = [...(spec.terms ?? [])];
  if (spec.vertical) allTerms.push(`D6:${spec.vertical}`);

  if (allTerms.length) {
    // term_hits has columns (dict_key, term); we match on the concatenated
    // form to avoid the "anonymous composite" limitation in postgres.js.
    if (spec.mode === 'all' || spec.vertical) {
      // ALL mode — listing must have every term in the set
      const required = allTerms.length;
      const rows = await sql`
        SELECT listing_id FROM term_hits
        WHERE (dict_key || ':' || term) = ANY(${allTerms}::text[])
        GROUP BY listing_id
        HAVING count(DISTINCT dict_key || ':' || term) >= ${required}
      `;
      pool = new Set(rows.map(r => r.listing_id));
    } else {
      const rows = await sql`
        SELECT DISTINCT listing_id FROM term_hits
        WHERE (dict_key || ':' || term) = ANY(${allTerms}::text[])
      `;
      pool = new Set(rows.map(r => r.listing_id));
    }
    if (pool.size === 0) return [];
  }

  // Main query
  const langClause = spec.lang === 'all' ? sql`` : sql`AND l.language = ${spec.lang}`;
  const searchClause = spec.search ? sql`AND l.title ~* ${spec.search}` : sql``;
  const idClause = pool ? sql`AND l.id = ANY(${[...pool]}::text[])` : sql``;

  const rows = await sql`
    SELECT
      l.id, l.source_id AS src, l.posted_at, l.source_url AS source_url,
      l.language AS lang, l.title, l.city, l.bundesland,
      l.category AS cat, l.cpv_code AS cpv,
      l.budget_eur AS budget, l.budget_kind AS budget_kind,
      l.duration_days AS dur, l.remote
    FROM listings l
    WHERE l.is_canonical = true
      AND l.posted_at >= ${cutoff.toISOString().slice(0,10)}::date
      AND l.source_id = ANY(${spec.sources}::text[])
      ${langClause}
      ${searchClause}
      ${idClause}
    ORDER BY l.posted_at DESC
  `;

  if (rows.length === 0) return [];

  // Hits in batch
  const ids = rows.map(r => r.id);
  const hitRows = await sql`
    SELECT listing_id, dict_key, term
    FROM term_hits
    WHERE listing_id = ANY(${ids}::text[])
  `;
  const hitsMap = new Map();
  for (const h of hitRows) {
    const k = h.listing_id;
    if (!hitsMap.has(k)) hitsMap.set(k, []);
    hitsMap.get(k).push(`${h.dict_key}:${h.term}`);
  }

  return rows.map(r => ({
    id: r.id,
    src: r.src,
    ts: dateToTs(r.posted_at, anchor),
    postedAt: new Date(r.posted_at).toISOString().slice(0,10),
    week: isoWeekStr(r.posted_at),
    sourceUrl: r.source_url,
    lang: r.lang,
    title: r.title,
    city: r.city,
    bundesland: r.bundesland,
    cat: r.cat,
    cpv: r.cpv,
    budget: r.budget != null ? Number(r.budget) : null,
    budgetKind: r.budget_kind,
    dur: r.dur,
    remote: r.remote,
    hits: hitsMap.get(r.id) ?? []
  }));
}

async function filterListingsDemo(spec, anchor) {
  const demo = await getDemo();
  const wks = TIME_WEEKS[spec.time] ?? WEEKS;
  const cutoffWeek = WEEKS - wks;
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

function safeRegex(s) {
  try { return new RegExp(s, 'i'); }
  catch { return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i'); }
}

/* ------------------------------------------------------------------ */
/*  Aggregations — operate on the filtered listing array               */
/*  (works identically for DB or demo)                                 */
/* ------------------------------------------------------------------ */

export function topTerms(listings, dictKey, limit = 20) {
  const counts = new Map();
  const prefix = dictKey + ':';
  for (const l of listings) for (const h of l.hits) {
    if (h.startsWith(prefix)) {
      const t = h.slice(prefix.length);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit);
}

export function termTimeSeries(listings, hit, weeks = WEEKS) {
  const arr = new Array(weeks).fill(0);
  for (const l of listings) if (l.hits.includes(hit)) arr[l.ts]++;
  return arr;
}

export function volumeByWeekSource(listings, weeks, sources) {
  const out = Object.fromEntries(sources.map(s => [s, new Array(weeks).fill(0)]));
  for (const l of listings) if (out[l.src]) out[l.src][l.ts]++;
  return out;
}

export function geoBreakdown(listings, limit = 20) {
  const m = new Map();
  for (const l of listings) m.set(l.city, (m.get(l.city) ?? 0) + 1);
  return [...m.entries()].filter(([k]) => k != null).sort((a,b) => b[1] - a[1]).slice(0, limit);
}
export function categoryBreakdown(listings, limit = 12) {
  const m = new Map();
  for (const l of listings) m.set(l.cat, (m.get(l.cat) ?? 0) + 1);
  return [...m.entries()].filter(([k]) => k != null).sort((a,b) => b[1] - a[1]).slice(0, limit);
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
    mean: vals.length ? Math.round(vals.reduce((a,b) => a + b, 0) / vals.length) : 0
  };
}

export function moneyFlow(listings) {
  let totalContract = 0, totalDayRate = 0;
  let highValue = [];
  let disclosed = 0;
  const byCity = new Map();
  const byCat = new Map();
  const byTerm = new Map();
  for (const l of listings) {
    if (l.budget == null) continue;
    disclosed++;
    let value = 0;
    if (l.budgetKind === 'project') value = l.budget;
    else if (l.budgetKind === 'day') value = l.budget * (l.dur ?? 20);
    else if (l.budgetKind === 'hour') value = l.budget * (l.dur ?? 20) * 8;
    // Categorize by what's being measured, not which source produced it.
    if (l.budgetKind === 'project') totalContract += value;
    else totalDayRate += value;
    if (value >= 100_000) highValue.push({ ...l, projectedValue: value });
    if (l.city) byCity.set(l.city, (byCity.get(l.city) ?? 0) + value);
    if (l.cat) byCat.set(l.cat, (byCat.get(l.cat) ?? 0) + value);
    for (const h of l.hits) {
      const e = byTerm.get(h) ?? { sum: 0, n: 0 };
      e.sum += value; e.n++; byTerm.set(h, e);
    }
  }
  highValue.sort((a, b) => b.projectedValue - a.projectedValue);
  return {
    total: totalContract + totalDayRate,
    totalContract,
    totalDayRate,
    disclosureRate: listings.length ? disclosed / listings.length : 0,
    n: listings.length,
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

export function topMovers(listings, dictKey, weeks) {
  const half = Math.floor(weeks / 2);
  const cutoffMid = (WEEKS - weeks) + half;
  const cur = new Map(), prev = new Map();
  const prefix = dictKey + ':';
  for (const l of listings) {
    const bucket = l.ts >= cutoffMid ? cur : prev;
    for (const h of l.hits) if (h.startsWith(prefix)) {
      const t = h.slice(prefix.length);
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

/* ------------------------------------------------------------------ */
/*  Single record + meta                                               */
/* ------------------------------------------------------------------ */

export async function getListingById(id) {
  if (HAS_DB) {
    const sql = db();
    const rows = await sql`
      SELECT l.*, l.posted_at AS posted_at_d, l.source_url AS source_url
      FROM listings l WHERE l.id = ${id} LIMIT 1
    `;
    if (!rows.length) return null;
    const l = rows[0];
    const hits = (await sql`
      SELECT dict_key, term FROM term_hits WHERE listing_id = ${id}
    `).map(h => `${h.dict_key}:${h.term}`);
    const anchor = await getAnchor();
    return {
      id: l.id, src: l.source_id, ts: dateToTs(l.posted_at_d, anchor),
      postedAt: new Date(l.posted_at_d).toISOString().slice(0,10),
      week: isoWeekStr(l.posted_at_d),
      sourceUrl: l.source_url,
      lang: l.language, title: l.title, description: l.description ?? '',
      city: l.city, bundesland: l.bundesland,
      cat: l.category, cpv: l.cpv_code,
      budget: l.budget_eur != null ? Number(l.budget_eur) : null,
      budgetKind: l.budget_kind,
      dur: l.duration_days, remote: l.remote, hits
    };
  }
  const demo = await getDemo();
  return demo.listings.find(l => l.id === id) ?? null;
}

let _metaCache = null;
let _metaCacheAt = 0;
export async function getMeta() {
  const now = Date.now();
  if (_metaCache && (now - _metaCacheAt) < 60_000) return _metaCache;
  const dicts = Object.fromEntries(
    Object.entries(DICTS).map(([k, d]) => [k, { name: d.name, terms: d.terms.map(t => t.canonical) }])
  );
  let totalListings = 0;
  let backend = 'demo';
  if (HAS_DB) {
    backend = 'postgres';
    try {
      const sql = db();
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM listings`;
      totalListings = count;
    } catch { totalListings = 0; }
  } else {
    try { const demo = await getDemo(); totalListings = demo.listings.length; } catch {}
  }
  const anchor = await getAnchor();
  _metaCache = {
    sources: SOURCE_META,
    dicts,
    weeks: WEEKS,
    nowDate: anchor.toISOString().slice(0, 10),
    totalListings,
    backend
  };
  _metaCacheAt = now;
  return _metaCache;
}
