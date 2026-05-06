/**
 * Scraper worker entrypoint.
 *
 * Boot:
 *   1. (Outer Dockerfile CMD already ran migrate + seed dicts.)
 *   2. Start health server on $WORKER_PORT.
 *   3. If listings table is empty → run an immediate real ingest so the
 *      dashboard isn't empty on first deploy.
 *   4. Schedule the weekly cron (Sunday 03:00 UTC ingest, 04:30 stats).
 *
 * Routes:
 *   GET  /health   liveness — 200 always
 *   GET  /ready    readiness — 200 only if last successful run < 8 days
 *   POST /run      manual trigger (header X-Trigger-Token)
 */
import http from 'node:http';
import cron from 'node-cron';
import { runIngest } from './ingest.js';
import { refreshStats } from './stats.js';
import { db, shutdown } from './db.js';
import { log } from './log.js';

const PORT = Number(process.env.WORKER_PORT ?? 3001);
const TRIGGER_TOKEN = process.env.TRIGGER_TOKEN ?? '';

let lastSuccess = null;
let lastError = null;
let inFlight = false;

http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, lastSuccess, lastError, inFlight }));
    return;
  }
  if (req.url === '/ready') {
    const ready = !!lastSuccess && (Date.now() - lastSuccess.getTime()) < 8 * 24 * 3600 * 1000;
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ready, lastSuccess, lastError, inFlight }));
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/run')) {
    const tok = req.headers['x-trigger-token'];
    if (!TRIGGER_TOKEN || tok !== TRIGGER_TOKEN) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (inFlight) {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'already in flight' }));
      return;
    }
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
    runOnce().catch(() => {});  // detached
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/reset')) {
    const tok = req.headers['x-trigger-token'];
    if (!TRIGGER_TOKEN || tok !== TRIGGER_TOKEN) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    try {
      const sql = db();
      await sql.unsafe(`TRUNCATE TABLE term_hits, listings, raw_blob, watermarks, source_health, agg_weekly_volume, agg_weekly_term, agg_cooc, agg_term_lifecycle, agg_clusters, quarantine, audit_labels RESTART IDENTITY CASCADE`);
      lastSuccess = null; lastError = null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ wiped: true }));
      // Auto-trigger fresh ingest
      runOnce().catch(() => {});
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => log.info({ port: PORT }, 'health server up'));

async function runOnce() {
  if (inFlight) { log.warn('previous run still in flight — skipping'); return; }
  inFlight = true;
  try {
    log.info('ingest start');
    const r = await runIngest();
    log.info({ runId: r.runId, summary: r.summary }, 'ingest done');
    log.info('stats refresh start');
    await refreshStats();
    lastSuccess = new Date();
    lastError = null;
    log.info({ at: lastSuccess.toISOString() }, 'run complete');
  } catch (err) {
    lastError = String(err?.stack ?? err);
    log.error({ err: lastError }, 'run failed');
  } finally {
    inFlight = false;
  }
}

// Weekly schedule
cron.schedule('0 3 * * 0', () => runOnce());
cron.schedule('30 4 * * 0', () => refreshStats().catch(e => log.error(e, 'stats fail')));

// Boot-time: if DB is empty, run an immediate real ingest
async function maybeFirstRun() {
  try {
    const sql = db();
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM listings`;
    if (count === 0) {
      log.info('listings table empty — kicking off first real ingest');
      runOnce().catch(() => {});
    } else {
      log.info({ count }, 'listings table non-empty — skipping boot ingest');
      // still refresh stats so aggregates exist on boot
      refreshStats().catch(e => log.warn({ err: String(e?.message ?? e) }, 'boot stats refresh failed'));
    }
  } catch (e) {
    log.warn({ err: String(e?.message ?? e) }, 'boot DB probe failed (DB might be warming up)');
  }
}
maybeFirstRun();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log.info({ sig }, 'shutdown');
    await shutdown();
    process.exit(0);
  });
}

log.info('worker ready · cron Sun 03:00 ingest · 04:30 stats');
