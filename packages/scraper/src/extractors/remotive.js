/**
 * Remotive — public REST API for remote jobs.
 *   https://remotive.com/api/remote-jobs
 *
 * Free, no auth, encouraged for programmatic access.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://remotive.com/api/remote-jobs';
const LIMIT = Number(process.env.REMOTIVE_LIMIT ?? 200);

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'remotive',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    const url = `${API}?limit=${LIMIT}`;
    let body, items;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw new Error(`Remotive ${res.status}`);
      const json = await res.json();
      items = (json.jobs ?? []).filter(j => j && j.id);
      body = JSON.stringify(items);
    } catch (err) {
      yield { ...makeRaw('remotive', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('remotive', url, body), _items: items };
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
  const company = String(j.company_name ?? '');
  const description = stripHtml(String(j.description ?? '')).slice(0, 2000);
  const tags = Array.isArray(j.tags) ? j.tags.join(', ') : '';
  const sourceUrl = j.url ?? `https://remotive.com/remote-jobs/${j.id}`;
  const postedAt = j.publication_date ? parseDate(j.publication_date) : new Date();
  return {
    sourceId: 'remotive',
    sourceUrl,
    title,
    description: [company, tags, description].filter(Boolean).join(' · ').slice(0, 2000),
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
