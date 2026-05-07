/**
 * Jobicy — remote jobs JSON API.
 *   https://jobicy.com/api/v2/remote-jobs?count=N
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate, normalizeGeo } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://jobicy.com/api/v2/remote-jobs';
const COUNT = Number(process.env.JOBICY_COUNT ?? 50);

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'jobicy',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    const url = `${API}?count=${COUNT}`;
    let body, items;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw new Error(`Jobicy ${res.status}`);
      const json = await res.json();
      items = (json.jobs ?? []).filter(j => j && j.id);
      body = JSON.stringify(items);
    } catch (err) {
      yield { ...makeRaw('jobicy', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('jobicy', url, body), _items: items };
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
  const title = String(j.jobTitle ?? '(untitled)').slice(0, 320);
  const company = String(j.companyName ?? '');
  const excerpt = stripHtml(String(j.jobExcerpt ?? '')).slice(0, 600);
  const description = stripHtml(String(j.jobDescription ?? '')).slice(0, 2000);
  const sourceUrl = j.url ?? `https://jobicy.com/jobs/${j.jobSlug ?? j.id}`;
  const postedAt = j.pubDate ? parseDate(j.pubDate) : new Date();
  const geo = j.jobGeo ?? '';
  const { city, bundesland } = geo && /[A-Za-zäöüÄÖÜ]/.test(geo)
    ? normalizeGeo(geo) : { city: null, bundesland: null };
  const industry = Array.isArray(j.jobIndustry) ? j.jobIndustry[0] : '';
  return {
    sourceId: 'jobicy',
    sourceUrl,
    title,
    description: [company, geo, industry, excerpt || description].filter(Boolean).join(' · ').slice(0, 2000),
    postedAt,
    language: detectLang(title + ' ' + description) ?? 'EN',
    category: industry || 'Remote job',
    cpvCode: null,
    budgetEur: null,
    budgetKind: null,
    durationDays: null,
    city,
    bundesland,
    remote: true,
    clientHash: null
  };
}

function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }

export default extractor;
