/**
 * W4: post-scraping enrichment passes.
 *
 * Each pass is:
 *   • idempotent — safe to re-run, only touches rows missing the field
 *   • fast       — bounded by an UPDATE … WHERE … IS NULL row count
 *   • independent — no inter-pass ordering required
 *
 * Called from runner.js after each ingest run. Total budget per call ≤ a few
 * seconds at production volume (10k listings).
 *
 * Why backfill (vs. computing in extractors only)?
 *   The extractors set canonical_role/employer/buyer/etc. on NEW rows from W3
 *   onward, but the existing 11k rows in production were ingested before W3
 *   shipped — their new columns are NULL.  Backfill applies the same logic
 *   retroactively so the dashboards have meaningful data immediately after
 *   deploy, instead of waiting 30+ days for accumulation.
 */
import { db } from './db.js';
import { canonicalRole, canonicalEmployer } from '@signalstack/core/canonical-role';
import { log } from './log.js';

/**
 * Run all 4 passes in sequence. Returns a summary of rows touched per pass.
 */
export async function runEnrichment() {
  const summary = {};
  for (const [name, fn] of Object.entries(PASSES)) {
    const t0 = Date.now();
    try {
      const n = await fn();
      summary[name] = { rows: n, ms: Date.now() - t0 };
      log.info({ pass: name, rows: n, ms: summary[name].ms }, 'enrich pass done');
    } catch (err) {
      summary[name] = { error: String(err?.message ?? err) };
      log.warn({ pass: name, err: summary[name].error }, 'enrich pass failed (non-fatal)');
    }
  }
  return summary;
}

const PASSES = {
  canonicalRoles: enrichCanonicalRoles,
  canonicalEmployers: enrichCanonicalEmployers,
  canonicalBuyers: enrichCanonicalBuyers,
  budgetPerMonth: enrichBudgetPerMonth
};

/* ------------------------------------------------------------------ */

/**
 * Pass 1 — canonical_role backfill.
 * Targets job-shaped sources where canonical_role is NULL but title looks like a role.
 * Bounded to 5,000 rows per call to keep latency predictable.
 */
async function enrichCanonicalRoles() {
  const sql = db();
  const ROLE_SOURCES = ['nofluffjobs', 'arbeitnow', 'junico', 'wwr', 'remoteok', 'bund'];
  const rows = await sql`
    SELECT id, title
    FROM listings
    WHERE canonical_role IS NULL
      AND source_id = ANY(${ROLE_SOURCES})
    LIMIT 5000
  `;
  if (rows.length === 0) return 0;
  // Group updates by canonical-role value to batch (postgres.js doesn't have
  // multi-row UPDATE … FROM VALUES … shortcut — we issue per-row UPDATEs but
  // pipelined within a single transaction).
  await sql.begin(async tx => {
    for (const r of rows) {
      const slug = canonicalRole(r.title);
      if (!slug) continue;
      await tx`UPDATE listings SET canonical_role = ${slug} WHERE id = ${r.id}`;
    }
  });
  return rows.length;
}

/**
 * Pass 2 — canonical_employer backfill.
 * Mostly relevant for `bund` (employer parsed from RSS Arbeitgeber field) and
 * `nofluffjobs` rows ingested before W3.  We re-derive from description
 * because that's where most extractors stash the employer.
 */
async function enrichCanonicalEmployers() {
  const sql = db();
  const rows = await sql`
    SELECT id, source_id, description
    FROM listings
    WHERE canonical_employer IS NULL
      AND source_id IN ('nofluffjobs', 'bund')
      AND description IS NOT NULL
    LIMIT 5000
  `;
  if (rows.length === 0) return 0;
  let touched = 0;
  await sql.begin(async tx => {
    for (const r of rows) {
      // Both sources put employer first in the description before " · ".
      // nofluffjobs: "Link Group GmbH · Java · DEU"
      // bund:        "Bundesagentur für Arbeit · Berlin"
      const head = String(r.description).split(' · ')[0];
      const slug = canonicalEmployer(head);
      if (!slug) continue;
      await tx`UPDATE listings SET canonical_employer = ${slug} WHERE id = ${r.id}`;
      touched++;
    }
  });
  return touched;
}

