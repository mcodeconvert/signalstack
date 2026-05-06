<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Card from '$lib/components/Card.svelte';
  import Kpi from '$lib/components/Kpi.svelte';
  import BarList from '$lib/components/BarList.svelte';
  import TermLines from '$lib/components/TermLines.svelte';
  import { recordsUrl, encodeFilter } from '$lib/filters.js';

  let { data } = $props();
  const { filter, meta, totalListings, weekLabels, sparkRows, trendSeries, demandIndex, movers, cooc, cl, regSeries, regHits } = $derived(data);

  function fmt(n) { return n.toLocaleString('de-DE'); }
  function pct(n) { if (!isFinite(n)) return '∞'; return (n>=0?'+':'') + n.toFixed(1) + '%'; }

  // Add filter? hit param to all rows for click-to-filter
  const termRows = $derived(sparkRows.map((r, i) => ({
    key: r.term,
    label: r.term,
    value: r.n,
    sparkline: r.spark,
    drillUrl: '/pulse?' + encodeFilter({ ...filter, terms: filter.terms.includes(`${filter.dict}:${r.term}`) ? filter.terms.filter(x => x !== `${filter.dict}:${r.term}`) : [...filter.terms, `${filter.dict}:${r.term}`] }),
    active: filter.terms.includes(`${filter.dict}:${r.term}`)
  })));

  const demandPct = $derived((demandIndex * 100).toFixed(0));
  const demandClass = $derived(demandIndex >= 1 ? 'up' : 'down');
</script>

<FilterBar {filter} sources={meta.sources} dicts={meta.dicts} />
<StatusBar {filter} matched={totalListings} total={meta.totalListings} watermark={weekLabels[weekLabels.length - 1]} totalSources={Object.keys(meta.sources).length} />

<div class="kpis">
  <Kpi label="Demand index · last 4 wk vs window mean"
       value="{demandPct}%" valueClass={demandClass}
       sub={demandIndex >= 1 ? 'above baseline' : 'below baseline'} />
  <Kpi label="Reg. pressure (D5 mentions)"
       value={fmt(regHits)} sub="across all listings in window" />
  <Kpi label="Top mover · {filter.dict}"
       value={movers[0]?.term ?? '—'} valueClass="signal"
       sub={movers[0] ? `${pct(movers[0].delta)} (z=${movers[0].z.toFixed(1)})` : '—'} />
  <Kpi label="Recurring clusters"
       value={fmt(cl.length)} sub="near-duplicate templates" />
</div>

<div class="grid-2">
  <Card num="01" title="Top 20 terms · {meta.dicts[filter.dict].name}"
        sub="sparkline = trend over window · click row to filter">
    <BarList rows={termRows} showSpark={true} />
  </Card>

  <Card num="02" title="Term trend · top 5"
        sub="anomalies marked · z &gt; 2.5">
    <TermLines series={trendSeries} {weekLabels} />
  </Card>
</div>

<div class="grid-2">
  <Card num="03" title="Top movers · current half vs prev half"
        sub="largest |Δ%| · z-score (Poisson)">
    {#if movers.length}
      <table>
        <thead><tr><th>Term</th><th class="num">Now</th><th class="num">Prev</th><th class="num">Δ %</th><th class="num">z</th></tr></thead>
        <tbody>
          {#each movers as m}
            <tr>
              <td><a href={'/pulse?' + encodeFilter({...filter, terms: [...filter.terms, `${filter.dict}:${m.term}`]})}>{m.term}</a></td>
              <td class="num">{m.cur}</td>
              <td class="num">{m.prev}</td>
              <td class="num" class:up={m.delta>0} class:down={m.delta<0}>{pct(m.delta)}</td>
              <td class="num" class:high={m.z>2}>{isFinite(m.z) ? m.z.toFixed(1) : '∞'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}<p class="empty">no movers</p>{/if}
  </Card>

  <Card num="04" title="Co-occurrence · top 20 pairs"
        sub="Lift = P(A,B)/(P(A)·P(B)) · click to filter on both">
    {#if cooc.length}
      <table>
        <thead><tr><th>Term A</th><th>Term B</th><th class="num">Count</th><th class="num">Lift</th></tr></thead>
        <tbody>
          {#each cooc as p}
            {@const ta = p.a.split(':')[1]}
            {@const tb = p.b.split(':')[1]}
            <tr>
              <td><a href={recordsUrl(filter, { terms: [p.a, p.b], mode: 'all' })}>{ta}</a></td>
              <td>{tb}</td>
              <td class="num">{p.count}</td>
              <td class="num" class:high={p.lift>=4} class:mid={p.lift>=2&&p.lift<4}>{p.lift.toFixed(2)}×</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}<p class="empty">not enough data</p>{/if}
  </Card>
</div>

<Card num="05" title="Recurring clusters · near-duplicate listings" sub="indicates productizable workflows · click row for records">
  {#if cl.length}
    <table>
      <thead><tr><th>Exemplar</th><th>Sources</th><th class="num">Members</th><th class="num">Median gap</th></tr></thead>
      <tbody>
        {#each cl as c}
          <tr>
            <td><a href={recordsUrl(filter, { search: c.title })}>{c.title}</a></td>
            <td class="srcs">{c.sources.map(s => meta.sources[s]?.name.split(/[ .]/)[0]).join(', ')}</td>
            <td class="num">{c.members}</td>
            <td class="num">{c.medianGap}d</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}<p class="empty">no recurrence</p>{/if}
</Card>

<style>
  .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (min-width: 1000px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
  .grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
  @media (min-width: 1000px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  .num.up { color: var(--moss); }
  .num.down { color: var(--signal); }
  .num.high { color: var(--signal); font-weight: 600; }
  .num.mid { color: var(--ink); }
  .srcs { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); }
  .empty { color: var(--ink-3); font-style: italic; padding: 16px 0; text-align: center; }
</style>
