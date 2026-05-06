import {
  parseFilter, filterListings, getMeta, topTerms,
  geoBreakdown, clusters, moneyFlow, volumeByWeekSource
} from '$lib/server/data.js';

export async function load({ url, setHeaders }) {
  setHeaders({ 'cache-control': 'private, max-age=60' });
  const filter = parseFilter(url.searchParams);
  const meta = await getMeta();

  // The vertical filter is applied inside filterListings via filter.vertical
  const listings = await filterListings(filter);

  const TIME_WEEKS = { '30d':4,'6mo':26,'1y':52,'3y':156,'5y':260 };
  const wks = TIME_WEEKS[filter.time] ?? 260;
  const offset = meta.weeks - wks;

  const baseDate = new Date(meta.nowDate);
  const weekLabels = [];
  for (let i = 0; i < wks; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - (wks - 1 - i) * 7);
    weekLabels.push(d.toISOString().slice(0,10));
  }

  const vol = volumeByWeekSource(listings, meta.weeks, filter.sources);
  const sliced = Object.fromEntries(filter.sources.map(s => [s, vol[s].slice(offset)]));

  const tools = topTerms(listings, 'D1', 12);
  const verbs = topTerms(listings, 'D2', 12);
  const reg = topTerms(listings, 'D5', 12);

  const cities = geoBreakdown(listings, 12);
  const cl = clusters(listings, 10);
  const money = moneyFlow(listings);

  const verticals = meta.dicts.D6.terms;

  return { filter, meta, totalListings: listings.length, weekLabels, vol: sliced, tools, verbs, reg, cities, cl, money, verticals };
}
