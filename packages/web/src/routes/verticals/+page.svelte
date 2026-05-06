<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Card from '$lib/components/Card.svelte';
  import Kpi from '$lib/components/Kpi.svelte';
  import StackedArea from '$lib/components/StackedArea.svelte';
  import BarList from '$lib/components/BarList.svelte';
  import { goto } from '$app/navigation';
  import { recordsUrl, encodeFilter } from '$lib/filters.js';

  let { data } = $props();
  const { filter, meta, totalListings, weekLabels, vol, tools, verbs, reg, cities, cl, money, verticals } = $derived(data);

  function fmt(n) { return n.toLocaleString('de-DE'); }
  function fmtEur(n) {
    if (n >= 1e9) return '€' + (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '€' + (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '€' + (n/1e3).toFixed(0) + 'k';
    return '€' + Math.round(n).toLocaleString('de-DE');
  }

  function selectVertical(t) {
    if (filter.vertical === t) goto('/verticals');
    else goto('/verticals?' + encodeFilter({ ...filter, vertical: t }));
  }

  const toolRows = $derived(tools.map(([t, n], i) => ({
    key: t, label: t, value: n,
    drillUrl: recordsUrl(filter, { terms: [`D1:${t}`] })
  })));
  const verbRows = $derived(verbs.map(([t, n]) => ({ key: t, label: t, value: n,
    drillUrl: recordsUrl(filter, { terms: [`D2:${t}`] }) })));
  const regRows = $derived(reg.map(([t, n]) => ({ key: t, label: t, value: n,
    drillUrl: recordsUrl(filter, { terms: [`D5:${t}`] }) })));
  const cityRows = $derived(cities.map(([c, n]) => ({ key: c, label: c, value: n,
    drillUrl: recordsUrl(filter, {}) })));
</script>

<FilterBar {filter} sources={meta.sources} dicts={meta.dicts} />

<div class="vert-bar">
  <span class="lbl">Pick a vertical (D6 industry term):</span>
  <div class="pills">
    <button class="pill" class:active={!filter.vertical} onclick={() => goto('/verticals')}>All</button>
    {#each verticals as t}
      <button class="pill" class:active={filter.vertical === t} onclick={() => selectVertical(t)}>{t}</button>
    {/each}
  </div>
</div>

<StatusBar {filter} matched={totalListings} total={meta.totalListings} watermark={weekLabels[weekLabels.length - 1]} />

<div class="kpis">
  <Kpi label={filter.vertical ? `${filter.vertical} · listings` : 'All listings'}
       value={fmt(totalListings)} sub="in window" />
  <Kpi label="Total € value (proxy)" value={fmtEur(money.total)} sub={`${money.n} listings`} />
  <Kpi label="Top tool" value={tools[0]?.[0] ?? '—'} valueClass="signal"
       sub={tools[0] ? `${tools[0][1]} mentions` : '—'} />
  <Kpi label="Top regulation"
       value={reg[0]?.[0] ?? '—'} valueClass="signal"
       sub={reg[0] ? `${reg[0][1]} mentions` : '—'} />
</div>

<Card num="01" title="Volume per week, by source" sub="filtered to active vertical">
  <StackedArea series={vol} meta={meta.sources} {weekLabels} height={200} />
</Card>

<div class="grid-3">
  <Card num="02" title="Top tools (D1)" sub="click → records">
    <BarList rows={toolRows} />
  </Card>
  <Card num="03" title="Top verbs (D2)" sub="workflows in demand">
    <BarList rows={verbRows} />
  </Card>
  <Card num="04" title="Top regulation (D5)" sub="why-now signals">
    <BarList rows={regRows} />
  </Card>
</div>

<div class="grid-2">
  <Card num="05" title="Top cities" sub="geographic concentration">
    <BarList rows={cityRows} />
  </Card>
  <Card num="06" title="Recurring clusters in this vertical" sub="productizable workflow candidates">
    {#if cl.length}
      <table>
        <thead><tr><th>Exemplar</th><th class="num">Members</th></tr></thead>
        <tbody>
          {#each cl as c}
            <tr>
              <td><a href={recordsUrl(filter, { search: c.title })}>{c.title}</a></td>
              <td class="num">{c.members}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}<p class="empty">no clusters</p>{/if}
  </Card>
</div>

<style>
  .vert-bar { background: var(--paper-2); border: 1px solid var(--line-2); padding: 12px 18px; margin-bottom: 14px; }
  .vert-bar .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); display: block; margin-bottom: 6px; }
  .pills { display: flex; flex-wrap: wrap; gap: 5px; }
  .pill { font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 4px 10px; background: var(--paper); border: 1px solid var(--line-2); cursor: pointer; color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; transition: all .12s; }
  .pill:hover { border-color: var(--ink); color: var(--ink); }
  .pill.active { background: var(--signal); color: var(--paper); border-color: var(--signal); }

  .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (min-width: 1000px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
  .grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
  @media (min-width: 1000px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
  .grid-3 { display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
  @media (min-width: 1100px) { .grid-3 { grid-template-columns: repeat(3, 1fr); } }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  .empty { color: var(--ink-3); font-style: italic; padding: 16px 0; text-align: center; }
</style>
