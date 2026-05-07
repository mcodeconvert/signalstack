/**
 * Ingest pipeline.
 *
 *   for each extractor:
 *     fetch RawDocs
 *       store raw_blob (idempotent on content_hash)
 *       expand into ParsedListings (one RawDoc → many Listings for RSS)
 *       upsert Listings (idempotent on id)
 *       derive term_hits, upsert (idempotent on listing_id, dict_key, term)
 *       update watermark
 *     write source_health row
 */
import { db } from './db.js';
import { runLogger } from './log.js';
import { listingId } from '@signalstack/core/fingerprint';
import { dedupeFingerprint } from '@signalstack/core/fingerprint';
import { deriveHits } from '@signalstack/core/hits';
import { EXTRACTORS, ACTIVE_SOURCE_IDS } from './extractors/index.js';
import { mapItem as mapFreelance } from './extractors/freelance.js';
import { mapItem as mapTed } from './extractors/ted.js';
import { mapItem as mapBund } from './extractors/bund.js';
import { mapItem as mapHn } from './extractors/hn.js';
import { mapItem as mapGithub } from './extractors/github.js';
import { mapItem as mapJunico } from './extractors/junico.js';
import { mapItem as mapFreelancerMap } from './extractors/freelancermap.js';
import { mapItem as mapRemoteOK } from './extractors/remoteok.js';
import { mapItem as mapWwr } from './extractors/wwr.js';
import { mapItem as mapRemotive } from './extractors/remotive.js';
import { mapItem as mapJobicy } from './extractors/jobicy.js';
import { mapItem as mapArbeitnow } from './extractors/arbeitnow.js';
import { mapItem as mapHimalayas } from './extractors/himalayas.js';
import { mapItem as mapJobspresso } from './extractors/jobspresso.js';
import { mapItem as mapNoFluffJobs } from './extractors/nofluffjobs.js';
import { mapItem as mapWorkingnomads } from './extractors/workingnomads.js';

const ITEM_MAPPERS = {
  freelance: mapFreelance,
  ted: mapTed,
  bund: mapBund,
  hn: mapHn,
  github: mapGithub,
  junico: mapJunico,
  freelancermap: mapFreelancerMap,
  remoteok: mapRemoteOK,
  wwr: mapWwr,
  remotive: mapRemotive,
  jobicy: mapJobicy,
  arbeitnow: mapArbeitnow,
  himalayas: mapHimalayas,
  jobspresso: mapJobspresso,
  nofluffjobs: mapNoFluffJobs,
  workingnomads: mapWorkingnomads
};

