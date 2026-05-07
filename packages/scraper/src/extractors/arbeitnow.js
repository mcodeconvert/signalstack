/**
 * arbeitnow — German remote-friendly job board, public JSON API.
 *   https://www.arbeitnow.com/api/job-board-api?page=N
 *
 * Pagination: 100/page. Polite 1.5 s between pages.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate, normalizeGeo } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://www.arbeitnow.com/api/job-board-api';
const MAX_PAGES = Number(process.env.ARBEITNOW_MAX_PAGES ?? 5);
const REQ_DELAY_MS = Number(process.env.ARBEITNOW_DELAY_MS ?? 1500);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'arbeitnow',
  nativeArchiveMonths: 3,

  async *fetch(since, signal) {
    let page = 1;
    while (page <= MAX_PAGES) {
      if (signal?.aborted) return;
      const url = `${API}?page=${page}`;
      let body, items;
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
        if (!res.ok) throw new Error(`arbeitnow ${res.status}`);
        const json = await res.json();
        items = (json.data ?? []).filter(j => j && j.slug);
        body = JSON.stringify(items);
      } catch (err) {
        yield { ...makeRaw('arbeitnow', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
        return;
      }
      if (!items.length) return;
      yield { ...makeRaw('arbeitnow', url, body), _items: items };
      if (items.length < 100) return;
      page++;
      await sleep(REQ_DELAY_MS);
    }
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
  const types = Array.isArray(j.job_types) ? j.job_types.join(', ') : '';
  const sourceUrl = j.url ?? `https://www.arbeitnow.com/jobs/companies/${j.slug}`;
  const postedAt = j.created_at ? new Date(Number(j.created_at) * 1000) : new Date();
  const locText = j.location ?? '';
  const { city, bundesland } = locText
    ? normalizeGeo(locText) : { city: null, bundesland: null };
  const remote = Boolean(j.remote);
  return {
    sourceId: 'arbeitnow',
    sourceUrl,
    title,
    description: [company, locText, tags, types, description].filter(Boolean).join(' · ').slice(0, 2000),
    postedAt,
    language: detectLang(title + ' ' + description) ?? 'DE',
    category: types || 'Job',
    cpvCode: null,
    budgetEur: null,
    budgetKind: null,
    durationDays: null,
    city,
    bundesland,
    remote,
    clientHash: null
  };
}

function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }

export default extractor;
