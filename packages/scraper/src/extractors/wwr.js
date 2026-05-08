/**
 * We Work Remotely — public RSS feeds for remote jobs.
 *   https://weworkremotely.com/categories/<slug>.rss
 *
 * robots.txt: allows /categories/. Free, public.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';

const FEEDS = [
  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-design-jobs.rss',
  'https://weworkremotely.com/categories/remote-customer-support-jobs.rss',
  'https://weworkremotely.com/categories/all-other-remote-jobs.rss',
  'https://weworkremotely.com/categories/remote-marketing-jobs.rss',
  'https://weworkremotely.com/categories/remote-sales-jobs.rss',
  'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss',
  'https://weworkremotely.com/categories/remote-product-jobs.rss',
  'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  'https://weworkremotely.com/categories/remote-business-jobs.rss'
];

// W1: cap WWR at 150 records per run (was uncapped, was producing ~307).
const WWR_MAX = Number(process.env.WWR_MAX ?? 150);

let _Parser = null;
async function getParser() {
  if (_Parser !== null) return _Parser;
  try {
    const mod = await import('rss-parser');
    _Parser = new mod.default({ timeout: 15000, headers: { 'user-agent': UA } });
  } catch { _Parser = false; }
  return _Parser;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'wwr',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    const parser = await getParser();
    let yielded = 0;
    for (const url of FEEDS) {
      if (signal?.aborted) return;
      if (yielded >= WWR_MAX) return;
      let items, body;
      try {
        if (parser) {
          const f = await parser.parseURL(url);
          body = JSON.stringify(f);
          items = f.items;
        } else {
          const r = await fetch(url, { headers: { 'user-agent': UA } });
          const xml = await r.text();
          body = xml;
          items = parseRssFallback(xml);
        }
      } catch (err) {
        yield { ...makeRaw('wwr', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
        continue;
      }
      // Cap items per feed so the global WWR_MAX is respected.
      const remaining = WWR_MAX - yielded;
      const capped = Array.isArray(items) ? items.slice(0, remaining) : items;
      yielded += Array.isArray(capped) ? capped.length : 0;
      yield { ...makeRaw('wwr', url, body), _items: capped };
      await sleep(1500);
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

export function mapItem(it) {
  const title = String(it.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 320);
  const description = stripHtml(it.contentSnippet ?? it.content ?? it.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  const sourceUrl = (it.link ?? it.guid ?? '').split('?')[0];
  const postedAt = parseDate(it.isoDate ?? it.pubDate) ?? new Date();
  return {
    sourceId: 'wwr',
    sourceUrl,
    title,
    description,
    postedAt,
    language: detectLang(title + ' ' + description) ?? 'EN',
    category: 'Remote job',
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