/**
 * Pass 3 — canonical_buyer for TED + bund.
 *
 * TED: buyer-name lives inside raw_blob.body JSON (we didn't surface it as a
 * dedicated listing column).  Cheaper alternative — for now derive from
 * source_url (notice number doesn't tell us the buyer).  We fall back to
 * city + bundesland as a coarse buyer-region proxy until a future pass
 * re-parses raw_blob to pull the precise buyer name.
 *
 * bund: description starts with "Arbeitgeber: <name> · Ort: <city>" → name is
 * the buyer for stellen, the contracting authority for ausschreibungen.
 *
 * For both: store a slug in canonical_buyer.  Cross-source dedup is implicit
 * once both sources slugify the same way.
 */
async function enrichCanonicalBuyers() {
  const sql = db();
  // bund — same parser shape as canonical_employer.
  const bundRows = await sql`
    SELECT id, description
    FROM listings
    WHERE canonical_buyer IS NULL
      AND source_id = 'bund'
      AND description IS NOT NULL
    LIMIT 5000
  `;
  let touched = 0;
  if (bundRows.length) {
    await sql.begin(async tx => {
      for (const r of bundRows) {
        const head = String(r.description).split(' · ')[0];
        const slug = canonicalEmployer(head);
        if (!slug) continue;
        await tx`UPDATE listings SET canonical_buyer = ${slug} WHERE id = ${r.id}`;
        touched++;
      }
    });
  }
  // TED — coarse fallback: city + bundesland.  Not as precise as parsing
  // buyer-name from raw_blob, but populates the column so v_buyers_top has
  // data to render.  Refinement is a future pass.
  const tedRows = await sql`
    SELECT id, city, bundesland
    FROM listings
    WHERE canonical_buyer IS NULL
      AND source_id = 'ted'
      AND city IS NOT NULL
    LIMIT 5000
  `;
  if (tedRows.length) {
    await sql.begin(async tx => {
      for (const r of tedRows) {
        const slug = canonicalEmployer(`${r.city}-${r.bundesland ?? 'de'}`);
        if (!slug) continue;
        await tx`UPDATE listings SET canonical_buyer = ${slug} WHERE id = ${r.id}`;
        touched++;
      }
    });
  }
  return touched;
}

/**
 * Pass 4 — budget_eur_per_month normalization.
 *
 * Translation rules (when budget_eur + budget_kind populated):
 *   hour     → ×160 (40h/wk × 4wk)
 *   day      → ×22  (~22 working days/month)
 *   monthly  → ×1
 *   project  → if duration_days set: budget_eur / (duration_days/30)
 *              otherwise NULL (project-total isn't a run-rate)
 *
 * Cross-comparison via this column lets the dashboard rank "what does an X-skill
 * role pay equivalent monthly" across hourly freelance + monthly salary corpora.
 */
async function enrichBudgetPerMonth() {
  const sql = db();
  const result = await sql`
    UPDATE listings
    SET budget_eur_per_month = CASE budget_kind
      WHEN 'hour'    THEN budget_eur * 160
      WHEN 'day'     THEN budget_eur * 22
      WHEN 'monthly' THEN budget_eur
      WHEN 'project' THEN CASE
        WHEN duration_days IS NOT NULL AND duration_days > 0
          THEN budget_eur / (duration_days::numeric / 30)
        ELSE NULL
      END
      ELSE NULL
    END
    WHERE budget_eur_per_month IS NULL
      AND budget_eur IS NOT NULL
      AND budget_kind IS NOT NULL
  `;
  return result.count ?? 0;
}
