/**
 * Working Nomads — public JSON API for remote jobs.
 *   https://www.workingnomads.com/api/exposed_jobs/
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://www.workingnomads.com/api/exposed_jobs/';

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'workingnomads',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    let body, items;
    try {
      const res = await fetch(API, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw new Error(`workingnomads ${res.status}`);
      const json = await res.json();
      const arr = Array.isArray(json) ? json : (json.results ?? json.data ?? []);
      items = arr.filter(j => j && (j.url || j.title));
      body = JSON.stringify({ count: items.length });
    } catch (err) {
      yield { ...makeRaw('workingnomads', API, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('workingnomads', API, body), _items: items };
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
  const company = String(j.company_name ?? j.company ?? '');
  const description = stripHtml(String(j.description ?? '')).slice(0, 2000);
  const sourceUrl = j.url ?? '';
  const postedAt = j.pub_date ? parseDate(j.pub_date) : (j.created_at ? parseDate(j.created_at) : new Date());
  const tags = Array.isArray(j.tags) ? j.tags.join(', ') : (j.category ?? '');
  const region = j.region ?? j.location ?? '';
  return {
    sourceId: 'workingnomads',
    sourceUrl,
    title,
    description: [company, region, tags, description].filter(Boolean).join(' · ').slice(0, 2000),
    postedAt,
    language: detectLang(title + ' ' + description) ?? 'EN',
    category: j.category ?? 'Remote job',
    cpvCode: null,
    budgetEur: null,
    budgetKind: null,
    durationDays: null,
    city: null,
    bundesland: null,
    remote: true,
    clientHash: null
  };
}

function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }

export default extractor;
