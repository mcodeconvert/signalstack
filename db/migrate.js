#!/usr/bin/env node
/**
 * Idempotent migration runner.
 * - Acquires a Postgres advisory lock to prevent concurrent applies.
 * - Reads numbered .sql files from db/migrations.
 * - Records applied versions in schema_history.
 *
 * Usage: DATABASE_URL=postgres://... node db/migrate.js
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const ADVISORY_LOCK_KEY = 0x51_67_4e_41_5a_53_53_31n; // "signalstack" (loose)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const sql = postgres(url, { max: 2, prepare: false });

  try {
    await sql.unsafe(`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY}::bigint)`);
    console.log(`[migrate] advisory lock acquired`);

    // ensure history table
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS schema_history (
      version INT PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum TEXT
    )`);

    const applied = new Set(
      (await sql`SELECT version FROM schema_history`).map(r => r.version)
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter(f => /^\d+_.*\.sql$/.test(f))
      .sort();

    let count = 0;
    for (const f of files) {
      const version = Number(f.match(/^(\d+)_/)[1]);
      if (applied.has(version)) {
        console.log(`[migrate] skip ${f} (already applied)`);
        continue;
      }
      console.log(`[migrate] applying ${f} ...`);
      const body = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
      await sql.begin(async tx => {
        await tx.unsafe(body);
      });
      count++;
    }
    console.log(`[migrate] done · ${count} new migration(s) applied`);
  } finally {
    try { await sql.unsafe(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY}::bigint)`); } catch {}
    await sql.end({ timeout: 5 });
  }
}

main().catch(err => { console.error('[migrate]', err); process.exit(1); });
