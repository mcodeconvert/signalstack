/**
 * Scraper worker entrypoint.
 *
 * Boot sequence:
 *   1. Apply DB migrations
 *   2. Seed dictionaries
 *   3. Start cron schedule (Sunday 03:00 + 04:30 stats)
 *
 * Heath endpoint exposed on :PORT (default 3001) for Coolify probe.
 */
import http from 'node:http';
import cron from 'node-cron';
import { runIngest } from './ingest.js';
import { refreshStats } from './stats.js';
import { db, shutdown } from './db.js';
import { log } from './log.js';

const PORT = Number(process.env.WORKER_PORT ?? 3001);

let lastSuccess = null;
let lastError = null;
let inFlight = false;

http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    // Liveness: return 200 if process is alive. Use /ready for "data fresh".
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, lastSuccess, lastError, inFlight }));
    return;
  }
  if (req.url === '/ready') {
    // Readiness: only true if a successful run happened in the last 8 days.
    const ready = !!lastSuccess && (Date.now() - lastSuccess.getTime()) < 8 * 24 * 3600 * 1000;
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ready, lastSuccess, lastError, inFlight }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => log.info({ port: PORT }, 'health server up'));

async function runOnce() {
  if (inFlight) { log.warn('previous run still in flight — skipping'); return; }
  inFlight = true;
  try {
    log.info('cron tick · ingest');
    const r = await runIngest();
    log.info({ runId: r.runId, summary: r.summary }, 'ingest done');
    log.info('cron tick · stats');
    await refreshStats();
    lastSuccess = new Date();
    lastError = null;
  } catch (err) {
    lastError = String(err?.stack ?? err);
    log.error({ err: lastError }, 'run failed');
  } finally {
    inFlight = false;
  }
}

// Sunday 03:00 — ingest. Sunday 04:30 — stats refresh in case ingest was long.
cron.schedule('0 3 * * 0', () => runOnce());
cron.schedule('30 4 * * 0', () => refreshStats().catch(e => log.error(e, 'stats fail')));

// On boot run an immediate stats refresh so dashboards aren't empty
refreshStats().catch(e => log.warn(e, 'initial stats refresh failed (likely empty db)'));

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log.info({ sig }, 'shutdown');
    await shutdown();
    process.exit(0);
  });
}

log.info('worker ready · cron: Sun 03:00 ingest, Sun 04:30 stats');
