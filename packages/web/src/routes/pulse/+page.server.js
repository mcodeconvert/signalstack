import {
  parseFilter, filterListings, getMeta, topTerms, termTimeSeries,
  cooccurrence, topMovers, clusters, geoBreakdown
} from '$lib/server/data.js';

export async function load({ url }) {
  const filter = parseFilter(url.searchParams);
  const meta = await getMeta();
  const listings = await filterListings(filter);

  const TIME_WEEKS = { '30d':4,'6mo':26,'1y':52,'3y':156,'5y':260 };
  const wks = TIME_WEEKS[filter.time] ?? 260;
  const offset = meta.weeks - wks;

  const top = topTerms(listings, filter.dict, 20);
  // sparkline + trend top 5
  const top5 = top.slice(0, 5);
  const trendSeries = top5.map(([t]) => ({
    term: t,
    arr: termTimeSeries(listings, `${filter.dict}:${t}`, meta.weeks).slice(offset)
  }));
  const sparkRows = top.map(([t, n]) => ({
    term: t, n,
    spark: termTimeSeries(listings, `${filter.dict}:${t}`, meta.weeks).slice(offset)
  }));

  // weekLabels
  const baseDate = new Date(meta.nowDate);
  const weekLabels = [];
  for (let i = 0; i < wks; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - (wks - 1 - i) * 7);
    weekLabels.push(d.toISOString().slice(0,10));
  }

  // demand index: weekly count vs 5y baseline mean
  const weekly = new Array(wks).fill(0);
  for (const l of listings) weekly[l.ts - offset]++;
  const baselineMean = weekly.reduce((a,b) => a+b, 0) / Math.max(1, wks);
  const demandIndex = (weekly.slice(-4).reduce((a,b)=>a+b,0)/4 / Math.max(0.001, baselineMean));

  // top movers (current vs prev half of window)
  const movers = topMovers(listings, filter.dict, wks).slice(0, 15);

  // co-occurrence
  const cooc = cooccurrence(listings, 20);

  // clusters
  const cl = clusters(listings, 12);

  // regulatory pressure: D5 term mentions per week
  const regHits = listings.reduce((acc, l) => acc + l.hits.filter(h => h.startsWith('D5:')).length, 0);
  const regSeries = new Array(wks).fill(0);
  for (const l of listings) for (const h of l.hits) if (h.startsWith('D5:')) regSeries[l.ts - offset]++;

  return {
    filter, meta, totalListings: listings.length,
    weekLabels, sparkRows, trendSeries, demandIndex, movers, cooc, cl, regHits, regSeries
  };
}
