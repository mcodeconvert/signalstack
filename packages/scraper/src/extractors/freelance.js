/**
 * Freelance.de extractor — RSS-based.
 * Fetches public RSS feeds for several categories; merges, parses to ParsedListing.
 */
import Parser from 'rss-parser';
import { makeRaw, defaultEnrich } from './_base.js';
import { detectLang, normalizeGeo, parseBudget } from '@signalstack/core/normalize';

const FEEDS = [
  // Public RSS endpoints — pattern documented at freelance.de.
  // Five buckets that align with our dictionaries.
  'https://www.freelance.de/rss/projekte.php?cat=Software-Entwicklung',
  'https://www.freelance.de/rss/projekte.php?cat=Datenbanken',
  'https://www.freelance.de/rss/projekte.php?cat=SAP',
  'https://www.freelance.de/rss/projekte.php?cat=Beratung',
  'https://www.freelance.de/rss/projekte.php?cat=Buchhaltung'
];

const parser = new Parser({
  timeout: 12_000,
  headers: { 'user-agent': 'SignalStack/0.1 (+contact: ops@parallelship.com)' }
});

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'freelance',
  nativeArchiveMonths: 6,

  async *fetch(since, signal) {
    for (const url of FEEDS) {
      if (signal?.aborted) return;
      try {
        const feed = await parser.parseURL(url);
        // RSS body is the merged channel; we keep the full XML-like serialization in raw_blob.
        // For simplicity we store the JSON of the parsed feed.
        const body = JSON.stringify(feed);
        yield {
          ...makeRaw('freelance', url, body),
          // pass-through: items embedded in body
          _items: feed.items
        };
      } catch (err) {
        // emit a poison RawDoc — runner will quarantine it
        yield {
          ...makeRaw('freelance', url, JSON.stringify({ error: String(err) })),
          httpStatus: 0,
          _items: []
        };
      }
    }
  },

  async parse(raw) {
    if (raw.httpStatus === 0) {
      return { status: 'error', message: 'fetch failed' };
    }
    // raw._items is set by fetch(); if missing, parse the JSON body.
    /** @type {any[]} */
    const items = raw._items ?? (() => { try { return JSON.parse(raw.body).items ?? []; } catch { return []; } })();
    if (!items.length) return { status: 'error', message: 'empty feed' };

    // We return a *bundle* by emitting the first listing here and letting the
    // ingest pipeline pull all items. The pipeline reads raw._items if present.
    const first = items[0];
    const listing = mapItem(first);
    return { status: 'ok', listing };
  },

  enrich: defaultEnrich
};

/**
 * Map an RSS item to ParsedListing. Exported for the pipeline so it can
 * iterate raw._items without re-implementing.
 */
export function mapItem(it) {
  const title = it.title ?? '';
  const description = stripHtml(it.contentSnippet ?? it.content ?? it.summary ?? '');
  const postedAt = it.isoDate ? new Date(it.isoDate) : (it.pubDate ? new Date(it.pubDate) : new Date());
  const sourceUrl = it.link ?? '';
  const language = detectLang(title + ' ' + description) ?? 'DE';
  const cityHint = (description.match(/(?:in|für|aus)\s+([A-ZÄÖÜ][\wäöüß-]{2,})/) ?? [])[1] ?? null;
  const { city, bundesland } = normalizeGeo(cityHint);
  const { budgetEur, budgetKind } = parseBudget(description);
  const remote = /remote|home\s*-?\s*office|deutschlandweit/i.test(description);
  return {
    sourceId: 'freelance',
    sourceUrl,
    title,
    description,
    postedAt,
    language,
    category: it.categories?.[0] ?? null,
    cpvCode: null,
    budgetEur,
    budgetKind,
    durationDays: null,
    city,
    bundesland,
    remote
  };
}

function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default extractor;
