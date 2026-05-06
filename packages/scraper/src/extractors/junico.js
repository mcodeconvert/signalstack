/**
 * Junico.de — Werkstudent / freelance project marketplace.
 *
 * robots.txt: Allow: / (fully open).
 * Sitemap exposes ~25-50 /auftraege/* URLs at any time.
 *
 * Polite 2 s delay between project page fetches.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate, normalizeGeo, parseBudget } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const SITEMAP = 'https://www.junico.de/sitemap.xml';
const REQ_DELAY_MS = Number(process.env.JUNICO_DELAY_MS ?? 2000);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'junico',
  nativeArchiveMonths: 6,

  async *fetch(since, signal) {
    let urls = [];
    let lastModMap = new Map();
    try {
      const res = await fetch(SITEMAP, { headers: { 'user-agent': UA } });
      const xml = await res.text();
      const re = /<url>\s*<loc>(https:\/\/www\.junico\.de\/auftraege\/[^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        urls.push(m[1]);
        if (m[2]) lastModMap.set(m[1], m[2]);
      }
    } catch (err) {
      yield { ...makeRaw('junico', SITEMAP, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }

    for (const url of urls) {
      if (signal?.aborted) return;
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA } });
        if (!res.ok) continue;
        const html = await res.text();
        yield {
          ...makeRaw('junico', url, html),
          _items: [{ _url: url, _lastmod: lastModMap.get(url), _html: html }]
        };
      } catch (err) {
        // Per-URL failure — log via raw_blob with httpStatus 0
        yield { ...makeRaw('junico', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      }
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

const META_OG_TITLE = /<meta[^>]*\bproperty="og:title"[^>]*\bcontent="([^"]+)"/i;
const META_OG_DESC  = /<meta[^>]*\bproperty="og:description"[^>]*\bcontent="([^"]+)"/i;
const META_NAME_DESC= /<meta[^>]*\bname="description"[^>]*\bcontent="([^"]+)"/i;
const TITLE_TAG     = /<title>([^<]+)<\/title>/i;
const JSONLD_RE     = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

export function mapItem(it) {
  const html = it._html ?? '';
  const url = it._url;

  // Find JobPosting JSON-LD first — richest data source.
  let jp = null;
  for (const m of html.matchAll(JSONLD_RE)) {
    try {
      const j = JSON.parse(m[1]);
      const arr = Array.isArray(j) ? j : [j];
      for (const obj of arr) {
        if (obj?.['@type'] === 'JobPosting' || obj?.['@type'] === 'IntangibleAsset' || obj?.title) {
          if (obj.title) { jp = obj; break; }
        }
      }
      if (jp) break;
    } catch {}
  }

  // Title: prefer JobPosting, then og:title, then <title>
  let title = decode(jp?.title)?.trim()
    ?? decode((html.match(META_OG_TITLE) ?? [])[1])?.trim()
    ?? decode((html.match(TITLE_TAG) ?? [])[1])?.replace(/\s*·\s*Junico\s*$/, '').trim()
    ?? '(untitled)';
  title = title.replace(/\s+/g, ' ').slice(0, 320);

  // Description: prefer JobPosting (HTML-encoded inside JSON), fall back to meta
  let description = decode(stripHtml(jp?.description ?? ''))
    || decode((html.match(META_OG_DESC) ?? [])[1])
    || decode((html.match(META_NAME_DESC) ?? [])[1])
    || '';
  description = description.replace(/\s+/g, ' ').slice(0, 2000).trim();

  // Posted date
  const postedAt = jp?.datePosted ? parseDate(jp.datePosted)
    : (it._lastmod ? parseDate(it._lastmod) : new Date());

  // Budget — JobPosting.baseSalary.value
  let budget = null, kind = null;
  const v = jp?.baseSalary?.value;
  if (v) {
    budget = Number(v.value ?? v.minValue ?? v.maxValue) || null;
    const u = String(v.unitText ?? '').toLowerCase();
    kind = u.includes('hour') ? 'hour' : u.includes('day') ? 'day' : u.includes('month') ? 'monthly' : 'project';
  }
  if (budget == null && description) {
    const b = parseBudget(description);
    budget = b.budgetEur; kind = b.budgetKind;
  }

  // Location — JobPosting.jobLocation, otherwise nothing usable
  let city = null, bundesland = null;
  const loc = jp?.jobLocation?.address?.addressLocality;
  if (loc) ({ city, bundesland } = normalizeGeo(loc));

  // Remote
  const remote = jp?.jobLocationType === 'TELECOMMUTE'
    || /remote|home\s*-?\s*office|deutschlandweit|bundesweit/i.test(description);

  const lang = detectLang(title + ' ' + description) ?? 'DE';

  return {
    sourceId: 'junico',
    sourceUrl: url,
    title: title.slice(0, 320),
    description: description.slice(0, 2000),
    postedAt,
    language: lang,
    category: 'Freelance project',
    cpvCode: null,
    budgetEur: budget,
    budgetKind: kind,
    durationDays: null,
    city,
    bundesland,
    remote,
    clientHash: null
  };
}

function decode(s) {
  if (!s) return s;
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&nbsp;/g, ' ');
}

function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default extractor;
