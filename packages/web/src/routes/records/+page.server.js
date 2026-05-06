import { parseFilter, filterListings, getMeta } from '$lib/server/data.js';

export async function load({ url }) {
  const filter = parseFilter(url.searchParams);
  const meta = await getMeta();
  const listings = await filterListings(filter);

  // newest first
  listings.sort((a, b) => b.ts - a.ts);

  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0));
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(listings.length / pageSize));
  const slice = listings.slice(page * pageSize, page * pageSize + pageSize);

  return {
    filter, meta,
    totalListings: listings.length,
    page, pageSize, totalPages,
    rows: slice
  };
}
