/**
 * Hacker News — Algolia public API
 *   https://hn.algolia.com/api
 *
 * Free, public, no auth. Polls a curated set of queries that surface
 * tech/SaaS/business signals relevant to the German Mittelstand market.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://hn.algolia.com/api/v1/search_by_date';

// Story-only queries for German + B2B SaaS topics.
const QUERIES = [
  'germany SaaS', 'germany startup', 'mittelstand', 'DATEV',
  'sap', 'b2b germany', 'eu startup', 'ePrivacy',
  'gdpr', 'invoice', 'erp germany', 'csrd',
  'zatca', 'xrechnung', 'enterprise germany', 'dach saas'
];

const PAGE_SIZE = 50;
const REQ_DELAY_MS = 1000;
const MAX_PAGES_PER_QUERY = 2;
const SINCE_DAYS_DEFAULT = Number(process.env.HN_SINCE_DAYS ?? 365);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'hn',
  nativeArchiveMonths: 60,

  async *fetch(since, signal) {
    const sinceTs = (since ? new Date(since) : (() => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - SINCE_DAYS_DEFAULT); return d;
    })()).getTime() / 1000 | 0;

    for (const q of QUERIES) {
      if (signal?.aborted) return;
      for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        const url = `${API}?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${PAGE_SIZE}&page=${page}&numericFilters=created_at_i%3E${sinceTs}`;
        let body, items;
        try {
          const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
          if (!res.ok) throw new Error(`HN ${res.status}`);
          const json = await res.json();
          body = JSON.stringify(json);
          items = (json.hits ?? []).map(h => ({ ...h, _q: q }));
        } catch (err) {
          yield {
            ...makeRaw('hn', `${API}#q=${encodeURIComponent(q)}&page=${page}`, JSON.stringify({ error: String(err.message ?? err) })),
            httpStatus: 0,
            _items: []
          };
          break;
        }
        if (items.length === 0) break;
        yield {
          ...makeRaw('hn', `${API}#q=${encodeURIComponent(q)}&page=${page}`, body),
          _items: items
        };
        if (items.length < PAGE_SIZE) break;
        await sleep(REQ_DELAY_MS);
      }
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

export function mapItem(h) {
  const title = String(h.title ?? '').slice(0, 320);
  const story = String(h.story_text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);
  const description = story || `points: ${h.points ?? 0} · comments: ${h.num_comments ?? 0} · query: ${h._q ?? ''}`;
  const sourceUrl = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
  const postedAt = h.created_at ? parseDate(h.created_at) : new Date();
  const lang = detectLang(title + ' ' + story.slice(0, 200)) ?? 'EN';

  // W3: subtype classification from title prefix.
  // Show HN posts are competitive intel (founder + product launch).
  // Ask HN posts are pain mining (problem statement).
  // Everything else is tech discussion.
  let subtype = 'discuss';
  if (/^show\s+hn\b/i.test(title)) subtype = 'show';
  else if (/^ask\s+hn\b/i.test(title)) subtype = 'ask';

  // W3: topic_cluster derived from the query that surfaced this post.
  const topicCluster = h._q ? slugifyQuery(h._q) : null;

  // Use HN points as a soft "value" proxy on a log scale (just for ranking)
  // No budget claim — leave budgetEur null.
  return {
    sourceId: 'hn',
    sourceUrl,
    title,
    description,
    postedAt,
    language: lang,
    category: 'Tech discussion',
    cpvCode: null,
    budgetEur: null,
    budgetKind: null,
    durationDays: null,
    city: null,
    bundesland: null,
    remote: false,
    clientHash: null,
    subtype,
    topicCluster
  };
}

function slugifyQuery(q) {
  return String(q).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || null;
}

export default extractor;
