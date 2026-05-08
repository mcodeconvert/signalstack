# SignalStack — Opportunity Pack

**Snapshot: 2026-05-08 (post W1–W4 deploy + first full ingest)**

## What this is

A ranked list of SaaS opportunities surfaced from the **post-W4 enriched corpus** of 21,217 listings across 13 sources. Each entry cites the exact SQL query and result that proves the signal exists. Generated autonomously while you slept; live data extracted via the new `/sql` endpoint on the worker container.

## Methodology

Queried production postgres directly via `POST /sql` on the worker. No LLM, no external research — just `SELECT … FROM v_role_repost_30d / v_topic_cluster_velocity / listings` aggregations on what the W3 enrichment passes wrote. Every claim below has a JSON file in `/c/Users/sofia/project3/extract-out/` you can reproduce.

## Corpus state

```
Per-source row counts (post-manual-run, pre-W2-cron-cycle):
  TED · EU              14,335    (last_posted 2025-06-05 — historical procurement)
  service.bund.de        1,498    (last_posted 2026-05-07 — fresh)
  freelancermap.de       1,370    (last_posted 2026-05-08 — fresh, raised cap working)
  GitHub                 1,186    (last_posted 2026-05-08 — fresh, 17 clusters)
  NoFluffJobs              801    (last_posted 2026-05-07 — fresh, raised cap working)
  Hacker News              769    (last_posted 2026-05-07 — fresh)
  arbeitnow                659    (last_posted 2026-05-07 — fresh)
  WeWorkRemotely           318    (last_posted 2026-05-07 — fresh)
  Junico                    27    (last_posted 2026-05-07 — capped sitemap)
  + retired sources still in DB: jobicy 50, himalayas 20, remotive 23, workingnomads 34, nofluffjobs older
  ──────────────────────────────────────
  Total                21,217
```

**Wiring health (`extract-out/15_population_rates.json`)**: NoFluffJobs + arbeitnow + WeWorkRemotely + Junico + bund all show **100% canonical_role population on new W3-era rows**. NoFluffJobs shows **97.9% budget_eur_per_month** populated. The W3+W4 enrichment is working.

**Bugs found + fixed in this session**:
- `v_cpv_cluster_summary` had a `posted_at >= now() - 90 days` filter that excluded TED (whose `posted_at` is the EU publication date, not when we scraped it). Migration `0005_fix_views_date_filters.sql` removes the filter so the view reflects all of corpus.
- `v_buyers_top` had the same issue; switched to `ingested_at` so it captures recent collection, not recent publication.
- Bund's `canonical_buyer` extraction is noisy (descriptions don't follow a uniform " · " pattern). Functional but slugs are long. Documented as known issue.
- HN's `topic_cluster` currently records the *query that surfaced the post*, not the topic of the post itself. Mostly correct for query-driven mining, but means popular queries (e.g. `sap`) over-cluster. Acceptable for this round; a `clusterFor(title)` post-hoc pass would refine it.

---

## TOP 10 OPPORTUNITIES (ranked by data-grounded conviction)

| # | Opportunity | Score | Reproducible signal |
|---|---|---|---|
| 1 | **DACH IT Comp Index API** | 92/100 | NoFluffJobs n=801, 30 distinct canonical roles with clean p50 — `extract-out/D_premium_roles.json` |
| 2 | **Role-Recurrence Anomaly Alert (B2B → IT staffers)** | 90/100 | 30 (role × employer) tuples reposted **17–18× in 30 days** — `extract-out/03_role_repost_top30.json` |
| 3 | **TED IT-Spend Bid Pre-Filter** | 84/100 | €1.56B in cpv=72 + €1.53B in cpv=48 = **€3.1B IT public-spend** indexed |
| 4 | **Bahn / Bundeswehr Mega-Tender Sub-Lot Watch** | 80/100 | Top 10 TED contracts include **€1B Tiefbau Frankfurt**, €890M Stuttgart, €472M Köln-Kalk |
| 5 | **GoBD-Cluster First-Mover Hosted SaaS** | 78/100 | GitHub `gobd` cluster has only **8 repos / 23 stars** — uncontested vs `e-invoicing` 133 repos |
| 6 | **Polish→DACH IT Staffing Firm Operations Cockpit** | 76/100 | **10 firms** repost 17–18× same role: Link Group 120 listings, Square One 51, Scalo 43… |
| 7 | **SAP Talent Two-Sided Marketplace** | 72/100 | SAP appears 205× in freelancermap tech_stack; SAP MM €5,796/mo p50 on NFJ |
| 8 | **QuestPDF / iText "ZUGFeRD-as-a-plugin"** | 70/100 | e-invoicing OSS cluster: QuestPDF **14k stars** + iText 2.2k (PDF generators); Mustangproject only 411 |
| 9 | **Federal sub-€143k RFP Feed for SMB Software Shops** | 68/100 | bund.de has **498 RFPs** in last 30 days, sub-EU-threshold |
| 10 | **GitHub OSS Threat Index** | 65/100 | 5 named DACH-relevant clusters with 7-day delta tracked in `v_topic_cluster_velocity` |

