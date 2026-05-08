import { db, HAS_DB } from '$lib/server/db.js';
import { getMeta } from '$lib/server/data.js';

/**
 * Role-repost detector — top (canonical_role × canonical_employer × source) tuples
 * reposted ≥ 2× within the last 30 days. Powered by v_role_repost_30d.
 *
 * URL knobs:
 *   ?min=N   — minimum repost_count (default 2)
 *   ?src=ID  — filter to one source (e.g. ?src=nofluffjobs)
 *   ?page=N  — pagination
 */
export async function load({ url, setHeaders }) {
  setHeaders({ 'cache-control': 'private, max-age=60' });
  const meta = await getMeta();
  const minCount = Math.max(2, Number(url.searchParams.get('min') ?? 2));
  const src = (url.searchParams.get('src') ?? '').trim() || null;
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0));
  const PAGE_SIZE = 100;

  if (!HAS_DB) {
    return { meta, rows: [], totalRows: 0, page, totalPages: 0, minCount, src,
             dbBacked: false, viewMissing: false };
  }
  const sql = db();
  let baseRows;
  try {
    baseRows = src
      ? await sql`
          SELECT canonical_role, canonical_employer, source_id,
                 repost_count, first_seen, last_seen, span_days, listing_ids
          FROM v_role_repost_30d
          WHERE repost_count >= ${minCount}
            AND source_id = ${src}
          ORDER BY repost_count DESC, last_seen DESC`
      : await sql`
          SELECT canonical_role, canonical_employer, source_id,
                 repost_count, first_seen, last_seen, span_days, listing_ids
          FROM v_role_repost_30d
          WHERE repost_count >= ${minCount}
          ORDER BY repost_count DESC, last_seen DESC`;
  } catch (err) {
    // View doesn't exist yet (migration 0003 not applied) — degrade gracefully.
    return { meta, rows: [], totalRows: 0, page, totalPages: 0, minCount, src,
             dbBacked: true, viewMissing: true };
  }

  const totalRows = baseRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const slice = baseRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return {
    meta, rows: slice, totalRows, page, totalPages, minCount, src,
    dbBacked: true, viewMissing: false
  };
}
