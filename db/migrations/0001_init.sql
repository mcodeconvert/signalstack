-- SignalStack schema v1
-- Idempotent — re-runnable safely.

CREATE TABLE IF NOT EXISTS schema_history (
  version INT PRIMARY KEY,
  filename TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT
);

-- ---------- raw audit trail ----------
CREATE TABLE IF NOT EXISTS raw_blob (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  url TEXT NOT NULL,
  http_status INT,
  content_hash TEXT NOT NULL,
  body BYTEA,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT,
  CONSTRAINT raw_blob_uq UNIQUE (source_id, content_hash)
);
CREATE INDEX IF NOT EXISTS raw_blob_src_fetched_idx ON raw_blob (source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS raw_blob_parse_status_idx ON raw_blob (parse_status);

-- ---------- canonical typed records ----------
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  posted_at DATE NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  language TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  cpv_code TEXT,
  budget_eur NUMERIC,
  budget_kind TEXT,
  duration_days INT,
  city TEXT,
  bundesland TEXT,
  remote BOOLEAN,
  client_hash TEXT,
  raw_blob_id BIGINT REFERENCES raw_blob(id) ON DELETE SET NULL,
  schema_version INT NOT NULL DEFAULT 1,
  is_canonical BOOLEAN NOT NULL DEFAULT TRUE,
  dedupe_fingerprint TEXT
);
CREATE INDEX IF NOT EXISTS listings_src_posted_idx ON listings (source_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS listings_posted_idx ON listings (posted_at DESC);
CREATE INDEX IF NOT EXISTS listings_dedupe_idx ON listings (dedupe_fingerprint);
CREATE INDEX IF NOT EXISTS listings_city_idx ON listings (city);
CREATE INDEX IF NOT EXISTS listings_cpv_idx ON listings (cpv_code) WHERE cpv_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_budget_idx ON listings (budget_eur) WHERE budget_eur IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_title_trgm_idx ON listings USING GIN (to_tsvector('german', title));

-- ---------- term hits (sparse, per-listing) ----------
CREATE TABLE IF NOT EXISTS term_hits (
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  dict_key TEXT NOT NULL,
  term TEXT NOT NULL,
  hit_count INT NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 1.0,
  in_title BOOLEAN NOT NULL DEFAULT FALSE,
  context TEXT,
  dict_version INT NOT NULL,
  PRIMARY KEY (listing_id, dict_key, term)
);
CREATE INDEX IF NOT EXISTS term_hits_dict_term_idx ON term_hits (dict_key, term);
CREATE INDEX IF NOT EXISTS term_hits_term_idx ON term_hits (term);

-- ---------- weekly aggregates ----------
CREATE TABLE IF NOT EXISTS agg_weekly_volume (
  week DATE NOT NULL,
  source_id TEXT NOT NULL,
  listings INT NOT NULL,
  lang_de INT NOT NULL,
  lang_en INT NOT NULL,
  remote_share REAL,
  budget_p50 NUMERIC,
  budget_disclosed_n INT,
  total_budget_eur NUMERIC,
  PRIMARY KEY (week, source_id)
);

CREATE TABLE IF NOT EXISTS agg_weekly_term (
  week DATE NOT NULL,
  source_id TEXT NOT NULL,
  dict_key TEXT NOT NULL,
  term TEXT NOT NULL,
  listing_count INT NOT NULL,
  mention_share REAL,
  density_per_1k REAL,
  PRIMARY KEY (week, source_id, dict_key, term)
);
CREATE INDEX IF NOT EXISTS agg_weekly_term_dict_term_idx ON agg_weekly_term (dict_key, term, week);

CREATE TABLE IF NOT EXISTS agg_cooc (
  week DATE NOT NULL,
  dict_key TEXT NOT NULL,
  term_a TEXT NOT NULL,
  term_b TEXT NOT NULL,
  pair_count INT NOT NULL,
  lift REAL NOT NULL,
  PRIMARY KEY (week, dict_key, term_a, term_b)
);

CREATE TABLE IF NOT EXISTS agg_term_lifecycle (
  dict_key TEXT NOT NULL,
  term TEXT NOT NULL,
  bucket TEXT NOT NULL,
  slope REAL NOT NULL,
  recent_total INT NOT NULL,
  baseline_total INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dict_key, term)
);

CREATE TABLE IF NOT EXISTS agg_clusters (
  cluster_id TEXT PRIMARY KEY,
  exemplar_title TEXT NOT NULL,
  members INT NOT NULL,
  sources TEXT[] NOT NULL,
  median_gap_days INT,
  last_seen_week DATE NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- operational ----------
CREATE TABLE IF NOT EXISTS dictionaries (
  dict_key TEXT NOT NULL,
  term TEXT NOT NULL,
  aliases TEXT[],
  added_at DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_at DATE,
  dict_version INT NOT NULL,
  PRIMARY KEY (dict_key, term, dict_version)
);

CREATE TABLE IF NOT EXISTS watermarks (
  source_id TEXT PRIMARY KEY,
  last_posted_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  next_planned_run_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quarantine (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  raw_blob_id BIGINT REFERENCES raw_blob(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS quarantine_unresolved_idx ON quarantine (created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS source_health (
  source_id TEXT NOT NULL,
  run_started_at TIMESTAMPTZ NOT NULL,
  run_completed_at TIMESTAMPTZ,
  fetched_n INT,
  parsed_ok_n INT,
  parsed_fail_n INT,
  inserted_n INT,
  dedup_n INT,
  watermark_before TIMESTAMPTZ,
  watermark_after TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  PRIMARY KEY (source_id, run_started_at)
);

CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL,
  source_id TEXT,
  event TEXT NOT NULL,
  meta JSONB,
  run_id TEXT
);
CREATE INDEX IF NOT EXISTS event_log_ts_idx ON event_log (ts DESC);
CREATE INDEX IF NOT EXISTS event_log_run_idx ON event_log (run_id) WHERE run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS annotations (
  id BIGSERIAL PRIMARY KEY,
  ts DATE NOT NULL,
  label TEXT NOT NULL,
  kind TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_views (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS term_watchlist (
  id BIGSERIAL PRIMARY KEY,
  dict_key TEXT NOT NULL,
  term TEXT NOT NULL,
  threshold_z REAL NOT NULL DEFAULT 2.5,
  last_alert_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dict_key, term)
);

CREATE TABLE IF NOT EXISTS audit_labels (
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  dict_key TEXT NOT NULL,
  term TEXT NOT NULL,
  label TEXT NOT NULL,
  labeled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, dict_key, term)
);

INSERT INTO schema_history(version, filename) VALUES (1, '0001_init.sql')
  ON CONFLICT (version) DO NOTHING;
