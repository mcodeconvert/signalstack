import { parseFilter, filterListings, moneyFlow, getMeta, volumeByWeekSource } from '$lib/server/data.js';

export async function load({ url, setHeaders }) {
  setHeaders({ 'cache-control': 'private, max-age=60' });
  const filter = parseFilter(url.searchParams);
  const meta = await getMeta();
  const listings = await filterListings(filter);
  const money = moneyFlow(listings);

  // money momentum: project value per week
  const TIME_WEEKS = { '30d':4,'6mo':26,'1y':52,'3y':156,'5y':260 };
  const wks = TIME_WEEKS[filter.time] ?? 260;
  const offset = (meta.weeks ?? 260) - wks;
  const moneyByWeek = new Array(wks).fill(0);
  for (const l of listings) {
    if (l.budget == null) continue;
    let v = 0;
    if (l.budgetKind === 'project') v = l.budget;
    else if (l.budgetKind === 'day') v = l.budget * (l.dur ?? 20);
    else if (l.budgetKind === 'hour') v = l.budget * (l.dur ?? 20) * 8;
    moneyByWeek[l.ts - offset] += v;
  }
  const weekLabels = [];
  const baseDate = new Date(meta.nowDate);
  for (let i = 0; i < wks; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - (wks - 1 - i) * 7);
    weekLabels.push(d.toISOString().slice(0,10));
  }

  // pivoted volume per source for stacked area
  const vol = volumeByWeekSource(listings, meta.weeks, filter.sources);
  const sliced = Object.fromEntries(filter.sources.map(s => [s, vol[s].slice(offset)]));

  return { filter, meta, money, moneyByWeek, weekLabels, vol: sliced, totalListings: listings.length };
}
