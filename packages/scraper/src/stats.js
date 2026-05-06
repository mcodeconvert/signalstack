/**
 * Refresh weekly aggregates.
 * Cheap to recompute fully on a small VPS Postgres at our volume.
 * Could be made incremental later if growth demands.
 */
import { db } from './db.js';
import { log } from './log.js';
import { logSlope, lifecycle } from '@signalstack/core/trend';
import { dictKeys, termsOf, DICTS } from '@signalstack/core/dict';

export async function refreshStats() {
  const sql = db();
  log.info('stats refresh start');

  // agg_weekly_volume
  await sql.unsafe(`TRUNCATE TABLE agg_weekly_volume`);
  await sql.unsafe(`
    INSERT INTO agg_weekly_volume(week, source_id, listings, lang_de, lang_en, remote_share, budget_p50, budget_disclosed_n, total_budget_eur)
    SELECT
      date_trunc('week', posted_at)::date AS week,
      source_id,
      count(*) AS listings,
      sum(case when language='DE' then 1 else 0 end) AS lang_de,
      sum(case when language='EN' then 1 else 0 end) AS lang_en,
      avg(case when remote then 1.0 else 0.0 end) AS remote_share,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY budget_eur) FILTER (WHERE budget_eur IS NOT NULL AND budget_kind='day') AS budget_p50,
      sum(case when budget_eur is not null then 1 else 0 end) AS budget_disclosed_n,
      coalesce(sum(case when budget_kind='project' then budget_eur
                        when budget_kind='day' then budget_eur * coalesce(duration_days, 20)
                        else 0 end), 0) AS total_budget_eur
    FROM listings
    WHERE is_canonical = true
    GROUP BY 1, 2
  `);

  // agg_weekly_term
  await sql.unsafe(`TRUNCATE TABLE agg_weekly_term`);
  await sql.unsafe(`
    WITH wk AS (
      SELECT date_trunc('week', l.posted_at)::date AS week, l.source_id, count(*) AS total
      FROM listings l WHERE is_canonical = true
      GROUP BY 1, 2
    ),
    hits AS (
      SELECT date_trunc('week', l.posted_at)::date AS week, l.source_id, h.dict_key, h.term, count(distinct l.id) AS n
      FROM listings l JOIN term_hits h ON h.listing_id = l.id
      WHERE l.is_canonical = true
      GROUP BY 1, 2, 3, 4
    )
    INSERT INTO agg_weekly_term(week, source_id, dict_key, term, listing_count, mention_share, density_per_1k)
    SELECT h.week, h.source_id, h.dict_key, h.term, h.n,
           (h.n::real / NULLIF(wk.total, 0)) AS mention_share,
           (h.n::real / NULLIF(wk.total, 0) * 1000) AS density_per_1k
    FROM hits h JOIN wk ON wk.week = h.week AND wk.source_id = h.source_id
  `);

  // agg_term_lifecycle (last 12 weeks vs prior 12)
  await sql.unsafe(`TRUNCATE TABLE agg_term_lifecycle`);
  const series = await sql`
    SELECT dict_key, term, week, sum(listing_count)::int AS n
    FROM agg_weekly_term
    WHERE week >= (CURRENT_DATE - INTERVAL '24 weeks')
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `;
  /** @type {Map<string, Array<{week: Date, n: number}>>} */
  const byTerm = new Map();
  for (const r of series) {
    const k = `${r.dict_key}::${r.term}`;
    if (!byTerm.has(k)) byTerm.set(k, []);
    byTerm.get(k).push({ week: r.week, n: r.n });
  }
  for (const [k, arr] of byTerm) {
    const [dictKey, term] = k.split('::');
    const recent = arr.slice(-12).map(r => r.n);
    const baseline = arr.slice(-24, -12).map(r => r.n);
    const slope = logSlope(recent);
    const bucket = lifecycle(recent, baseline);
    const recentTotal = recent.reduce((a, b) => a + b, 0);
    const baselineTotal = baseline.reduce((a, b) => a + b, 0);
    await sql`
      INSERT INTO agg_term_lifecycle(dict_key, term, bucket, slope, recent_total, baseline_total)
      VALUES (${dictKey}, ${term}, ${bucket}, ${slope}, ${recentTotal}, ${baselineTotal})
      ON CONFLICT (dict_key, term) DO UPDATE
      SET bucket = EXCLUDED.bucket, slope = EXCLUDED.slope,
          recent_total = EXCLUDED.recent_total, baseline_total = EXCLUDED.baseline_total,
          computed_at = now()
    `;
  }

  // agg_clusters (recurring titles)
  await sql.unsafe(`TRUNCATE TABLE agg_clusters`);
  await sql.unsafe(`
    WITH groups AS (
      SELECT title AS exemplar, count(*) AS members,
             array_agg(DISTINCT source_id) AS sources,
             max(posted_at) AS last_seen,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY (extract(epoch from posted_at)/86400)) AS median_day
      FROM listings WHERE is_canonical = true
      GROUP BY title
      HAVING count(*) >= 2
    )
    INSERT INTO agg_clusters(cluster_id, exemplar_title, members, sources, median_gap_days, last_seen_week)
    SELECT md5(exemplar) AS cluster_id, exemplar, members, sources, 7 AS median_gap_days,
           date_trunc('week', last_seen)::date
    FROM groups
  `);

  log.info('stats refresh done');
}