/** @param {string[]} sourceIds */
export async function runIngest(sourceIds = ACTIVE_SOURCE_IDS) {
  const sql = db();
  const runId = `run_${Date.now().toString(36)}`;
  const summary = {};
  for (const sourceId of sourceIds) {
    const ext = EXTRACTORS[sourceId];
    if (!ext) continue;
    const log = runLogger(runId, sourceId);
    const startedAt = new Date();
    let fetched = 0, parsedOk = 0, parsedFail = 0, inserted = 0, dedup = 0;
    let errMsg = null;
    let watermarkBefore = null, watermarkAfter = null;

    try {
      const wm = await sql`SELECT last_posted_at FROM watermarks WHERE source_id = ${sourceId}`;
      watermarkBefore = wm[0]?.last_posted_at ?? null;

      for await (const raw of ext.fetch(watermarkBefore)) {
        if (!raw) break;
        fetched++;
        // store raw_blob idempotently
        const rows = await sql`
          INSERT INTO raw_blob(source_id, fetched_at, url, http_status, content_hash, body, parse_status)
          VALUES (${raw.sourceId}, ${raw.fetchedAt}, ${raw.url}, ${raw.httpStatus}, ${raw.contentHash},
                  ${Buffer.from(typeof raw.body === 'string' ? raw.body : raw.body)}, 'pending')
          ON CONFLICT (source_id, content_hash) DO NOTHING
          RETURNING id
        `;
        const rawBlobId = rows[0]?.id ?? null;
        if (!rawBlobId) { dedup++; continue; }

        // Bundle-style: expand _items into many listings (RSS-feed sources or paged APIs)
        const mapper = ITEM_MAPPERS[sourceId];
        let listings = [];
        if (mapper && raw._items) {
          for (const it of raw._items) {
            try { listings.push(mapper(it)); }
            catch (e) { parsedFail++; log.warn({ err: String(e?.message ?? e) }, 'item parse fail'); }
          }
        } else {
          const r = await ext.parse(raw);
          if (r.status === 'ok') listings = [r.listing];
          else parsedFail++;
        }

        for (const l of listings) {
          const enriched = await ext.enrich(l);
          const id = listingId(enriched.sourceId, enriched.sourceUrl, enriched.postedAt);
          const fp = dedupeFingerprint({ title: enriched.title, budgetEur: enriched.budgetEur, postedAt: enriched.postedAt });
          const ins = await sql`
            INSERT INTO listings(id, source_id, source_url, posted_at, language, title, description,
                                 category, cpv_code, budget_eur, budget_kind, duration_days,
                                 city, bundesland, remote, raw_blob_id, schema_version, is_canonical, dedupe_fingerprint)
            VALUES (${id}, ${enriched.sourceId}, ${enriched.sourceUrl}, ${enriched.postedAt},
                    ${enriched.language ?? null}, ${enriched.title}, ${enriched.description ?? null},
                    ${enriched.category ?? null}, ${enriched.cpvCode ?? null}, ${enriched.budgetEur ?? null},
                    ${enriched.budgetKind ?? null}, ${enriched.durationDays ?? null},
                    ${enriched.city ?? null}, ${enriched.bundesland ?? null}, ${enriched.remote ?? null},
                    ${rawBlobId}, 1, true, ${fp})
            ON CONFLICT (id) DO NOTHING
            RETURNING id
          `;
          if (ins.length === 0) { dedup++; continue; }
          inserted++;
          parsedOk++;

          // term hits
          const hits = deriveHits({ title: enriched.title, description: enriched.description }, id);
          if (hits.length) {
            await sql`
              INSERT INTO term_hits ${sql(hits.map(h => ({
                listing_id: h.listingId, dict_key: h.dictKey, term: h.term,
                hit_count: h.hitCount, confidence: h.confidence,
                in_title: h.inTitle, context: h.context, dict_version: h.dictVersion
              })))}
              ON CONFLICT (listing_id, dict_key, term) DO NOTHING
            `;
          }

          // watermark forward
          if (!watermarkAfter || enriched.postedAt > watermarkAfter) watermarkAfter = enriched.postedAt;
        }

        // mark raw_blob parsed
        await sql`UPDATE raw_blob SET parse_status = 'ok' WHERE id = ${rawBlobId}`;
      }

      if (watermarkAfter) {
        await sql`
          INSERT INTO watermarks(source_id, last_posted_at, last_run_at)
          VALUES (${sourceId}, ${watermarkAfter}, now())
          ON CONFLICT (source_id) DO UPDATE
          SET last_posted_at = GREATEST(watermarks.last_posted_at, EXCLUDED.last_posted_at),
              last_run_at = EXCLUDED.last_run_at
        `;
      }
      log.info({ fetched, parsedOk, parsedFail, inserted, dedup }, 'source done');
    } catch (err) {
      errMsg = String(err?.stack ?? err);
      log.error({ err: errMsg }, 'source failed');
    }

    const completedAt = new Date();
    await sql`
      INSERT INTO source_health(source_id, run_started_at, run_completed_at,
                                fetched_n, parsed_ok_n, parsed_fail_n, inserted_n, dedup_n,
                                watermark_before, watermark_after, duration_ms, error_message)
      VALUES (${sourceId}, ${startedAt}, ${completedAt},
              ${fetched}, ${parsedOk}, ${parsedFail}, ${inserted}, ${dedup},
              ${watermarkBefore}, ${watermarkAfter}, ${completedAt - startedAt}, ${errMsg})
    `;
    summary[sourceId] = { fetched, parsedOk, parsedFail, inserted, dedup, errMsg };
  }
  return { runId, summary };
}
