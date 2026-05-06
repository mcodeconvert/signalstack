import { getMeta, filterListings, defaultFilter } from '$lib/server/data.js';

export async function load() {
  const meta = await getMeta();
  const all = await filterListings(defaultFilter());
  // per-source aggregates
  const bySrc = {};
  for (const sid of Object.keys(meta.sources)) {
    bySrc[sid] = { count: 0, last: null, lang: { DE: 0, EN: 0 }, withBudget: 0 };
  }
  for (const l of all) {
    const e = bySrc[l.src];
    if (!e) continue;
    e.count++;
    if (l.lang === 'DE') e.lang.DE++;
    if (l.lang === 'EN') e.lang.EN++;
    if (l.budget != null) e.withBudget++;
    if (!e.last || l.postedAt > e.last) e.last = l.postedAt;
  }
  return { meta, bySrc };
}
