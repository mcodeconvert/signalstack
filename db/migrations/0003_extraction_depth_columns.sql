-- W3: per-source extraction depth — adds source-class-specific high-signal columns
-- to listings + a stars-velocity time-series + two derived views.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, OR REPLACE views.

-- ---------- listings: new high-signal columns ----------
-- subtype: source-class subtype (hn 'show'/'ask'/'discuss', bund 'rfp'/'stelle', etc.)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS subtype TEXT;
-- topic_cluster: github topic-or-query → human-readable cluster id
ALTER TABLE listings ADD COLUMN IF NOT EXISTS topic_cluster TEXT;
-- canonical_role: normalized role slug ("engineer-backend-senior" etc.) — for repost detection
ALTER TABLE listings ADD COLUMN IF NOT EXISTS canonical_role TEXT;
-- canonical_employer: normalized employer slug ("link-group" etc.)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS canonical_employer TEXT;
-- tech_stack: array of detected tech tags (D1 Tools dictionary matches)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tech_stack TEXT[] DEFAULT '{}';
-- cpv_cluster: TED CPV-code 2-digit prefix (e.g. '45' construction, '72' IT)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS cpv_cluster TEXT;

-- ---------- indexes for filterable views ----------
CREATE INDEX IF NOT EXISTS listings_subtype_idx           ON listings (source_id, subtype) WHERE subtype IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_topic_cluster_idx     ON listings (topic_cluster)      WHERE topic_cluster IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_canonical_role_idx    ON listings (canonical_role)     WHERE canonical_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_canonical_emp_idx     ON listings (canonical_employer) WHERE canonical_employer IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_cpv_cluster_idx       ON listings (cpv_cluster)        WHERE cpv_cluster IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_tech_stack_gin_idx    ON listings USING GIN (tech_stack);

-- ---------- github_stars_velocity: time-series snapshots ----------
CREATE TABLE IF NOT EXISTS github_stars_velocity (
  repo_full_name TEXT NOT NULL,
  snapshot_at    DATE NOT NULL,
  stars          INT  NOT NULL,
  forks          INT,
  last_commit    DATE,
  topic_cluster  TEXT,
  PRIMARY KEY (repo_full_name, snapshot_at)
);
CREATE INDEX IF NOT EXISTS gh_stars_topic_idx
  ON github_stars_velocity (topic_cluster, snapshot_at DESC)
  WHERE topic_cluster IS NOT NULL;
CREATE INDEX IF NOT EXISTS gh_stars_at_idx
  ON github_stars_velocity (snapshot_at DESC);

-- ---------- v_role_repost_30d: chronic-shortage detector ----------
-- Surfaces (canonical_role × canonical_employer × source) tuples reposted ≥2× in 30 days.
-- This view is the foundation of the Role-Recurrence Anomaly Alert product (BP NEW-A).
CREATE OR REPLACE VIEW v_role_repost_30d AS
SELECT
  canonical_role,
  canonical_employer,
  source_id,
  COUNT(*)                                             AS repost_count,
  MIN(posted_at)                                       AS first_seen,
  MAX(posted_at)                                       AS last_seen,
  (MAX(posted_at) - MIN(posted_at))                    AS span_days,
  array_agg(id ORDER BY posted_at DESC)                AS listing_ids
FROM listings
WHERE canonical_role IS NOT NULL
  AND canonical_employer IS NOT NULL
  AND posted_at >= current_date - INTERVAL '30 days'
GROUP BY canonical_role, canonical_employer, source_id
HAVING COUNT(*) >= 2;

-- ---------- v_cpv_cluster_summary: TED money-flow per cluster (last 90 days) ----------
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
  AND posted_at >= current_date - INTERVAL '90 days'
GROUP BY source_id, cpv_cluster;

-- ---------- v_topic_cluster_velocity: GitHub OSS-cluster temperature ----------
-- Joins listings.topic_cluster against the latest stars_velocity snapshot to give
-- "cluster size + week-over-week growth" — the OSS commoditization-risk signal.
CREATE OR REPLACE VIEW v_topic_cluster_velocity AS
WITH latest AS (
  SELECT DISTINCT ON (repo_full_name)
    repo_full_name, topic_cluster, stars, snapshot_at
  FROM github_stars_velocity
  ORDER BY repo_full_name, snapshot_at DESC
),
prev AS (
  SELECT DISTINCT ON (repo_full_name)
    repo_full_name, stars, snapshot_at
  FROM github_stars_velocity
  WHERE snapshot_at < current_date - INTERVAL '7 days'
  ORDER BY repo_full_name, snapshot_at DESC
)
SELECT
  l.topic_cluster,
  COUNT(DISTINCT l.repo_full_name)                    AS repos,
  SUM(l.stars)                                        AS total_stars,
  SUM(l.stars - COALESCE(p.stars, 0))                 AS stars_delta_7d
FROM latest l
LEFT JOIN prev p USING (repo_full_name)
WHERE l.topic_cluster IS NOT NULL
GROUP BY l.topic_cluster;

INSERT INTO schema_history (version, filename) VALUES (3, '0003_extraction_depth_columns.sql')
ON CONFLICT (version) DO NOTHING;
