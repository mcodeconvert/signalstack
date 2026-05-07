/**
 * Jobspresso — remote job board with public RSS feed.
 *   https://jobspresso.co/feed/
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const FEED = 'https://jobspresso.co/feed/';

let _Parser = null;
async function getParser() {
  if (_Parser !== null) return _Parser;
  try {
    const mod = await import('rss-parser');
    _Parser = new mod.default({ timeout: 15000, headers: { 'user-agent': UA } });
  } catch { _Parser = false; }
  return _Parser;
}

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'jobspresso',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    const parser = await getParser();
    let body, items;
    try {
      if (parser) {
        const f = await parser.parseURL(FEED);
        body = JSON.stringify(f);
        items = f.items;
      } else {
        const r = await fetch(FEED, { headers: { 'user-agent': UA } });
        const xml = await r.text();
        body = xml;
        items = parseRssFallback(xml);
      }
    } catch (err) {
      yield { ...makeRaw('jobspresso', FEED, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('jobspresso', FEED, body), _items: items };
  },

  async parse(raw) {
    if (raw.httpStatus === 0) return { status: 'error', message: 'fetch failed' };
    const items = raw._items ?? [];
    if (!items.length) return { status: 'error', message: 'empty' };
    return { status: 'ok', listing: mapItem(items[0]) };
  },

  enrich: defaultEnrich
};

export function mapItem(it) {
  const title = String(it.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 320);
  const description = stripHtml(it.contentSnippet ?? it.content ?? it.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  const sourceUrl = (it.link ?? it.guid ?? '').split('?')[0];
  const postedAt = parseDate(it.isoDate ?? it.pubDate) ?? new Date();
  const categories = Array.isArray(it.categories) ? it.categories[0] : '';
  return {
    sourceId: 'jobspresso',
    sourceUrl,
    title,
    description,
    postedAt,
    language: detectLang(title + ' ' + description) ?? 'EN',
    category: categories || 'Remote job',
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

function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' '); }

function parseRssFallback(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const get = tag => {
      const r = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      return (block.match(r) ?? [])[1]?.trim();
    };
    out.push({ title: get('title'), link: get('link'), guid: get('guid'),
               pubDate: get('pubDate'), description: get('description'), contentSnippet: get('description') });
  }
  return out;
}

export default extractor;
