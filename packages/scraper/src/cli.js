#!/usr/bin/env node
/**
 * One-shot CLI for ad-hoc operations.
 *
 *   scrape:run    [-- --source X]
 *   scrape:dry    [-- --source X --url Y]
 *   scrape:replay [-- --source X --since YYYY-MM-DD]
 *   stats:refresh
 */
import { runIngest } from './ingest.js';
import { refreshStats } from './stats.js';
import { shutdown } from './db.js';
import { log } from './log.js';
import { EXTRACTORS } from './extractors/index.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const cmd = process.argv[2];
const args = parseArgs(process.argv.slice(3));

async function main() {
  switch (cmd) {
    case 'run': {
      const sources = args.source ? [args.source] : Object.keys(EXTRACTORS);
      const r = await runIngest(sources);
      log.info({ runId: r.runId, summary: r.summary }, 'ingest finished');
      break;
    }
    case 'stats': {
      await refreshStats();
      break;
    }
    case 'dry': {
      const sourceId = args.source ?? 'freelance';
      const ext = EXTRACTORS[sourceId];
      if (!ext) throw new Error(`unknown source ${sourceId}`);
      const collected = [];
      for await (const raw of ext.fetch(null)) {
        if (!raw) continue;
        collected.push({ url: raw.url, items: raw._items?.length ?? 0 });
      }
      console.log(JSON.stringify(collected, null, 2));
      break;
    }
    case 'replay':
    default:
      console.log(`signalstack scraper CLI
  run    [--source X]    real ingest
  dry    [--source X]    fetch + parse without DB writes
  stats                  recompute aggregates
`);
      break;
  }
}
main()
  .catch(err => { log.error({ err: String(err.stack ?? err) }, 'cli failed'); process.exitCode = 1; })
  .finally(() => shutdown());
