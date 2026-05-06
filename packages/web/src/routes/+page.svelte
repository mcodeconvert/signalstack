<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Card from '$lib/components/Card.svelte';
  import Kpi from '$lib/components/Kpi.svelte';
  import StackedArea from '$lib/components/StackedArea.svelte';
  import BarList from '$lib/components/BarList.svelte';
  import { recordsUrl } from '$lib/filters.js';

  let { data } = $props();
  const { filter, meta, money, moneyByWeek, weekLabels, vol, totalListings } = $derived(data);

  function fmtEur(n) {
    if (n >= 1e9) return '€' + (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '€' + (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '€' + (n/1e3).toFixed(0) + 'k';
    return '€' + Math.round(n).toLocaleString('de-DE');
  }
  function fmt(n) { return n.toLocaleString('de-DE'); }

  // Money momentum chart series (single series, but reuse StackedArea by giving it one source)
  const moneySeries = $derived({ money: moneyByWeek });
  const moneyMeta = $derived({ money: { name: 'Project value (€)', color: '#5a7355' } });

  const cityRows = $derived(money.topCities.map(([city, v]) => ({
    key: city, label: city, value: Math.round(v), drillUrl: recordsUrl(filter, { /* city filter not implemented; goto records */ })
  })));
  const catRows = $derived(money.topCats.map(([cat, v]) => ({
    key: cat, label: cat, value: Math.round(v), drillUrl: recordsUrl(filter, {})
  })));
  const termRows = $derived(money.medianByTerm.map(([hit, v]) => ({
    key: hit, label: hit.split(':')[1], value: v,
    drillUrl: recordsUrl(filter, { terms: [hit], mode: 'any' })
  })));
</script>

<FilterBar {filter} sources={meta.sources} dicts={meta.dicts} />
<StatusBar {filter} matched={totalListings} total={meta.totalListings} watermark={weekLabels[weekLabels.length - 1]} />

<div class="kpis">
  <Kpi
    label="Total € flowing · {filter.time}"
    value={fmtEur(money.total)}
    sub="contract + day-rate proxy" />
  <Kpi
    label="Public RFP value (eVergabe)"
    value={fmtEur(money.totalContract)}
    sub={fmt(money.highValue.length) + ' high-value items > €100k'} />
  <Kpi
    label="Freelance day-rate value"
    value={fmtEur(money.totalDayRate)}
    sub="day_rate × duration_days proxy" />
  <Kpi
    label="Budget disclosure rate"
    value={(money.disclosureRate * 100).toFixed(0) + '%'}
    sub={fmt(money.n) + ' listings analyzed'} />
</div>

<Card num="01" title="Money momentum" sub="Project € value per week · {filter.time}">
  <StackedArea series={moneySeries} meta={moneyMeta} {weekLabels} height={200} />
</Card>

<div class="grid-2">
  <Card num="02" title="High-value RFPs (top 25)" sub="single records ≥ €100 k · click row for full detail">
    {#if money.highValue.length}
      <table>
        <thead><tr><th>Title</th><th>Source</th><th>Posted</th><th class="num">Value</th></tr></thead>
        <tbody>
          {#each money.highValue as l}
            <tr>
              <td><a href="/records/{l.id}">{l.title}</a></td>
              <td><span class="src" style="background: {meta.sources[l.src]?.color}">{meta.sources[l.src]?.name.split(/[ .]/)[0]}</span></td>
              <td>{l.postedAt}</td>
              <td class="num">{fmtEur(l.projectedValue)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="empty">no high-value records in current filter</p>
    {/if}
  </Card>

  <Card num="03" title="Volume per week, by source" sub="all listings — stacked area">
    <StackedArea series={vol} meta={meta.sources} {weekLabels} height={200} />
  </Card>
</div>

<div class="grid-2">
  <Card num="04" title="Top spending cities" sub="Σ project value · click for records">
    <BarList rows={cityRows} />
  </Card>
  <Card num="05" title="Top spending categories" sub="Σ project value · click for records">
    <BarList rows={catRows} />
  </Card>
</div>

<Card num="06" title="Money per term · median project value when term mentioned"
      sub="Reveals which keywords correlate with bigger budgets · only terms with ≥5 listings">
  <BarList rows={termRows} />
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
  .src { font-family: 'IBM Plex Mono', monospace; font-size: 9px; padding: 1px 5px; color: var(--paper); text-transform: uppercase; }
  .empty { color: var(--ink-3); font-style: italic; padding: 16px 0; text-align: center; }
</style>
