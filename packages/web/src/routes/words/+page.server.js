import { parseFilter, filterListings, getMeta } from '$lib/server/data.js';
import { wordFrequency } from '@signalstack/core/words';
import { probe } from '@signalstack/core/probe';

export async function load({ url, setHeaders }) {
  setHeaders({ 'cache-control': 'private, max-age=60' });
  const filter = parseFilter(url.searchParams);
  const meta = await getMeta();
  const listings = await filterListings({ ...filter, withDescription: true });

  const titleOnly = url.searchParams.get('to') === '1';
  const keepFiller = url.searchParams.get('kf') === '1';
  const minCount = Math.max(1, Number(url.searchParams.get('mc') ?? 3));
  const search = (url.searchParams.get('w') ?? '').trim();
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0));
  const PAGE_SIZE = 100;

  const all = wordFrequency(listings, { titleOnly, keepFiller, minCount });
  const searchLower = search.toLowerCase();
  const filtered = search
    ? all.filter(([w]) => w.includes(searchLower))
    : all;

  // Probe runs the search as a case-insensitive regex against title +
  // description on the (already filtered) listings. Returns null when the
  // search box is empty.
  const probeResult = search ? probe(listings, search) : null;

  const totalWords = filtered.length;
  const totalUnique = all.length;
  const totalListings = listings.length;
  const totalPages = Math.max(1, Math.ceil(totalWords / PAGE_SIZE));
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return {
    filter, meta, totalListings,
    rows: slice,
    totalWords, totalUnique,
    page, totalPages,
    titleOnly, keepFiller, minCount, search,
    probeResult
  };
}
