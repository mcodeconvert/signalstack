/**
 * Scraper worker entrypoint.
 *
 * Boot:
 *   1. (Outer Dockerfile CMD already ran migrate + seed dicts.)
 *   2. Start health server on $WORKER_PORT.
 *   3. If listings table is empty → run an immediate full ingest.
 *   4. Schedule cadence buckets (W2 — see CADENCE map below).
 *
 * Cadence (W2):
 *   bucket  cron               sources                                              rationale
 *   ------  -----------------  ---------------------------------------------------  ---------------------------------------
 *   hn      0 3 * * *          [hn]                                                 daily — Show HN / Ask HN windows are <72h
 *   fast    30 3 * * 0,3       [freelancermap, junico, nofluffjobs, arbeitnow]      Sun + Wed — high-density DACH freelance/jobs
 *   weekly  0 4 * * 0          [github, bund, remoteok, wwr]                        Sunday — slower-churn (RFP cycles, repos)
 *   ted     0 5 1,15 * *       [ted]                                                bi-weekly — notices stay valid for weeks
 *   stats   30 4 * * 0         (refreshStats)                                       weekly aggregates → /pulse, /money
 *
 * Routes:
 *   GET  /health   liveness — 200 always; reports lastSuccess + per-bucket lastRun
 *   GET  /ready    readiness — 200 if last successful run < 8 days
 *   POST /run      manual trigger of the full active set (header X-Trigger-Token)
 *   POST /reset    wipe DB + auto-trigger full ingest (header X-Trigger-Token)
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
/** @type {Record<string, string>} bucketName → ISO timestamp of last successful run */
const lastBucketRun = {};

/**
 * W2 cadence buckets. `sources` is a subset of ACTIVE_SOURCE_IDS.
 * `cron` is in node-cron syntax, evaluated in container TZ (UTC in Coolify by default).
 * Times are staggered (03:00 / 03:30 / 04:00 / 05:00) so concurrent runs are unlikely.
 */
const CADENCE = {
  hn:     { cron: '0 3 * * *',    sources: ['hn'] },
  fast:   { cron: '30 3 * * 0,3', sources: ['freelancermap', 'junico', 'nofluffjobs', 'arbeitnow'] },
  weekly: { cron: '0 4 * * 0',    sources: ['github', 'bund', 'remoteok', 'wwr'] },
  ted:    { cron: '0 5 1,15 * *', sources: ['ted'] }
};

http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, lastSuccess, lastError, inFlight, lastBucketRun, cadence: Object.fromEntries(Object.entries(CADENCE).map(([k, v]) => [k, v.cron])) }));
    return;
  }
  if (req.url === '/ready') {
    const ready = !!lastSuccess && (Date.now() - lastSuccess.getTime()) < 8 * 24 * 3600 * 1000;
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ready, lastSuccess, lastError, inFlight, lastBucketRun }));
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
    runOnce(undefined, 'manual').catch(() => {});  // detached — full active set
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
      runOnce(undefined, 'reset').catch(() => {});
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message ?? err) }));
    }
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => log.info({ port: PORT }, 'health server up'));

/**
 * Run an ingest pass. `sources` undefined = full active set; passing a subset
 * runs just those extractors (used by cadence buckets).
 * `bucketName` is purely for logging + lastBucketRun tracking.
 */
async function runOnce(sources, bucketName = 'manual') {
  if (inFlight) {
    log.warn({ bucket: bucketName }, 'previous run still in flight — skipping');
    return;
  }
  inFlight = true;
  try {
    log.info({ bucket: bucketName, sources: sources ?? 'ACTIVE_SOURCE_IDS' }, 'ingest start');
    const r = await runIngest(sources);
    log.info({ bucket: bucketName, runId: r.runId, summary: r.summary }, 'ingest done');
    // depth-metrics snapshot (every bucket — cheap, idempotent, fresh row each time)
    try {
      const sql = db();
      const [{ refresh_extraction_depth_metrics: rowsInserted }] =
        await sql`SELECT refresh_extraction_depth_metrics()`;
      log.info({ bucket: bucketName, rowsInserted }, 'extraction_depth_metrics snapshot');
    } catch (e) {
      log.warn({ err: String(e?.message ?? e) }, 'depth-metrics snapshot failed (non-fatal)');
    }
    lastSuccess = new Date();
    lastBucketRun[bucketName] = lastSuccess.toISOString();
    lastError = null;
    log.info({ bucket: bucketName, at: lastSuccess.toISOString() }, 'run complete');
  } catch (err) {
    lastError = String(err?.stack ?? err);
    log.error({ bucket: bucketName, err: lastError }, 'run failed');
  } finally {
    inFlight = false;
  }
}

// W2: register cadence buckets
for (const [name, b] of Object.entries(CADENCE)) {
  cron.schedule(b.cron, () => runOnce(b.sources, name));
  log.info({ bucket: name, cron: b.cron, sources: b.sources }, 'cadence registered');
}
// Stats refresh stays separate (Sunday 04:30 UTC, after weekly bucket at 04:00)
cron.schedule('30 4 * * 0', () => refreshStats().catch(e => log.error(e, 'stats fail')));

// Boot-time: if DB is empty, run an immediate full ingest
async function maybeFirstRun() {
  try {
    const sql = db();
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM listings`;
    if (count === 0) {
      log.info('listings table empty — kicking off first real ingest');
      runOnce(undefined, 'boot').catch(() => {});
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

log.info({ buckets: Object.keys(CADENCE) }, 'worker ready');
