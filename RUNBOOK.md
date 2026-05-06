# SignalStack · Runbook

## Architecture target

Three Coolify apps inside one Project · `signalstack.parallelship.com`.

| App | Build | Public? | Healthcheck |
|---|---|---|---|
| `signalstack-pg` | Coolify Postgres 16 | no, internal network only | built-in |
| `signalstack-worker` | `ops/Dockerfile.worker` | no | `:3001/health` |
| `signalstack-web` | `ops/Dockerfile.web` | yes — Traefik on `signalstack.parallelship.com` | `:3000/health` |

## One-time deploy

1. **Push repo to GitHub** (if not already done):
   ```bash
   gh repo create parallelship/signalstack --private --source=. --remote=origin --push
   ```

2. **Coolify · Postgres**
   - Create new Postgres 16 service. Copy the *Internal Connection URL*.
   - Volume retention: indefinite. Disk: 50 GB minimum.

3. **Coolify · Worker**
   - New Application → Public Repository → your repo.
   - Build Pack: Dockerfile.
   - Dockerfile path: `ops/Dockerfile.worker`.
   - **Environment variables** (all Runtime, **not** build args):
     - `DATABASE_URL` — paste Internal Postgres URL
     - `LOG_LEVEL=info`
     - `WORKER_PORT=3001`
     - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO` — optional, only for digest/alert email
   - No public port exposed. Internal port: 3001.
   - Healthcheck path: `/health`.

4. **Coolify · Web**
   - New Application → same repo, separate app.
   - Dockerfile path: `ops/Dockerfile.web`.
   - **Build args** (tick "Is Build Arg?"):
     - any future `PUBLIC_*` you add
   - **Runtime env vars**:
     - `DATABASE_URL` — same Internal Postgres URL
     - `ORIGIN=https://signalstack.parallelship.com` — runtime, **not** build arg
   - Public port: 3000.
   - Domain: `signalstack.parallelship.com` (Traefik handles SSL).
   - Healthcheck path: `/health`.

5. **First-run sequence** (worker container does this on boot, in order):
   - `node db/migrate.js` — applies SQL migrations under advisory lock
   - `node db/seed.js` — seeds D1-D7 dictionaries
   - `node packages/scraper/src/runner.js` — starts cron + health server

6. **Verify**:
   - `curl https://signalstack.parallelship.com/health` → `{ ok: true, backend: "postgres" }`
   - First scrape runs at next Sunday 03:00 UTC (or trigger manually below).

## Manual operations

```bash
# Trigger a scrape on demand (inside worker container shell):
node packages/scraper/src/cli.js run --source freelance

# Dry-run a source (fetch + parse, no DB writes):
node packages/scraper/src/cli.js dry --source freelance

# Force aggregate refresh:
node packages/scraper/src/cli.js stats

# Backup:
DATABASE_URL=... BACKUP_DIR=/backups bash ops/backup.sh

# Restore:
gunzip -c /backups/signalstack-20260512T030000Z.sql.gz | psql "$DATABASE_URL"
```

## Troubleshooting

### Symptom: dashboard shows `backend: demo`
- DATABASE_URL is not reaching the web container. Check Coolify env vars.
- Cause: wired as build arg instead of runtime, or typo in URL.

### Symptom: source stays at 0 listings
- `/admin/sources` shows "stale".
- Check worker logs in Coolify (search for `runId=`).
- Verify outbound DNS works: `nslookup www.freelance.de` from worker shell.
- Check `quarantine` table:
  ```sql
  SELECT source_id, reason, count(*) FROM quarantine WHERE resolved_at IS NULL GROUP BY 1, 2;
  ```

### Symptom: Playwright timeouts
- Increase `WORKER_FETCH_TIMEOUT_MS` env (default 12000).
- Reduce concurrency: env `PLAYWRIGHT_POOL=1`.
- Check VPS memory: Playwright Chromium needs ~250 MB headroom.

