/**
 * GitHub Search API — public, 10 req/min unauth, 30/min auth.
 *   https://docs.github.com/en/rest/search/search
 *
 * We poll for repositories tagged with German SaaS / Mittelstand keywords
 * and capture the metadata as listings. The "value" signal here is stars.
 *
 * Set GITHUB_TOKEN env var for higher rate limit (optional).
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://api.github.com/search/repositories';

const QUERIES = [
  'DATEV in:description,readme',
  'sevdesk in:description,readme',
  'Lexware in:description,readme',
  'XRechnung in:description,readme',
  'ZUGFeRD in:description,readme',
  'GoBD in:description,readme',
  'Mittelstand in:description,readme',
  'Steuerberater in:description,readme',
  'Buchhaltung in:description,readme language:typescript',
  'eRechnung OR e-rechnung in:description,readme',
  'topic:germany topic:saas',
  'topic:berlin topic:startup'
];

const PER_PAGE = 50;
const MAX_PAGES_PER_QUERY = 2;
const REQ_DELAY_MS = 6500;     // unauth limit is 10/min → 6.5s spacing keeps headroom

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'github',
  nativeArchiveMonths: 60,

  async *fetch(since, signal) {
    const headers = {
      'user-agent': UA,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28'
    };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    for (const q of QUERIES) {
      if (signal?.aborted) return;
      for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
        const url = `${API}?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${PER_PAGE}&page=${page}`;
        let body, items;
        try {
          const res = await fetch(url, { headers });
          if (res.status === 403 || res.status === 429) {
            const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0);
            const wait = Math.max(60_000, (reset * 1000) - Date.now());
            await sleep(Math.min(120_000, wait));
            continue;
          }
          if (!res.ok) throw new Error(`GH ${res.status}`);
          const json = await res.json();
          body = JSON.stringify(json);
          items = (json.items ?? []).map(it => ({ ...it, _q: q }));
        } catch (err) {
          yield {
            ...makeRaw('github', `${API}#q=${encodeURIComponent(q)}&page=${page}`, JSON.stringify({ error: String(err.message ?? err) })),
            httpStatus: 0,
            _items: []
          };
          break;
        }
        if (items.length === 0) break;
        yield {
          ...makeRaw('github', `${API}#q=${encodeURIComponent(q)}&page=${page}`, body),
          _items: items
        };
        if (items.length < PER_PAGE) break;
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

export function mapItem(r) {
  const title = `${r.full_name} — ${r.description ?? ''}`.slice(0, 320);
  const description = String(r.description ?? '').slice(0, 2000);
  const sourceUrl = r.html_url ?? `https://github.com/${r.full_name}`;
  const postedAt = r.updated_at ? parseDate(r.updated_at) : new Date();
  const lang = detectLang(description) ?? 'EN';
  return {
    sourceId: 'github',
    sourceUrl,
    title,
    description,
    postedAt,
    language: lang,
    category: r.language ?? 'Code',
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

export default extractor;
