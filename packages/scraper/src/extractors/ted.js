/**
 * TED — EU public procurement open data API
 * https://ted.europa.eu / https://api.ted.europa.eu
 *
 * Public domain by design (EU Reg. 1816/2003). No auth, free for any use.
 * We self-cap at 1 req / 2s to be polite.
 *
 * Each TED "notice" = one ParsedListing. Source URL points to the German-
 * language detail page so the drillthrough opens the real document.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, normalizeGeo } from '@signalstack/core/normalize';

const API = 'https://api.ted.europa.eu/v3/notices/search';
const UA = 'SignalStack/0.1 (+ops@parallelship.com)';

const FIELDS = [
  'publication-number','publication-date',
  'notice-title','buyer-name','buyer-city',
  'classification-cpv','total-value','total-value-cur',
  'procedure-type','place-of-performance','links'
];

const REQ_DELAY_MS = Number(process.env.TED_DELAY_MS ?? 2000);
const PAGE_SIZE = Number(process.env.TED_PAGE_SIZE ?? 250);
const MAX_PAGES = Number(process.env.TED_MAX_PAGES ?? 20);              // 20 × 250 = 5 000 notices per run
const SINCE_DAYS_DEFAULT = Number(process.env.TED_SINCE_DAYS ?? 365);   // first run pulls ~1 year history

// NUTS DE region prefix → city/Bundesland approximation
const NUTS_TO_BL = {
  DE1: 'BW', DE2: 'BY', DE3: 'BE', DE4: 'BB', DE5: 'HB', DE6: 'HH',
  DE7: 'HE', DE8: 'MV', DE9: 'NI', DEA: 'NW', DEB: 'RP', DEC: 'SL',
  DED: 'SN', DEE: 'ST', DEF: 'SH', DEG: 'TH'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ymd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function search(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA, accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    if (res.status === 429) {
      // honour 429 cleanly
      const retry = Number(res.headers.get('retry-after') ?? 30);
      await sleep(retry * 1000);
    }
    throw new Error(`TED ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'ted',
  nativeArchiveMonths: 60,

  async *fetch(since, signal) {
    const sinceDate = since ? new Date(since) : (() => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - SINCE_DAYS_DEFAULT); return d;
    })();
    const sinceYmd = ymd(sinceDate);
    const query = `buyer-country=DEU AND publication-date>=${sinceYmd}`;

    let page = 1;
    while (page <= MAX_PAGES) {
      if (signal?.aborted) return;
      const payload = { query, fields: FIELDS, limit: PAGE_SIZE, page };
      let body;
      try { body = await search(payload); }
      catch (err) {
        // Yield a poison RawDoc so the runner can quarantine the failure
        yield {
          ...makeRaw('ted', `${API}#page=${page}`, JSON.stringify({ error: String(err.message ?? err), page })),
          httpStatus: 0,
          _items: []
        };
        return;
      }
      const notices = body.notices ?? [];
      if (notices.length === 0) return;

      // Bundle this page into one RawDoc + emit
      yield {
        ...makeRaw('ted', `${API}#page=${page}`, JSON.stringify(body)),
        _items: notices
      };

      if (notices.length < PAGE_SIZE) return; // last page
      page++;
      await sleep(REQ_DELAY_MS);
    }
  },

  async parse(raw) {
    if (raw.httpStatus === 0) return { status: 'error', message: 'fetch failed' };
    const items = raw._items ?? [];
    if (!items.length) return { status: 'error', message: 'empty page' };
    return { status: 'ok', listing: mapItem(items[0]) };
  },

  enrich: defaultEnrich
};

/** Map a TED notice to ParsedListing. Exported for the ingest pipeline. */
export function mapItem(n) {
  const title = pickLang(n['notice-title']) ?? '(untitled)';
  const buyerName = pickLang(n['buyer-name']);
  const buyerCity = pickLang(n['buyer-city']);
  const description = [buyerName, buyerCity].filter(Boolean).join(' · ');
  const postedAt = parseTedDate(n['publication-date']);
  const lang = detectLang(title) ?? 'DE';
  const cpvCodes = Array.isArray(n['classification-cpv']) ? n['classification-cpv'] : [];
  const cpv = cpvCodes[0] ?? null;
  const sourceUrl = n.links?.html?.DEU ?? n.links?.html?.ENG ?? n.links?.htmlDirect?.DEU ?? null;
  const value = pickValue(n['total-value']);
  const curRaw = pickLang(n['total-value-cur']) ?? pickValue(n['total-value-cur']) ?? 'EUR';
  const valueCur = String(curRaw).toUpperCase();
  const budgetEur = (value != null && valueCur === 'EUR') ? Math.round(value) : null;

  // Approximate city + Bundesland from buyer-city + NUTS
  const { city, bundesland } = resolveGeo(buyerCity, n['place-of-performance']);

  return {
    sourceId: 'ted',
    sourceUrl,
    title: title.slice(0, 320),
    description,
    postedAt,
    language: lang,
    category: classifyCpv(cpv),
    cpvCode: cpv,
    budgetEur,
    budgetKind: budgetEur != null ? 'project' : null,
    durationDays: null,
    city,
    bundesland,
    remote: false
  };
}

