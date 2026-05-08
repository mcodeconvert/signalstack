/**
 * freelancermap.de — German freelance project marketplace.
 *
 * robots.txt: `Disallow:` (empty = allow all).
 * Strategy: fetch /sitemaps/projects-0.xml, filter to recent lastmod,
 * cap at N most recent, fetch each project page for JSON-LD JobPosting.
 *
 * Polite 2 s delay between page fetches.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, normalizeGeo, parseDate, parseBudget } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const SITEMAP = 'https://www.freelancermap.de/sitemaps/projects-0.xml';
const REQ_DELAY_MS = Number(process.env.FREELANCERMAP_DELAY_MS ?? 2000);
const MAX_PROJECTS = Number(process.env.FREELANCERMAP_MAX ?? 1500);  // W2: 80 → 1500 (highest-density-per-record source)
const SINCE_DAYS = Number(process.env.FREELANCERMAP_SINCE_DAYS ?? 30);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'freelancermap',
  nativeArchiveMonths: 6,

  async *fetch(since, signal) {
    /** @type {Array<{url: string, lastmod: Date}>} */
    let all = [];
    try {
      const res = await fetch(SITEMAP, { headers: { 'user-agent': UA } });
      const xml = await res.text();
      const re = /<loc>(https:\/\/www\.freelancermap\.de\/projekt\/[^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const d = parseDate(m[2]);
        if (d) all.push({ url: m[1], lastmod: d });
      }
    } catch (err) {
      yield { ...makeRaw('freelancermap', SITEMAP, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }

    // sort newest first, drop everything older than SINCE_DAYS, cap at MAX
    const cutoff = Date.now() - SINCE_DAYS * 86400000;
    all.sort((a, b) => b.lastmod.getTime() - a.lastmod.getTime());
    const recent = all.filter(x => x.lastmod.getTime() >= cutoff).slice(0, MAX_PROJECTS);
    // if none meet cutoff (sitemap is stale), just take the freshest N
    const targets = recent.length ? recent : all.slice(0, MAX_PROJECTS);

    for (const { url, lastmod } of targets) {
      if (signal?.aborted) return;
      try {
        const r = await fetch(url, { headers: { 'user-agent': UA } });
        if (!r.ok) continue;
        const html = await r.text();
        yield {
          ...makeRaw('freelancermap', url, html),
          _items: [{ _url: url, _html: html, _lastmod: lastmod }]
        };
      } catch (err) {
        yield { ...makeRaw('freelancermap', url, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
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

  // JobPosting JSON-LD
  let jp = null;
  for (const m of html.matchAll(JSONLD_RE)) {
    try {
      const j = JSON.parse(m[1]);
      const arr = Array.isArray(j) ? j : [j];
      for (const obj of arr) {
        if (obj?.['@type'] === 'JobPosting') { jp = obj; break; }
      }
      if (jp) break;
    } catch {}
  }

  let title = decode(jp?.title)
    ?? decode((html.match(META_OG_TITLE) ?? [])[1])
    ?? decode((html.match(TITLE_TAG) ?? [])[1])?.replace(/\s*-\s*freelancermap\.de\s*$/i, '')
    ?? '(untitled)';
  title = title.replace(/\s+/g, ' ').trim().slice(0, 320);

  let description = decode(stripHtml(jp?.description ?? ''))
    || decode((html.match(META_OG_DESC) ?? [])[1])
    || decode((html.match(META_NAME_DESC) ?? [])[1])
    || '';
  description = description.replace(/\s+/g, ' ').slice(0, 2000).trim();

  const postedAt = jp?.datePosted ? parseDate(jp.datePosted) : (it._lastmod ?? new Date());

  // Budget: freelancermap rarely exposes salary in JSON-LD; try description regex fallback
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

  let city = null, bundesland = null;
  const loc = jp?.jobLocation?.address?.addressLocality;
  if (loc) ({ city, bundesland } = normalizeGeo(loc));

  const remote = jp?.jobLocationType === 'TELECOMMUTE'
    || /remote|home\s*-?\s*office|deutschlandweit|bundesweit/i.test(description);

  const lang = detectLang(title + ' ' + description) ?? 'DE';

  return {
    sourceId: 'freelancermap',
    sourceUrl: url,
    title,
    description,
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
  return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&nbsp;/g, ' ');
}
function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default extractor;
