/**
 * service.bund.de — German federal portal RSS feeds
 *   * Public-sector job postings (Stellen)
 *   * Public RFPs (Ausschreibungen)
 *
 * robots.txt allows the RSS endpoints (only /Suche/* is blocked).
 * 30s polite delay between feed fetches.
 */
import { XMLParser } from 'fast-xml-parser';
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, normalizeGeo, parseDate } from '@signalstack/core/normalize';
import { canonicalEmployer } from '@signalstack/core/canonical-role';

const FEEDS = [
  { url: 'https://www.service.bund.de/SiteGlobals/Functions/RSSFeed/RSSGenerator_Stellen.xml',         kind: 'stellen' },
  { url: 'https://www.service.bund.de/SiteGlobals/Functions/RSSFeed/RSSGenerator_Ausschreibungen.xml', kind: 'ausschreibung' }
];
const UA = 'SignalStack/0.1 (+ops@parallelship.com)';

// Try to use rss-parser if installed (it is, for the freelance extractor),
// fall back to a minimal regex parser otherwise.
let _Parser = null;
async function getParser() {
  if (_Parser !== null) return _Parser;
  try {
    const mod = await import('rss-parser');
    _Parser = new mod.default({ timeout: 15_000, headers: { 'user-agent': UA } });
  } catch {
    _Parser = false;
  }
  return _Parser;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'bund',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    const parser = await getParser();
    for (const feed of FEEDS) {
      if (signal?.aborted) return;
      let body, items;
      try {
        if (parser) {
          const f = await parser.parseURL(feed.url);
          body = JSON.stringify(f);
          items = f.items.map(it => ({ ...it, _kind: feed.kind }));
        } else {
          const res = await fetch(feed.url, { headers: { 'user-agent': UA } });
          const xml = await res.text();
          body = xml;
          items = parseRssFallback(xml).map(it => ({ ...it, _kind: feed.kind }));
        }
      } catch (err) {
        yield {
          ...makeRaw('bund', feed.url, JSON.stringify({ error: String(err.message ?? err) })),
          httpStatus: 0,
          _items: []
        };
        continue;
      }
      yield {
        ...makeRaw('bund', feed.url, body),
        _items: items
      };
      await sleep(2000);
    }
  },

  async parse(raw) {
    if (raw.httpStatus === 0) return { status: 'error', message: 'fetch failed' };
    const items = raw._items ?? [];
    if (!items.length) return { status: 'error', message: 'empty feed' };
    return { status: 'ok', listing: mapItem(items[0]) };
  },

  enrich: defaultEnrich
};

export function mapItem(it) {
  const title = (it.title ?? '').replace(/\s+/g, ' ').trim();
  const description = stripHtml(it.contentSnippet ?? it.content ?? it.description ?? '').replace(/\s+/g, ' ').trim();
  const sourceUrl = (it.link ?? it.guid ?? '').split('#')[0];
  const postedAt = parseDate(it.isoDate ?? it.pubDate) ?? new Date();
  const lang = detectLang((title + ' ' + description).slice(0, 400)) ?? 'DE';

  // Description format: "Arbeitgeber: <strong>X</strong> Ort: <strong>City</strong>"
  const employer = (description.match(/Arbeitgeber:\s*([^<\n,]+?)(?:\s+Ort:|$)/) ?? [])[1]?.trim() ?? null;
  const cityRaw  = (description.match(/Ort:\s*(?:\d{5}\s+)?([^<\n,]+?)(?:\s+(?:Veröffentlichung|Bewerbungs|<|$))/) ?? [])[1]?.trim() ?? null;
  const { city, bundesland } = normalizeGeo(cityRaw);

  // W3: subtype directly from the feed kind we set during fetch.
  // 'rfp' = sub-EU-threshold federal RFPs, 'stelle' = federal job postings.
  const subtype = it._kind === 'ausschreibung' ? 'rfp' : 'stelle';

  return {
    sourceId: 'bund',
    sourceUrl,
    title: title.slice(0, 320),
    description: [employer, cityRaw].filter(Boolean).join(' · ') || description.slice(0, 320),
    postedAt,
    language: lang,
    category: subtype === 'rfp' ? 'Procurement' : 'Public-sector job',
    cpvCode: null,
    budgetEur: null,
    budgetKind: null,
    durationDays: null,
    city,
    bundesland,
    remote: false,
    clientHash: null,
    subtype,
    canonicalEmployer: employer ? canonicalEmployer(employer) : null
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
    out.push({
      title: get('title'),
      link: get('link'),
      guid: get('guid'),
      pubDate: get('pubDate'),
      description: get('description'),
      contentSnippet: get('description')
    });
  }
  return out;
}

export default extractor;
