# SignalStack

Self-running market-signal observatory for the DACH SMB market.
Once-a-week scrape · 5 sources · listing-level model · drillthrough to original.

> **Goal:** Tell me where money is invested and what the market is doing —
> without hiring an analyst.

## Architecture

```
   ┌────────────────┐ weekly cron        ┌──────────────────┐
   │ scraper-worker │ ──── ingest ────▶  │  postgres 16     │
   │ (Node 22 + TS) │                    │  (single DB)     │
   │ Playwright     │ ◀── stats job ──── │                  │
   └────────────────┘                    └──────────────────┘
                                                  ▲
                                                  │ reads aggs +
                                                  │ drillthrough records
                                          ┌──────────────────┐
                                          │ web (SvelteKit)  │ ◀ Traefik ◀ HTTPS
                                          │  api + dashboard │
                                          └──────────────────┘
```

## Repo layout

```
packages/
  core/      types, dictionaries, hits, trend math, fingerprint
  scraper/   extractors, ingest pipeline, stats refresh, demo gen, CLI
  web/       SvelteKit dashboard with /money /pulse /verticals /records /admin
db/
  migrations/  raw SQL, idempotent
  migrate.js   advisory-lock runner
  seed.js      dictionary seeding
ops/
  Dockerfile.web
  Dockerfile.worker
  backup.sh
docker-compose.yml   local pg + adminer
```

## Dashboard pages

| Path | Purpose |
|---|---|
| `/` (Money) | Where money is invested · contract value, day-rate proxy, top spending cities/categories, money-per-term, high-value RFP feed. |
| `/pulse` | Market pulse · top terms, term trend with anomaly markers, top movers, co-occurrence, recurring clusters, regulatory pressure. |
| `/verticals` | Pick a D6 industry (Maschinenbau, Steuerberater, Handwerk…) → all panels filter to that vertical. |
| `/records` | Full listing browser with all filters · CSV export · pagination · 25/page. |
| `/records/:id` | Single record drillthrough · all parsed fields · **clickable original-source URL** · grouped term hits. |
| `/admin/sources` | Source health overview · per-source counts, watermarks, archive depth. |

URL state encoding means every filtered view is linkable / shareable.

## Local dev

```bash
npm install
npm run demo:gen           # generates 5y synthetic corpus (~5 MB) → packages/web/data/demo.json
npm run dev:web            # http://localhost:5173 — runs on demo data without postgres
npm test                   # 38 unit tests (core + scraper)

# With postgres:
docker compose up -d pg
DATABASE_URL=postgres://signalstack:dev@localhost:5433/signalstack npm run db:migrate
DATABASE_URL=... npm run db:seed
DATABASE_URL=... npm run scrape:run -- --source freelance
DATABASE_URL=... npm run dev:web
```

## Production deploy (Coolify)

See [`RUNBOOK.md`](./RUNBOOK.md). 3 Coolify apps: postgres, worker, web.
Domain `signalstack.parallelship.com` via Traefik. Weekly Sunday cron.

## Stack

7 npm dependencies total. Vanilla SQL. No ORM.

| Layer | Choice |
|---|---|
| Runtime | Node 22 |
| Web | SvelteKit 2 + Svelte 5 runes + adapter-node |
| DB | Postgres 16 + raw SQL migrations |
| DB client | `postgres` (Porsager) |
| Scrape · HTTP | undici (built-in) |
| Scrape · JS pages | playwright-core |
| RSS | rss-parser |
| Email | nodemailer |
| Logs | pino |
| Cron | node-cron |
| Tests | node:test (built-in) |

## License

UNLICENSED — internal tool for parallelship.com.