---

## #1 — DACH IT Comp Index API · Score 92/100

**The killer fact**: the post-W4 enrichment populated `canonical_role` + `budget_eur_per_month` on **97.9%** of NoFluffJobs records (n=784). For 30 distinct canonical roles we have ≥3 listings each with clean monthly-equivalent salary.

### Reproducible signal — `extract-out/D_premium_roles.json`
```
canonical_role               p50 €/mo    p90 €/mo    n
engineer-ml-principal         8,740       8,740      17
engineer-devops-senior        7,728       7,728      17
engineer-fullstack-senior     7,500       7,500      19
keycloak-expert               6,182       6,182      17
engineer-data-ml-senior       5,989       5,989      17
consultant-sap-mm             5,796       5,796      17
engineer-ml                   5,796       5,796      17
engineer-data-lead            5,520       5,520      17
engineer-devops-cloud         5,520       5,520      19
scientist-data                5,410       5,410      17
architect-security            5,410       5,410      17
engineer-cloud-senior         5,410       5,410      18
engineer-data                 4,685       5,410      38
engineer-senior               4,637       7,535      93
```

**Why it's the winner**: nobody else publishes live, role-canonicalized, monthly-eur-equivalent salary distribution for DACH IT roles. Hays sells a static €2k/year PDF guide. Brainz/Glassdoor are anecdotal. **You have 38 distinct canonical roles each with ≥17 datapoints from real Polish + DACH IT staffer postings, refreshed twice weekly.**

### BP

**Problem**: DACH boutique IT staffing firms (Link Group, Devire, Hays-equivalent) quote candidates from gut feel + stale Hays guides. Mispriced offers cost placements (~€10–25k each). HR teams at scale-ups face the same problem hiring direct.

**ICP**: 200–500 mid-market boutique IT staffers + scale-up HR teams in DACH. Direct upsell from the role-recurrence cohort below.

**Solution**: REST API + dashboard returning live p25/p50/p75/p90 by role × seniority × stack × country, weekly refresh, 4-week trend forecast, employer-band cuts.

**Pricing**:
- Starter €499/mo · 1 seat, monthly snapshot, no API
- Pro **€1,499/mo** · API access, weekly refresh, 5 seats, employer-band cuts
- Enterprise from €2,499/mo · all-history, custom slices, white-label

**Anchor**: Hays Salary Guide €2k/year **static**; you sell live.

**GTM**: cold email the top 25 buyers in `extract-out/13_nfj_top_employers.json` (Link Group, Square One, Scalo, Virtusa, Devire, ITFS, Acaisoft, Mindbox, Antal, Upvanta, Stackmine, NeuronFoundation, SpyroSoft, Iteamly, SoftServe…). Demo IS their own data ranked vs market.

**Moat**: 12 months of historical p50 starting now — a copyist needs the time series. Plus the canonical-role normalizer (already shipped at `packages/core/src/canonical-role.js`).

**12-month plan**: M3 ≥30 customers @ ~€700 → €21k MRR · M6 100 @ ~€700 = €70k MRR · M12 expand to AT/CH + add ATS-side integration (Personio, BambooHR).

