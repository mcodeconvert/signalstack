/**
 * Himalayas — remote-jobs JSON API, 100k+ active.
 *   https://himalayas.app/jobs/api?limit=N&offset=M
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://himalayas.app/jobs/api';
const LIMIT = Number(process.env.HIMALAYAS_LIMIT ?? 100);

const CUR_TO_EUR = { USD: 0.92, GBP: 1.18, CAD: 0.68, AUD: 0.61, INR: 0.011, EUR: 1.0 };

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'himalayas',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    const url = `${API}?limit=${LIMIT}&offset=0`;
    let body, items;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw new Error(`Himalayas ${res.status}`);
      const json = await res.json();
      items = (json.jobs ?? []).filter(j => j && (j.title || j.guid));
      body = JSON.stringify(items);
    } catch (err) {
      yield { ...makeRaw('himalayas', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('himalayas', url, body), _items: items };
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
  const company = String(j.companyName ?? '');
  const excerpt = String(j.excerpt ?? '').slice(0, 600);
  const sourceUrl = j.guid ?? (j.companySlug ? `https://himalayas.app/companies/${j.companySlug}/jobs/${j.slug ?? ''}` : 'https://himalayas.app/jobs');
  const postedAt = j.publishedAt ? parseDate(j.publishedAt) : (j.createdAt ? parseDate(j.createdAt) : new Date());
  const seniority = Array.isArray(j.seniority) ? j.seniority.join(', ') : '';
  const employment = j.employmentType ?? '';

  // budget
  let budget = null, kind = null;
  const minSalary = Number(j.minSalary ?? 0);
  const maxSalary = Number(j.maxSalary ?? 0);
  const cur = String(j.currency ?? 'USD').toUpperCase();
  const rate = CUR_TO_EUR[cur] ?? 0;
  if ((minSalary || maxSalary) && rate) {
    const yearly = minSalary || maxSalary;
    budget = Math.round(yearly * rate / 220); // approx day rate
    kind = 'day';
  }

  return {
    sourceId: 'himalayas',
    sourceUrl,
    title,
    description: [company, employment, seniority, excerpt].filter(Boolean).join(' · ').slice(0, 2000),
    postedAt,
    language: detectLang(title + ' ' + excerpt) ?? 'EN',
    category: employment || 'Remote job',
    cpvCode: null,
    budgetEur: budget,
    budgetKind: kind,
    durationDays: null,
    city: null,
    bundesland: null,
    remote: true,
    clientHash: null
  };
}

export default extractor;
