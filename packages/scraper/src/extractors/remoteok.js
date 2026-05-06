/**
 * RemoteOK — public JSON API for remote jobs.
 *   https://remoteok.com/api  (returns ~99 newest jobs)
 *
 * robots.txt: allowed for /api. Free, public.
 */
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, parseDate, normalizeGeo } from '@signalstack/core/normalize';

const UA = 'SignalStack/0.1 (+ops@parallelship.com)';
const API = 'https://remoteok.com/api';

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'remoteok',
  nativeArchiveMonths: 1,

  async *fetch(since, signal) {
    if (signal?.aborted) return;
    let body, items;
    try {
      const res = await fetch(API, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw new Error(`RemoteOK ${res.status}`);
      const json = await res.json();
      // First element is metadata { legal, ... } — skip it
      const arr = Array.isArray(json) ? json : [];
      items = arr.filter(x => x && x.id && x.position);
      body = JSON.stringify(items);
    } catch (err) {
      yield { ...makeRaw('remoteok', API, JSON.stringify({ error: String(err.message ?? err) })), httpStatus: 0, _items: [] };
      return;
    }
    if (!items.length) return;
    yield { ...makeRaw('remoteok', API, body), _items: items };
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
  const title = String(j.position ?? j.title ?? '(untitled)').slice(0, 320);
  const company = String(j.company ?? '');
  const description = stripHtml(String(j.description ?? '')).slice(0, 4000);
  const sourceUrl = j.url ?? j.apply_url ?? `https://remoteok.com/remote-jobs/${j.id}`;
  const postedAt = j.date ? parseDate(j.date) : (j.epoch ? new Date(Number(j.epoch) * 1000) : new Date());

  // budget — RemoteOK has salary_min / salary_max in USD typically (their docs are ambiguous).
  // Treat as USD → ignore for now (don't claim EUR). If they ever expose currency, parse it.
  const budget = null, budgetKind = null;

  // Location: free-form ("Anywhere", "EU only", "Germany", city names).
  const locText = j.location ?? '';
  const { city, bundesland } = locText && /[A-Za-zäöüÄÖÜ]/.test(locText)
    ? normalizeGeo(locText) : { city: null, bundesland: null };
  const remote = true;  // by definition

  const tags = Array.isArray(j.tags) ? j.tags.join(', ') : '';
  const desc = [company, locText, tags, description].filter(Boolean).join(' · ').slice(0, 2000);

  return {
    sourceId: 'remoteok',
    sourceUrl,
    title,
    description: desc,
    postedAt,
    language: detectLang(title + ' ' + description) ?? 'EN',
    category: 'Remote job',
    cpvCode: null,
    budgetEur: budget,
    budgetKind,
    durationDays: null,
    city,
    bundesland,
    remote,
    clientHash: null
  };
}

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export default extractor;