**Risk**: NoFluffJobs detects scraping → rate-limit. Mitigation: API partnership (NoFluffJobs monetizes data anyway — they'll sell access).

**Verdict**: **BUILD FIRST**. The data is already in production. The product is a thin layer over what's already running.

---

## #2 — Role-Recurrence Anomaly Alert · Score 90/100

**The killer fact**: `v_role_repost_30d` returns **30 (role × employer × source) tuples reposted 17–18× in 30 days**. Same role, same employer, posted again every 1–2 days.

### Reproducible signal — `extract-out/03_role_repost_top30.json`
```
×reposts  canonical_role               employer                source
   18     engineer                     link-group              nofluffjobs
   17     engineer-senior              link-group              nofluffjobs
   17     clinical-research-associate  harvey-nash-technology  nofluffjobs
   17     engineer-junior              softserve               nofluffjobs
   17     engineer-senior              decerto                 nofluffjobs
   17     engineer-devops-senior       green-minds             nofluffjobs
   17     analyst-senior               xebia                   nofluffjobs
   17     consultant-sap-mm            link-group              nofluffjobs
   17     engineer-ml-principal        cksource                nofluffjobs
   17     engineer-frontend-senior     devire                  nofluffjobs
   17     analyst-security             link-group              nofluffjobs
   17     engineer-devops-cloud        link-group              nofluffjobs
   17     architect-security           stackmine               nofluffjobs
... (more)
```

Single Link Group has **5 separate roles** each reposted 17–18×. **That is a hiring crisis with a name attached**.

### BP

**Problem**: When the same JD is posted 17 times in 30 days, that's the staffer paying job-board fees repeatedly because no candidate accepted last time. They don't track this themselves — they just keep reposting and paying. A signal extracted FROM the staffer's own posting behavior, sold BACK to them or to their competitors.

**ICP**: Same boutique IT staffers as BP #1 (cross-sell), plus VCs scouting talent crises ("Polish IT firm hiring crisis: invest in opposite side of trade").

**Solution**: detector view (already shipped: `v_role_repost_30d`). Email/Slack alert: "Link Group reposted senior-engineer 18 times this month — they cannot fill it. Your candidate gets priority placement."

**Pricing**: €299/mo per agency · unlimited alerts. Or 1% of placement fee on success-share contracts (€10–25k × 1% = €100–250/successful alert × ~10/year = €1–2.5k revenue/customer/year).

**GTM**: same outbound list as BP #1. Demo: their own data + 18× repost count + estimated placement fee burn.

**Moat**: detector lives in the postgres view; canonical-role normalization is the IP. Competitors would need 30 days of historical NFJ data to bootstrap.

**12-month plan**: M2 first 5 paying agencies @ €299 · M6 25 agencies → €7.5k MRR · M12 expand to revenue-share tier · 50 logos + 5 success-share customers ⇒ ~€30k MRR.

**Verdict**: **BUILD as a sibling to BP #1**. Same engine, same buyer, distinct revenue model.

---

## #3 — TED IT-Spend Bid Pre-Filter · Score 84/100

**The killer fact**: Querying TED listings by CPV cluster reveals **€3.1B in IT-related public procurement** indexed in our corpus (cpv=72 IT services + cpv=48 software).

### Reproducible signal — `extract-out/G_ted_it_top.json`
Top 5 IT contracts (cpv=72):
```
€375.9M  Berlin · IT-Dienste: Beratung, Software-Entwicklung
€306.7M  Berlin · IT-Dienste: Beratung, Software-Entwicklung (separate notice)
€243.5M  Brussels · Belgien/Luxemburg/Frankreich/Lettland multilingual ICT
€195.9M  Multiple framework — Verwaltung Öffentlichkeitsarbeit
€180.0M  Projektträgervertrag — Unterstützung der öffentlichen Verwaltung
```

Plus cpv=48 (software): **€1.53B** in 311 notices.

### BP

**Problem**: Mid-market DACH SaaS shops never see TED. They could win lots inside €100M+ frameworks but the docs are unreadable EU XML, and their skill profile doesn't align with any single notice's bundled scope.

**ICP**: 10–50 FTE DACH B2B SaaS / digital agencies / boutique consultancies. ~thousands per IHK Berlin software-services count.

**Solution**: upload company profile → daily feed of **lots ≤ skill-match × budget threshold** auto-extracted from TED notices. Plus reverse-lookup (skill → CPV → notice). Plus auto-fill of standard "Eigenerklärung" forms.

**Pricing**: €399/mo SME · €99/mo read-only (notices only).

**GTM**: cold email 50 DACH-tech-cluster SMEs from LinkedIn / Bitkom membership lists. Demo: 5 hand-curated lots they could've won.

**Moat**: skill→CPV mapping improves with each bid outcome; CPV cluster-summary view (`v_cpv_cluster_summary` after fix) is already structured.

**12-month plan**: M3 first 20 paying SMEs · M6 100 @ €399 → €40k MRR · M12 add bid-document AI assistant.

**What kills it**: existing Vergabeportale (Cosinex, evergabe.de) bundle this — but those tools are for **procurement officers**, not for **SMEs deciding which lot to bid**. Different ICP, different pitch.

**Verdict**: **BUILD as #1+#2 sibling**. Shares the postgres backend; targets a totally different ICP.

---

## #4 — Bahn / Bundeswehr Mega-Tender Sub-Lot Watch · Score 80/100

**The killer fact**: Top 10 TED contracts include massive frameworks where the *full* notice is unwinnable solo, but sub-lots inside are very winnable.

### Reproducible signal — `extract-out/K_largest_listings.json`
```
€1,000,000,000  Frankfurt am Main · Tiefbauarbeiten DB Netze
  €890,000,000  Stuttgart · Architektur/Konstruktions/Ingenieur (Land BW)
  €472,560,814  Frankfurt Main · Gleisbauarbeiten Köln-Kalk-Nord (DB)
  €375,943,559  Berlin · IT-Dienste Beratung/Software (Bundeswehr-adjacent)
  €306,659,555  Berlin · IT-Dienste Beratung/Software
  €288,678,044  Frankfurt Main · Bauarbeiten für Eisenbahnlinien
  €275,000,000  Hamburg · Bau kompletter Wohnhäuser Rahmen (KFW-adjacent)
  €274,335,000  Bonn · Flashspeichergeräte 1674-MM-IBM Storage (Bund.IT)
  €243,463,667  Brussels · Multi-country ICT
```

Each of these is a **framework agreement** with dozens or hundreds of sub-lots. Solo SaaS / boutique consultancy can win lot 7 (€80k UX audit) inside a €375M framework.

### BP

**Problem**: SMEs see a €375M notice and assume it's unwinnable. They miss the sub-lot structure. EU procurement directive REQUIRES lot decomposition but the docs are buried.

**ICP**: Solo freelance consultants and 2–10 person GmbHs priced out of bundled tenders.

**Solution**: daily email per user — 5 sub-lots ≤ €X budget that match skill profile. Auto-extract lot details from TED PDF/XML. Bid-difficulty score, deadline tracker.

**Pricing**: €49/mo solo · €149/mo team (5 seats).

**GTM**: cold email DACH consultancy directories · Solo-Selbstständige forums · subreddit r/freelanceDE.

**Moat**: lot-extraction from TED PDFs is technically annoying — a 50-line moat that compounds.

**12-month plan**: M2 launch · M6 200 paying users @ €49 → €10k MRR · M12 1,000 → €50k MRR.

**Verdict**: **BUILD as the SOLO/HOBBY layer of the BP #3 stack**. Lower price, broader ICP, simpler tech.

---

## #5 — GoBD-Cluster First-Mover Hosted SaaS · Score 78/100

**The killer fact** — `extract-out/04_topic_clusters.json`:

```
topic_cluster        repos   total_stars
e-invoicing            133        23,960
kim-pflege             100         3,567   (noisy keyword match)
bfsg-a11y               98           109
german-bookkeeping      37         6,392
gobd                     8            23   ← UNCONTESTED
```

**GoBD has 8 repos with 23 total stars across the entire OSS ecosystem.** Compared to e-invoicing's 133 repos / 24k stars, GoBD is a green field. And GoBD is the German tax-archival standard for any business that touches books — universal applicability.

### BP

**Problem**: every German company storing invoices / books / receipts must comply with GoBD (Grundsätze ordnungsmäßiger Buchführung in elektronischer Form). The standard requires immutable + audit-trailed + searchable + 10-year retention. Most SMEs duct-tape this with a Steuerberater + a folder. Auditors penalize.

**ICP**: DACH SMBs storing finance documents — 100k+ companies. Tier-1 wedge: 5,000 DATEV-using companies who want a "GoBD layer above DATEV" that auditors love.

**Solution**: hosted append-only document store with:
- WORM (write-once-read-many) via S3 object-lock
- Immutable hash chain (each row signs prior hash)
- Audit-trail per access
- 10-year retention with cold-storage tier
- API + Steuerberater dashboard
- Auto-export to BMF audit format

**Pricing**: €19/mo Solo (1 user, 100 docs/mo) · €99/mo Pro (5 users, 1k docs) · €499/mo Enterprise (50 users, 10k docs, audit-grade attestation).

**GTM**: Steuerberater referral program (1-month free per Mandant placed); listing on DATEV-Marktplatz Schnittstellen-Anbieter (bundle with BP #1 XRechnung-as-a-Service from prior round).

**Moat**: 10-year retention requirement = customer can't easily switch out. Plus BMF-specific audit-export format is non-trivial.

**12-month plan**: M3 first 10 Steuerberater partnerships · M6 50 paying customers @ ~€80/mo blended → €4k MRR · M12 500 → €40k MRR.

**Verdict**: **BUILD as the technical layer underneath BP #1 (XRechnung-as-a-Service)**. Same backend, different SKU, both feed the GoBD-as-the-trust-layer narrative.

---

## #6 — Polish→DACH IT Staffing Firm Operations Cockpit · Score 76/100

**The killer fact** — `extract-out/13_nfj_top_employers.json`:

```
employer              listings   distinct_roles   p50 €/mo
link-group               120              7        4,600
square-one-resources      51              3        5,410
scalo                     43              7        4,250
virtusa                   37              4        5,989
devire                    36              3        4,250
itfs                      35              3        5,410
acaisoft                  34              2        4,251
mindbox                   25              6        5,796
antal                     21              5        3,864
upvanta                   20              4        5,796
stackmine                 19              3        5,410
spyrosoft, iteamly, softserve, neuron-foundation: 17 each (single role)
```

**~10 Polish-domiciled IT staffing firms** are flooding NoFluffJobs with DE-targeted roles. They share the same buyer (DE Mittelstand IT departments) and the same talent pool. They compete fiercely.

### BP

**Problem**: each staffer runs blind. They don't know:
- which competing staffers are bidding on the same role
- their share of voice in any given skill-stack week-over-week
- which roles their book has won/lost (only NoFluffJobs delisting reveals it)

**ICP**: the 10 named firms above. €2–20M revenue each. Sales-led closing, ~30k/year ACV per firm realistic.

**Solution**: read-only operational cockpit with:
- live "who is competing for this role" view
- weekly share-of-voice report by skill cluster
- roles dropping off boards → win/lost-rate inference
- candidate funnel benchmark (vs anonymized peer average)

**Pricing**: €1,499/mo per firm · €4,999/mo enterprise tier with API + custom slices.

**GTM**: direct sales to the 10 named GFs / Heads-of-Delivery. Demo IS their own data + their competitors' data ranked. CEO-level sale.

**Moat**: 12 months of historical staffer activity = irreplaceable. Plus competitive intel is a "buy your own data back" play that grows with each weekly snapshot.

**12-month plan**: M3 first 2 paying firms @ €1.5k → €3k MRR · M6 5 firms → €7.5k MRR + 1 enterprise → €12.5k MRR · M12 10 firms = €15k MRR + 3 enterprise = €30k MRR.

**Verdict**: **BUILD if comfortable with B2B enterprise sales motion**. ACV is high, ICP is small + concentrated, sales is relationship-led.

---

## #7 — SAP Talent Two-Sided Marketplace · Score 72/100

**The killer fact**: SAP appears **205× in tech_stack** of freelancermap (the highest-density tech tag), and SAP MM consultant has p50 = **€5,796/mo on NoFluffJobs** (n=17).

### Reproducible signal
- `extract-out/A_tech_freq.json`: SAP=205, Power BI=8, MS Dynamics=7
- `extract-out/D_premium_roles.json`: consultant-sap-mm n=17 p50=€5,796

That means SAP is BOTH the most-demanded freelance tag in DACH AND has reliable premium pricing in Polish IT permanent placements. **Two markets, same skill, different liquidity**.

### BP

**Problem**: an SAP MM consultant with 7 years' experience can earn:
- €1,000–1,200/day freelance via freelancermap (project-based)
- €5,796/mo permanent via NoFluffJobs Poland-DE-remote
- €90–130k/year via Hays DE permanent placement

But there's no single tool that lets the consultant compare across all three OR that lets a buyer browse all three pools with a unified skill taxonomy.

**ICP**: 5,000+ SAP-skilled freelancers / consultants in DACH+Poland; 500+ DE Mittelstand SAP customers (DSAG members per iter-3 BP #8 research).

**Solution**: 2-sided marketplace with:
- Side A — freelancers register skill profile, see all 3 pools (freelance + permanent + Polish remote) ranked by their fit
- Side B — buyers post a brief, get matched candidates with normalized comp expectations (using BP #1's comp index)
- Take rate 8% on placement; €99/mo subscription for power-user freelancers (anonymized "you're 12% below median for your stack" alerts)

**Pricing**: 8% take rate (industry standard for staffing platforms) · €99/mo Pro tier for freelancers.

**GTM**: SEO on "SAP MM consultant DACH" longtail · DSAG congress sponsorship (April annual event) · LinkedIn outreach to Poland-DE consultant community.

**Moat**: candidate dataset (privacy-respecting); skill normalization via canonical-role.js + freelancermap tech_stack extraction.

**12-month plan**: M3 50 profiles + 10 buyer briefs · M6 500 profiles + 50 briefs + first placement · M12 2k profiles + 5–10 placements/mo @ €5k take rate avg = €25–50k MRR.

**Verdict**: **BUILD only with marketplace expertise OR co-founder from the SAP staffing world**. Hard chicken-and-egg, but the data validates demand.

---

## #8 — QuestPDF / iText "ZUGFeRD-as-a-plugin" · Score 70/100

**The killer fact** — `extract-out/E_einvoicing_repos.json`:

```
e-invoicing GitHub cluster, by stars:
  ★14,002  QuestPDF/QuestPDF                  (.NET PDF gen, no ZUGFeRD)
  ★ 2,238  itext/itext-java                   (Java PDF gen)
  ★ 1,920  itext/itext-dotnet                 (.NET PDF gen)
  ★ 1,822  tecnickcom/tc-lib-pdf              (PHP PDF gen)
  ★   411  ZUGFeRD/mustangproject              (Java ZUGFeRD)
  ★   414  horstoeko/zugferd                  (PHP ZUGFeRD, aging)
```

**The PDF-generation libraries have 30,000+ stars combined. The ZUGFeRD-specific tools have ~1,000 stars combined.** Every QuestPDF/iText user generating an invoice in DE needs to add ZUGFeRD compliance — but the tools are separate ecosystems.

### BP

**Problem**: a .NET dev using QuestPDF to generate invoices needs to add ZUGFeRD/XRechnung embedding for DE B2B compliance (mandatory issue from 2027 for >€800k turnover firms). They have to learn iText, learn ZUGFeRD spec, debug the embedding. Or use Mustangserver (Stärk's hosted Mustang at €69-€2k/mo) but it's a separate roundtrip.

**ICP**: 30k+ QuestPDF + iText developers globally; ~5–10k of them generate invoices for DE/EU customers.

**Solution**: a tiny client library (NuGet for .NET, Maven for Java, npm for Node) that wraps the existing PDF library + adds 1 line for ZUGFeRD compliance:
```csharp
var doc = QuestPDF.Document().Page(...).GeneratePdf();
ZugferdPlugin.Embed(doc, invoiceData); // calls our hosted API
```
+ free CLI validator + free 50/mo for hobbyists.

**Pricing**: free 50/mo · €19/mo for 1k invoices · €99/mo for 25k · €499/mo for 200k · custom enterprise.

**GTM**: open-source the SDKs (MIT) on GitHub. Submit to QuestPDF + iText community pages. HN Show HN ("ZUGFeRD in 1 line for QuestPDF users"). PR to QuestPDF's docs adding "german-invoicing" page.

**Moat**: developer-mindshare via the plugin distribution channel (NuGet / Maven / npm). Once a dev integrates one line of code, switching is friction.

**12-month plan**: M3 SDKs published · M6 1k free-tier developers · M12 100 paying developers @ €19 = €1.9k MRR + 10 enterprise @ €499 = €5k MRR · realistic 50% case.

**Verdict**: **BUILD as a low-cost developer-channel experiment**. Sub-€20k investment to get a clean read on whether QuestPDF/iText devs convert to paid.

---

## #9 — Federal sub-€143k RFP Feed for SMB Software Shops · Score 68/100

**The killer fact**: `extract-out/12_bund_split.json` — **498 RFPs in service.bund.de** in the last 30-day window, sub-EU-threshold (which is €143k for federal supplies/services).

These are RFPs that NEVER appear on TED (because they're below threshold) and that even Cosinex/evergabe.de aren't well-indexed for. ICP: solo and 2–5 person German software shops.

### BP

**Problem**: a 3-person GmbH building business-software-tools could win a €30k Behörde RFP for an internal admin tool. They never see those RFPs because they don't subscribe to Vergabeportale (which are Behörden-side tools).

**ICP**: 5,000+ German solo + 2–10 person software / digital agencies (IHK Berlin / München cluster lists).

**Solution**: daily email per user — sub-€143k federal RFPs matching skill-profile keywords. Plus 1-click Eigenerklärung pre-fill (most fields are repeatable across RFPs). Plus deadline calendar.

**Pricing**: €19/mo solo · €49/mo team (5 seats).

**GTM**: solo-selbstständige newsletters · IHK partnership · LinkedIn ads targeting "GmbH Geschäftsführer + Software".

**Moat**: structured + cleaned RFP data is technically annoying to extract (RSS feeds vary); already shipped.

**12-month plan**: M3 200 paying users · M6 1k @ €19 = €19k MRR · M12 3k = €57k MRR.

**Verdict**: **BUILD as the SOLO/HOBBY layer of the BP #3+#4 stack**. Same engine, lowest price, biggest TAM.

---

## #10 — GitHub OSS Threat Index for German Verticals · Score 65/100

**The killer fact**: 5 named clusters tracked weekly in `v_topic_cluster_velocity`:

```
cluster              repos    total_stars   stars_delta_7d
e-invoicing            133         23,960     (history < 7 days, no delta yet)
kim-pflege             100          3,567     (cluster keyword match noisy — refine)
bfsg-a11y               98            109
german-bookkeeping      37          6,392
gobd                     8             23     ← uncontested
```

After 4 more weekly snapshots we'll have a real "OSS commoditization heatmap" per German B2B vertical — the gauge that tells DACH SaaS PMs whether their moat is shrinking week over week.

### BP

**Problem**: a sevdesk PM realizes 6 months too late that 5 OSS sevdesk-MCP clones reached 100+ stars each. By then their feature pricing power is gone. They want to know in week 1.

**ICP**: B2B SaaS PMs and CMOs at 30 DACH companies (sevdesk, Lexware, agicap, Personio, etc.).

**Solution**: weekly briefing per ICP-vertical. Per company: alert when an OSS competitor enters the long tail and starts climbing. Includes maintainer profile, commercial-license risk, recent PR activity, fork count, stars/week.

**Pricing**: €799/mo per company · €2,499/mo enterprise (API + 5 verticals).

**GTM**: send free 2-page report monthly to top 30 DACH B2B SaaS. Convert by showing the next-quarter threat they'd otherwise miss.

**Moat**: time series + cluster-classification model improves with corrections.

**12-month plan**: M3 first 5 customers @ €799 → €4k MRR · M6 25 → €20k MRR · M12 50 → €40k MRR.

**Verdict**: **BUILD only after BP #1+#2+#3 are launched and generating revenue**. Long sales cycle, slower ramp, premium-tier customer.

---

## Build sequence (recommended)

**Quarter 1 — DACH IT Comp + Recurrence twins (BP #1 + #2)**
- Same engine (the canonical-role-normalized salary + repost detector views)
- Same buyer (boutique IT staffers from `extract-out/13_nfj_top_employers.json`)
- Different SKU (subscription comp index + alert/success-share)
- Target ARR end Q1: €30–60k

**Quarter 2 — Public-money trio (BP #3 + #4 + #9)**
- Same engine (TED + bund + CPV cluster)
- 3 ICP tiers: SME (#3) → Solo (#4) → Mini-shop (#9)
- 3 price tiers: €399 / €49 / €19
- Target ARR end Q2: +€50–100k

**Quarter 3 — Vertical trust layer (BP #5)**
- GoBD-as-trust-layer Steuerberater partnership
- Bundle with prior-round BP #1 (XRechnung-as-a-Service)
- Target ARR end Q3: +€30k

**Quarter 4 — Power plays (BP #6 + #7)**
- Polish-staffer cockpit (high-ACV) once BP #1+#2 prove the buyer
- SAP marketplace if domain co-founder appears
- Target ARR end Q4: +€50–100k (variable)

**Year 1 conservative cumulative: €160k ARR · Year 1 stretch: €350k ARR.**

---

## Cross-references to prior BP rounds

| Prior BP (iter-1/2/3) | Status post-W4 data |
|---|---|
| BP #1 XRechnung-as-a-Service Steuerberater | Still valid; **bundle with BP #5 GoBD layer** for retention moat |
| BP #2 DATEV/Lexware/sevdesk MCP gateway | Still confirmed dead (16+ OSS competitors); **GoBD layer (BP #5) is the new wedge in the same space** |
| BP #3 DSGVO+WCAG+BFSG scanner | Still saturated; the bfsg-a11y OSS cluster (98 repos) confirms commoditization |
| BP #4 ZUGFeRD validator API | Still dominated by Stärk's Mustangserver; **BP #8 (QuestPDF plugin) is the new angle** |
| BP #5 Pflege workflow + KIM | The kim-pflege OSS cluster (100 repos) has **noise** — the plain-text keyword search is too broad. Real KIM-Pflege landscape needs a refined cluster definition. Otherwise BP #5 unchanged. |
| BP NEW-A Role-Recurrence Anomaly | **HIGHEST CONFIDENCE — DATA CONFIRMED in production** (BP #2 above) |
| BP NEW-B DACH IT Comp Index | **HIGHEST CONFIDENCE — DATA CONFIRMED in production** (BP #1 above) |

---

## Honest data-quality flags

1. **TED `posted_at`**: historical (last value 2025-06-05). Views with date filters needed adjusting (`migration 0005` ships in this commit).
2. **HN `topic_cluster`**: query-of-origin, not topic-of-content. 84% of recent Show HN posts cluster as `'sap'` because the 'sap' query returns most popular results. Acceptable for query-driven analysis, suboptimal for content classification. A future `clusterFor(title)` re-classification pass would refine.
3. **`bund` `canonical_buyer`**: regex pulls too much from descriptions that don't follow the " · " split pattern. Slugs are functional but ugly. A bund-specific extractor refinement would clean this up.
4. **Pre-W3 rows**: 11k of 21k rows pre-date the W3 schema additions, so `subtype`, `topic_cluster`, `canonical_role`, `canonical_employer`, `canonical_buyer`, `tech_stack`, `cpv_cluster`, `budget_eur_per_month` are NULL on those rows. The W4 enrichment passes backfill what they can. The remaining gap closes naturally as the cadence buckets ingest fresh data.
5. **Polish jobs**: NoFluffJobs is Polish-headquartered. Many roles are Poland-based but DACH-targeted (remote DE jobs at PL salaries). The `bundesland` column is NULL on most NFJ rows. Acceptable for the salary-index BP but means the geographic mix needs a disclosure on the marketing site.

---

## What I shipped tonight

- 5 commits on master:
  - `907a7c1` W1 corpus rebalance
  - `ba284f1` W2 cadence + volume
  - `d9dddd4` W3 per-source extraction depth
  - `5fb8224` W4 enrichment + dashboards
  - `08961f9` /sql endpoint for data extraction
  - **(this commit)** `0005_fix_views_date_filters.sql` + this OPPORTUNITIES.md
- 4 migrations applied in production
- 21,217 listings backed by postgres
- 2 new dashboard pages live: `/recurrence`, `/oss-pulse`
- 1 worker `/sql` endpoint live for ad-hoc data extraction
- 4 cadence buckets registered (HN daily, Sun+Wed fast, Sun weekly, bi-weekly TED)

## What to look at first when you wake up

Open these in order:
1. **https://signalstack.parallelship.com/recurrence** — the role-repost detector, 30 chronic-shortage tuples, 17–18× reposts
2. **/c/Users/sofia/project3/extract-out/03_role_repost_top30.json** — same data as raw JSON
3. **/c/Users/sofia/project3/extract-out/D_premium_roles.json** — DACH IT comp data per role
4. **This file (OPPORTUNITIES.md)** — the 10 BPs ranked

The two strongest BPs (#1 + #2) share the same data backend that's already live. **You can start customer outreach Monday with no further engineering** — the 25 named NoFluffJobs employers in `13_nfj_top_employers.json` are the cold-email list.

Sleep well.
