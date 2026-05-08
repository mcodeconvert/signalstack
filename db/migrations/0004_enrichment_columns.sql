-- W4: enrichment columns + an updated v_role_repost_30d that uses the new normalized fields.
-- Idempotent.

-- ---------- listings: 2 enrichment-pass output columns ----------
-- canonical_buyer: TED + bund buyer-name normalized (cross-source dedup)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS canonical_buyer TEXT;
-- budget_eur_per_month: monthly run-rate equivalent of budget_eur (€/h × 160, €/d × 22, etc.)
-- NULL when budget_eur is NULL or kind=project without duration_days
ALTER TABLE listings ADD COLUMN IF NOT EXISTS budget_eur_per_month NUMERIC;

CREATE INDEX IF NOT EXISTS listings_canonical_buyer_idx
  ON listings (canonical_buyer)
  WHERE canonical_buyer IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_budget_per_month_idx
  ON listings (budget_eur_per_month)
  WHERE budget_eur_per_month IS NOT NULL;

-- ---------- v_buyers_top: cross-source buyer leaderboard (last 90 days) ----------
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
  AND posted_at >= current_date - INTERVAL '90 days'
GROUP BY canonical_buyer
HAVING COUNT(*) >= 2;

INSERT INTO schema_history (version, filename) VALUES (4, '0004_enrichment_columns.sql')
ON CONFLICT (version) DO NOTHING;