function pickLang(field) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) return field.find(v => typeof v === 'string') ?? null;
  // Multilingual record: prefer DE, then EN, then any. Each value may be a
  // string OR an array of strings.
  const order = ['deu', 'eng', 'mul', 'fra', 'ita', 'spa'];
  for (const key of [...order, ...Object.keys(field)]) {
    const v = field[key];
    if (typeof v === 'string' && v.length) return v;
    if (Array.isArray(v)) { const s = v.find(x => typeof x === 'string' && x.length); if (s) return s; }
  }
  return null;
}

function parseTedDate(s) {
  if (!s) return new Date();
  // shape "2026-04-29+02:00" — slice ISO date prefix and treat as UTC
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function pickValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return isFinite(n) ? n : null; }
  if (Array.isArray(v)) return pickValue(v[0]);
  if (typeof v === 'object') return pickValue(Object.values(v)[0]);
  return null;
}

function resolveGeo(buyerCity, perf) {
  let city = null, bundesland = null;
  if (buyerCity) city = String(buyerCity).split(/[,\/]/)[0].trim();
  if (city) ({ city, bundesland } = normalizeGeoOrFallback(city));
  if (!bundesland && Array.isArray(perf)) {
    for (const p of perf) {
      if (typeof p !== 'string') continue;
      const pre = p.slice(0, 3).toUpperCase();
      if (NUTS_TO_BL[pre]) { bundesland = NUTS_TO_BL[pre]; break; }
    }
  }
  return { city, bundesland };
}
function normalizeGeoOrFallback(raw) {
  const r = normalizeGeo(raw);
  return r;
}

/** Map CPV root to a coarse category we display. */
function classifyCpv(code) {
  if (!code) return null;
  const root = code.slice(0, 2);
  const t = {
    '03': 'Agriculture', '09': 'Energy', '14': 'Mining',
    '15': 'Food', '16': 'Agricultural eq.', '18': 'Apparel',
    '19': 'Leather', '22': 'Print', '24': 'Chemicals',
    '30': 'Office eq.', '31': 'Electrical', '32': 'Telecom',
    '33': 'Medical', '34': 'Transport eq.', '35': 'Security',
    '37': 'Music/sport', '38': 'Lab eq.', '39': 'Furniture',
    '41': 'Water', '42': 'Industrial machinery', '43': 'Mining mach.',
    '44': 'Materials', '45': 'Construction', '48': 'Software',
    '50': 'Repair', '51': 'Installation',
    '55': 'Hospitality', '60': 'Transport',
    '63': 'Logistics', '64': 'Postal', '65': 'Utilities',
    '66': 'Finance', '70': 'Real estate', '71': 'Engineering',
    '72': 'IT services', '73': 'R&D', '75': 'Public admin',
    '76': 'Oil & gas', '77': 'Forestry',
    '79': 'Business services', '80': 'Education', '85': 'Health',
    '90': 'Environment', '92': 'Recreation', '98': 'Other'
  };
  return t[root] ?? `CPV ${root}`;
}

export default extractor;
