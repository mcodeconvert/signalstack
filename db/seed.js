#!/usr/bin/env node
/**
 * Seed dictionaries D1-D7 from @signalstack/core into Postgres.
 * Idempotent.
 */
import postgres from 'postgres';
import { DICTS } from '../packages/core/src/dict.js';
import { DICT_VERSION } from '../packages/core/src/types.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL required'); process.exit(2); }
  const sql = postgres(url, { max: 2, prepare: false });
  try {
    let count = 0;
    for (const [dictKey, dict] of Object.entries(DICTS)) {
      for (const t of dict.terms) {
        await sql`
          INSERT INTO dictionaries(dict_key, term, aliases, dict_version)
          VALUES (${dictKey}, ${t.canonical}, ${t.aliases}, ${DICT_VERSION})
          ON CONFLICT (dict_key, term, dict_version) DO UPDATE
          SET aliases = EXCLUDED.aliases
        `;
        count++;
      }
    }
    console.log(`[seed] dictionaries · ${count} term rows`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch(err => { console.error('[seed]', err); process.exit(1); });
