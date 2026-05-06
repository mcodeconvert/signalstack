#!/usr/bin/env node
/**
 * One-time seeder: load the 5-year synthetic corpus (packages/web/data/demo.json)
 * into the live Postgres database.
 *
 * Idempotent: skips if listings table already has rows.
 *
 * Why: gives the dashboard meaningful history on first deploy. Real scrapes
 * accumulate on top going forward; the worker's weekly cron just adds rows.
 */
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL required'); process.exit(2); }
  const sql = postgres(url, { max: 4, prepare: false, idle_timeout: 10 });

  const candidates = [
    path.resolve(__dirname, '../packages/web/data/demo.json'),
    path.resolve(__dirname, '../data/demo.json')
  ];
  const demoPath = candidates.find(existsSync);
  if (!demoPath) {
    console.error('[seed-from-demo] demo.json not found in any expected location');
    await sql.end({ timeout: 5 });
    process.exit(0);
  }

  try {
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM listings`;
    if (count > 0) {
      console.log(`[seed-from-demo] listings table has ${count} rows — skipping`);
      return;
    }

    console.log(`[seed-from-demo] reading ${demoPath}`);
    const demo = JSON.parse(await readFile(demoPath, 'utf8'));
    const listings = demo.listings;
    console.log(`[seed-from-demo] inserting ${listings.length} listings`);

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < listings.length; i += BATCH) {
      const slice = listings.slice(i, i + BATCH).map(l => ({
        id: l.id,
        source_id: l.src,
        source_url: l.sourceUrl,
        posted_at: l.postedAt,
        ingested_at: new Date(),
        language: l.lang,
        title: l.title,
        description: '',
        category: l.cat,
        cpv_code: l.cpv,
        budget_eur: l.budget,
        budget_kind: l.budgetKind,
        duration_days: l.dur,
        city: l.city,
        bundesland: l.bundesland,
        remote: l.remote,
        schema_version: 1,
        is_canonical: true
      }));
      await sql`INSERT INTO listings ${sql(slice)} ON CONFLICT (id) DO NOTHING`;
      inserted += slice.length;
      if (i % 2000 === 0) console.log(`[seed-from-demo]   listings ${inserted}/${listings.length}`);
    }
    console.log(`[seed-from-demo] listings done: ${inserted}`);

    console.log(`[seed-from-demo] inserting term hits`);
    let hitsCount = 0;
    let hitsBuffer = [];
    for (const l of listings) {
      for (const h of l.hits) {
        const idx = h.indexOf(':');
        if (idx < 0) continue;
        hitsBuffer.push({
          listing_id: l.id,
          dict_key: h.slice(0, idx),
          term: h.slice(idx + 1),
          hit_count: 1,
          confidence: 1.0,
          in_title: false,
          context: '',
          dict_version: 1
        });
        if (hitsBuffer.length >= 1000) {
          await sql`INSERT INTO term_hits ${sql(hitsBuffer)} ON CONFLICT DO NOTHING`;
          hitsCount += hitsBuffer.length;
          hitsBuffer = [];
          if (hitsCount % 10000 === 0) console.log(`[seed-from-demo]   hits ${hitsCount}`);
        }
      }
    }
    if (hitsBuffer.length) {
      await sql`INSERT INTO term_hits ${sql(hitsBuffer)} ON CONFLICT DO NOTHING`;
      hitsCount += hitsBuffer.length;
    }
    console.log(`[seed-from-demo] hits done: ${hitsCount}`);

    // Watermarks per source — set to most recent posted_at
    await sql.unsafe(`
      INSERT INTO watermarks (source_id, last_posted_at, last_run_at)
      SELECT source_id, max(posted_at)::timestamptz, now()
      FROM listings
      GROUP BY source_id
      ON CONFLICT (source_id) DO UPDATE
      SET last_posted_at = EXCLUDED.last_posted_at,
          last_run_at = EXCLUDED.last_run_at
    `);
    console.log(`[seed-from-demo] watermarks updated`);
  } catch (err) {
    console.error('[seed-from-demo] FAILED:', err.message ?? err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