### Symptom: pg disk filling
```sql
SELECT pg_size_pretty(pg_database_size('signalstack'));
SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY 2 DESC LIMIT 10;
```
- raw_blob is the biggest table. Per your decision: keep indefinitely.
- If it ever needs trimming: `DELETE FROM raw_blob WHERE fetched_at < now() - interval '5 years';`
  (will cascade to no listings since raw_blob_id is `ON DELETE SET NULL`).

### Symptom: dead-source alarm
- Triggered when `last_run_at > 2 × expected_interval`.
- Check Coolify worker container status.
- Inspect `source_health` table for last error.
- If a parser broke: run `npm run scrape:replay --source X` against the captured raw_blob to iterate locally.

## Rollback

Coolify → Application → Deployments → previous successful deploy → Redeploy.
Schema changes are additive. If you rolled back across a migration, run:
```bash
DATABASE_URL=... npm run db:migrate
```
to ensure history is intact.

## Periodic checklist (do nothing if all green)

Once a month, ~10 minutes:

- [ ] `/admin/sources` — every source has listings within last 14 days?
- [ ] `quarantine` table — nothing > 30 days unresolved?
- [ ] Coolify disk usage on pg volume < 75%?
- [ ] Backup file count in `BACKUP_DIR` matches expectation (~4–8 weekly)?
- [ ] Last week's digest email received? (if SMTP configured)

## Sources catalog · what's wired vs what's blocked

### Active extractors (5)

| ID | Source | Method | Records | Why |
|---|---|---|---|---|
| `ted` | TED — Tenders Electronic Daily | POST API v3, paged | ~600/wk DEU | Public domain by EU Reg. 1816/2003 |
| `bund` | service.bund.de | RSS (Stellen + Ausschreibungen) | ~80/wk | RSS endpoints exempt from /Suche/ disallow |
| `hn` | Hacker News | Algolia search API | ~50/wk | Public, free, intended for programmatic access |
| `github` | GitHub | Search API | ~60/wk | Public, free, 60 req/min unauth |
| `junico` | Junico.de | Sitemap + JSON-LD parse | ~25 active | robots.txt: `Allow: /` (fully open) |

### Audited and not viable (the rest of the original list)

| Source | Verdict | Reason |
|---|---|---|
| Freelance.de | ❌ FORBIDDEN | robots.txt explicitly bans crawling without written permission |
| GULP.de | ⏸ DEFERRED | SPA, requires Playwright + reverse engineering of internal API |
| Twago.de | ❌ DEAD | All variants 301-redirect to nothing useful |
| eVergabe / DTAD | ❌ FORBIDDEN | DTAD robots.txt: `Disallow: /` |
| Bundesanzeiger | ⏸ DEFERRED | JS-rendered, redirects, complex auth flow |
| Insolvenzbekanntmachungen | ❌ FORBIDDEN | New domain robots.txt: `Disallow: /` |
| KfW + BAFA | ⏸ DEFERRED | Public RSS endpoints not discoverable; URL structure changes |
| Bundesgesetzblatt | ⏸ DEFERRED | bgbl.de archive only goes 1949–2022 at the public path |
| OMR Reviews | ⏸ DEFERRED | /reviews/categories returns 404; need to map their actual data path |
| Trusted.de | ⏸ DEFERRED | robots.txt 301-redirects, blocked at WAF level |

The DEFERRED ones can be revisited with more time. The FORBIDDEN ones cannot be scraped at all without written permission from the operators.

## Phase 4 expansion (future)

Each new source = one file:
- `packages/scraper/src/extractors/<source>.js` implementing `SourceExtractor`
- Add to `extractors/index.js` registry
- Add fixtures under `packages/scraper/test/fixtures/<source>/`
- Add unit tests
- Push → Coolify rebuilds worker → next Sunday includes it

No other changes required. Schema, ingest pipeline, dashboard auto-include the new source via `SOURCE_META`.
