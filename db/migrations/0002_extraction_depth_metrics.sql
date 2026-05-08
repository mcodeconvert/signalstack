-- W1: extraction_depth_metrics — measures per-source signal density over time.
-- Goal: track whether the strategy rebalance (drop 4 + cap TED + raise per-record extraction depth)
-- is actually moving signal-density up.
--
-- Snapshot is taken via SELECT INSERT … from listings + term_hits, see refresh_extraction_depth_metrics() below.
-- Idempotent — re-runnable.

CREATE TABLE IF NOT EXISTS extraction_depth_metrics (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- corpus baseline
  records_total INT NOT NULL,
  records_last_7d INT NOT NULL DEFAULT 0,
  records_last_30d INT NOT NULL DEFAULT 0,

  -- field-population rates 0..1 (= NOT NULL count / records_total)
  rate_budget_eur     NUMERIC(4,3),
  rate_budget_kind    NUMERIC(4,3),
  rate_city           NUMERIC(4,3),
  rate_bundesland     NUMERIC(4,3),
  rate_remote         NUMERIC(4,3),
  rate_category       NUMERIC(4,3),
  rate_cpv_code       NUMERIC(4,3),
  rate_duration_days  NUMERIC(4,3),
  rate_language       NUMERIC(4,3),

  -- signal density per record
  term_hits_per_record    NUMERIC(8,3),
  unique_terms_per_record NUMERIC(8,3),

  -- description quality
  avg_description_chars NUMERIC(10,2)
);

CREATE INDEX IF NOT EXISTS extraction_depth_metrics_src_idx
  ON extraction_depth_metrics (source_id, measured_at DESC);

-- One-shot snapshot helper. Call from the worker after each ingest run.
-- Idempotent within a single transaction call (it always inserts a fresh row;
-- never updates / deletes earlier rows so trend lines remain stable).
CREATE OR REPLACE FUNCTION refresh_extraction_depth_metrics()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_n INT := 0;
BEGIN
  INSERT INTO extraction_depth_metrics (
    source_id,
    records_total, records_last_7d, records_last_30d,
    rate_budget_eur, rate_budget_kind, rate_city, rate_bundesland,
    rate_remote, rate_category, rate_cpv_code, rate_duration_days, rate_language,
    term_hits_per_record, unique_terms_per_record,
    avg_description_chars
  )
  SELECT
    l.source_id,
    count(*)::INT                                                             AS records_total,
    count(*) FILTER (WHERE l.posted_at >= current_date - INTERVAL '7 days')::INT  AS records_last_7d,
    count(*) FILTER (WHERE l.posted_at >= current_date - INTERVAL '30 days')::INT AS records_last_30d,

    ROUND( (count(*) FILTER (WHERE l.budget_eur     IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_budget_eur,
    ROUND( (count(*) FILTER (WHERE l.budget_kind    IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_budget_kind,
    ROUND( (count(*) FILTER (WHERE l.city           IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_city,
    ROUND( (count(*) FILTER (WHERE l.bundesland     IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_bundesland,
    ROUND( (count(*) FILTER (WHERE l.remote         IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_remote,
    ROUND( (count(*) FILTER (WHERE l.category       IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_category,
    ROUND( (count(*) FILTER (WHERE l.cpv_code       IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_cpv_code,
    ROUND( (count(*) FILTER (WHERE l.duration_days  IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_duration_days,
    ROUND( (count(*) FILTER (WHERE l.language       IS NOT NULL))::NUMERIC / NULLIF(count(*),0), 3) AS rate_language,

    ROUND( (
      SELECT count(*)::NUMERIC
      FROM term_hits th JOIN listings l2 ON l2.id = th.listing_id
      WHERE l2.source_id = l.source_id
    ) / NULLIF(count(*),0), 3) AS term_hits_per_record,

    ROUND( (
      SELECT count(DISTINCT (th.dict_key||':'||th.term))::NUMERIC
      FROM term_hits th JOIN listings l2 ON l2.id = th.listing_id
      WHERE l2.source_id = l.source_id
    ) / NULLIF(count(*),0), 3) AS unique_terms_per_record,

    ROUND( AVG(LENGTH(COALESCE(l.description, '')))::NUMERIC, 2 ) AS avg_description_chars
  FROM listings l
  GROUP BY l.source_id;

  GET DIAGNOSTICS inserted_n = ROW_COUNT;
  RETURN inserted_n;
END;
$$;

INSERT INTO schema_history (version, filename) VALUES (2, '0002_extraction_depth_metrics.sql')
ON CONFLICT (version) DO NOTHING;
