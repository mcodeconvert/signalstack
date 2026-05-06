<script>
  import Card from '$lib/components/Card.svelte';
  import Kpi from '$lib/components/Kpi.svelte';

  let { data } = $props();
  const { meta, bySrc } = $derived(data);

  function fmt(n) { return n.toLocaleString('de-DE'); }
  const total = $derived(Object.values(bySrc).reduce((a, b) => a + b.count, 0));
</script>

<div class="kpis">
  <Kpi label="Backend" value={meta.backend.toUpperCase()}
       sub={meta.backend === 'postgres' ? 'live DB' : 'demo JSON · DATABASE_URL not set'} />
  <Kpi label="Total listings" value={fmt(total)} sub="across all sources" />
  <Kpi label="Active sources" value={`${Object.keys(meta.sources).length} / 5`} sub="see table" />
  <Kpi label="Schema · dict version" value={`v${1} · v${1}`} sub="bump migrations on changes" />
</div>

<Card num="01" title="Source health overview" sub="counts per source · last posted_at · budget disclosure">
  <table>
    <thead>
      <tr>
        <th>Source</th>
        <th class="num">Listings</th>
        <th class="num">DE</th>
        <th class="num">EN</th>
        <th class="num">w/ Budget</th>
        <th>Last posted</th>
        <th>Archive</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {#each Object.entries(bySrc) as [sid, e]}
        {@const s = meta.sources[sid]}
        <tr>
          <td><span class="src" style="background: {s.color}">{s.name}</span></td>
          <td class="num">{fmt(e.count)}</td>
          <td class="num">{fmt(e.lang.DE)}</td>
          <td class="num">{fmt(e.lang.EN)}</td>
          <td class="num">{fmt(e.withBudget)} ({((e.withBudget/Math.max(1,e.count))*100).toFixed(0)}%)</td>
          <td class="mono">{e.last ?? '—'}</td>
          <td class="mono">{s.archiveMonths} mo</td>
          <td>{e.count ? '✓ active' : '— stale'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</Card>

<Card num="02" title="Operational notes" sub="what runs autonomously">
  <ul class="notes">
    <li><strong>Cron:</strong> worker container runs Sun 03:00 ingest, Sun 04:30 stats refresh.</li>
    <li><strong>Idempotent:</strong> re-running ingest is safe — content_hash dedups raw_blob, listing.id dedups listings.</li>
    <li><strong>Per-source isolation:</strong> one source failing does not block others; failure recorded in <code>source_health</code>.</li>
    <li><strong>Watermarks:</strong> resume from last <code>posted_at</code> on restart.</li>
    <li><strong>Quarantine:</strong> parse errors land in <code>quarantine</code>, retryable from this admin section in Phase 6.</li>
    <li><strong>Backups:</strong> weekly <code>pg_dump</code> to mounted volume, optional offsite S3-compatible.</li>
    <li><strong>Health endpoint:</strong> worker <code>/health</code> on <code>:3001</code>; web <code>/health</code> on <code>:3000</code>; Coolify probes both.</li>
    <li><strong>Source link preserved:</strong> every listing keeps its <code>source_url</code> for click-to-original drillthrough.</li>
    <li><strong>raw_blob retention:</strong> indefinite — enables dictionary-version replay over full history.</li>
  </ul>
</Card>

<Card num="03" title="Phase 4 — admin tools (in roadmap)" sub="quarantine, replay, dictionary editor, audit · scaffolded next">
  <ul class="notes">
    <li>Quarantine browser: failed parses with raw_blob preview + retry button.</li>
    <li>Replay: pick raw_blob → re-run current parser → diff vs stored.</li>
    <li>Dictionary editor: add/remove terms, triggers <code>term_hits</code> re-derive.</li>
    <li>Term audit: TP/FP labelling, per-term precision metric, sub-0.7 flagged.</li>
  </ul>
</Card>

<style>
  .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (min-width: 1000px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid var(--line); }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  td.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); }
  .src { font-family: 'IBM Plex Mono', monospace; font-size: 10px; padding: 2px 7px; color: var(--paper); text-transform: uppercase; }
  .notes { list-style: none; padding: 0; }
  .notes li { padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 13px; color: var(--ink-2); }
  .notes li:last-child { border-bottom: none; }
  .notes code { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: var(--paper); padding: 1px 5px; border: 1px solid var(--line); }
</style>
