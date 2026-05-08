/**
 * NoFluffJobs — Polish/EU IT job board with public JSON API.
 *   https://nofluffjobs.com/api/posting?limit=N
 *
 * The unfiltered endpoint returns 150 MB. We cap with limit=200 and
 * still get rich data: title, company, location, technology, salary.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate, normalizeGeo } from '@signalstack/core/normalize';
import { canonicalRole, canonicalEmployer } from '@signalstack/core/canonical-role';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://nofluffjobs.com/api/posting';
const LIMIT = Number(process.env.NOFLUFFJOBS_LIMIT ?? 800);  // W2: 200 → 800 (clean salary p50 + role-recurrence signal)

const CUR_TO_EUR = { PLN: 0.23, USD: 0.92, EUR: 1.0, GBP: 1.18, CHF: 1.05 };

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'nofluffjobs',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    const url = `${API}?limit=${LIMIT}`;
    let body, items;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw new Error(`NoFluffJobs ${res.status}`);
      const json = await res.json();
      // payload field name varies: postings, jobs, items
      const arr = json.postings ?? json.data ?? json.items ?? json.jobs ?? [];
      items = arr.filter(j => j && (j.id || j.url));
      // cap to keep DB writes reasonable
      items = items.slice(0, LIMIT);
      body = JSON.stringify({ count: items.length });
    } catch (err) {
      yield { ...makeRaw('nofluffjobs', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('nofluffjobs', url, body), _items: items };
  },

  async parse(raw) {
    if (raw.httpStatus === 0) return { status: 'error', message: 'fetch failed' };
    const items = raw._items ?? [];
    if (!items.length) return { status: 'error', message: 'empty' };
    return { status: 'ok', listing: mapItem(items[0]) };
  },

  enrich: defaultEnrich
};

export function mapItem(j) {
  const title = String(j.title ?? '(untitled)').slice(0, 320);
  const company = String(j.name ?? j.companyName ?? '');
  const tech = String(j.technology ?? '');
  const id = String(j.id ?? '');
  const sourceUrl = id ? `https://nofluffjobs.com/job/${id}` : 'https://nofluffjobs.com';
  const postedAt = j.posted ? new Date(Number(j.posted)) : (j.renewed ? new Date(Number(j.renewed)) : new Date());

  const places = Array.isArray(j.location?.places) ? j.location.places : [];
  const cityRaw = places[0]?.city;
  const cityRaw2 = places.find(p => p?.country?.code === 'DEU')?.city;
  const useDe = !!cityRaw2;
  const { city, bundesland } = useDe ? normalizeGeo(cityRaw2) : { city: cityRaw, bundesland: null };
  const remote = Boolean(j.location?.fullyRemote);
  const countries = places.map(p => p?.country?.code).filter(Boolean).join(',');
  const lang = detectLang(title) ?? 'EN';

  // Salary: NoFluffJobs has wide range, optional
  let budget = null, kind = null;
  const salaries = Array.isArray(j.salary) ? j.salary : (j.salary ? [j.salary] : []);
  for (const s of salaries) {
    const cur = String(s?.currency ?? 'EUR').toUpperCase();
    const rate = CUR_TO_EUR[cur] ?? 0;
    if (!rate) continue;
    const v = Number(s?.from ?? s?.min ?? s?.value ?? 0);
    if (!v) continue;
    const u = String(s?.type ?? '').toLowerCase();
    if (u.includes('hour')) { budget = Math.round(v * rate); kind = 'hour'; }
    else if (u.includes('month')) { budget = Math.round(v * rate); kind = 'monthly'; }
    else { budget = Math.round(v * rate); kind = 'monthly'; }
    break;
  }

  return {
    sourceId: 'nofluffjobs',
    sourceUrl,
    title,
    description: [company, tech, countries].filter(Boolean).join(' · ').slice(0, 2000),
    postedAt,
    language: lang,
    category: tech || 'IT job',
    cpvCode: null,
    budgetEur: budget,
    budgetKind: kind,
    durationDays: null,
    city,
    bundesland,
    remote,
    clientHash: null,
    // W3: canonical role + employer enable the role-recurrence detector
    // (v_role_repost_30d view → BP NEW-A "Role-Recurrence Anomaly Alert").
    canonicalRole: canonicalRole(title),
    canonicalEmployer: canonicalEmployer(company)
  };
}

export default extractor;
