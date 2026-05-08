-- W4 follow-up: post-deploy data-quality fixes for the views.
-- Discovered when manual /sql extraction returned 0 rows from v_cpv_cluster_summary
-- and only same-day rows from v_buyers_top.
--
-- Problem: TED notices have posted_at as the EU publication date (mostly 2024-2025),
-- not the date we ingested them. The 90-day filter on posted_at therefore cuts most
-- of TED out of these views. We want the views to reflect the corpus we have, not
-- the corpus's natural publication recency.
--
-- Fix: drop the 90-day posted_at filter on v_cpv_cluster_summary; tighten the
-- v_buyers_top filter to use ingested_at instead so it reflects "what we have
-- collected lately" rather than "what was published lately".

CREATE OR REPLACE VIEW v_cpv_cluster_summary AS
SELECT
  source_id,
  cpv_cluster,
  COUNT(*)                                             AS notice_count,
  COUNT(*) FILTER (WHERE budget_eur IS NOT NULL)       AS notices_with_budget,
  ROUND(SUM(budget_eur)::NUMERIC, 0)                   AS total_budget_eur,
  ROUND(AVG(budget_eur)::NUMERIC, 0)                   AS avg_budget_eur,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY budget_eur)::NUMERIC, 0) AS median_budget_eur
FROM listings
WHERE cpv_cluster IS NOT NULL
GROUP BY source_id, cpv_cluster;

CREATE OR REPLACE VIEW v_buyers_top AS
SELECT
  canonical_buyer,
  array_agg(DISTINCT source_id ORDER BY source_id) AS sources,
  COUNT(*)                                          AS notice_count,
  COUNT(*) FILTER (WHERE budget_eur IS NOT NULL)    AS notices_with_budget,
  ROUND(SUM(budget_eur)::NUMERIC, 0)                AS total_budget_eur,
  ROUND(AVG(budget_eur)::NUMERIC, 0)                AS avg_budget_eur,
  MIN(posted_at)                                    AS first_seen,
  MAX(posted_at)                                    AS last_seen
FROM listings
WHERE canonical_buyer IS NOT NULL
  AND ingested_at >= now() - INTERVAL '90 days'
GROUP BY canonical_buyer
HAVING COUNT(*) >= 2;

INSERT INTO schema_history (version, filename) VALUES (5, '0005_fix_views_date_filters.sql')
ON CONFLICT (version) DO NOTHING;
