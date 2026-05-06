<script>
  import Card from '$lib/components/Card.svelte';
  let { data } = $props();
  const { meta, listing } = $derived(data);

  function fmtBudget(l) {
    if (l.budget == null) return '—';
    const num = '€' + l.budget.toLocaleString('de-DE');
    if (l.budgetKind === 'day') return num + '/day';
    if (l.budgetKind === 'hour') return num + '/hour';
    if (l.budgetKind === 'project') return num + ' (project total)';
    return num;
  }

  // group hits by dict
  const grouped = $derived.by(() => {
    const m = {};
    for (const h of listing.hits) {
      const [d, t] = h.split(':');
      if (!m[d]) m[d] = [];
      m[d].push(t);
    }
    return m;
  });
</script>

<a href="/records" class="back">◀ back to records</a>

<Card num="●" title={listing.title} sub="single record · drillthrough leaf">
  <div class="meta-grid">
    <div><span class="lbl">Source</span><span class="val">
      <span class="src" style="background: {meta.sources[listing.src]?.color}">{meta.sources[listing.src]?.name}</span>
    </span></div>
    <div><span class="lbl">Posted</span><span class="val">{listing.postedAt} · {listing.week}</span></div>
    <div><span class="lbl">Language</span><span class="val">{listing.lang}</span></div>
    <div><span class="lbl">City</span><span class="val">{listing.city ?? '—'}{listing.bundesland ? ` (${listing.bundesland})` : ''}</span></div>
    <div><span class="lbl">Category</span><span class="val">{listing.cat ?? '—'}</span></div>
    <div><span class="lbl">CPV</span><span class="val">{listing.cpv ?? '—'}</span></div>
    <div><span class="lbl">Budget</span><span class="val">{fmtBudget(listing)}</span></div>
    <div><span class="lbl">Duration</span><span class="val">{listing.dur ?? '—'} d</span></div>
    <div><span class="lbl">Remote</span><span class="val">{listing.remote ? 'yes' : 'no'}</span></div>
  </div>

  <div class="open-source">
    <a class="btn" href={listing.sourceUrl} target="_blank" rel="noreferrer noopener">
      Open original source ↗
    </a>
    <span class="url mono">{listing.sourceUrl}</span>
  </div>
</Card>

<Card num="H" title="Term hits · {listing.hits.length} matches" sub="grouped by dictionary">
  <div class="hits-grid">
    {#each Object.entries(grouped) as [dict, terms]}
      <div class="dict">
        <div class="dict-name">{dict} · {meta.dicts[dict]?.name}</div>
        <div class="terms">
          {#each terms as t}
            <span class="term">{t}</span>
          {/each}
        </div>
      </div>
    {/each}
    {#if !Object.keys(grouped).length}
      <p class="empty">no term hits</p>
    {/if}
  </div>
</Card>

<style>
  .back { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); display: inline-block; margin-bottom: 14px; }
  .back:hover { color: var(--signal); }
  .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; margin-bottom: 16px; }
  @media (min-width: 800px) { .meta-grid { grid-template-columns: repeat(3, 1fr); } }
  .meta-grid > div { padding: 6px 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; }
  .meta-grid .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); }
  .meta-grid .val { font-size: 13px; color: var(--ink); text-align: right; }
  .src { font-family: 'IBM Plex Mono', monospace; font-size: 10px; padding: 1px 6px; color: var(--paper); text-transform: uppercase; }

  .open-source { display: flex; align-items: center; gap: 14px; margin-top: 14px; padding: 12px 14px; background: var(--paper-3); border-left: 3px solid var(--signal); flex-wrap: wrap; }
  .btn { font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 7px 14px; background: var(--signal); color: var(--paper); border: none; cursor: pointer; text-transform: uppercase; letter-spacing: .06em; text-decoration: none; }
  .btn:hover { background: var(--ink); color: var(--paper); }
  .url { font-size: 11px; color: var(--ink-2); word-break: break-all; }

  .hits-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
  .dict { padding: 10px 12px; background: var(--paper); border: 1px solid var(--line); }
  .dict-name { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--signal); margin-bottom: 8px; }
  .terms { display: flex; flex-wrap: wrap; gap: 6px; }
  .term { font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 3px 8px; background: var(--paper-3); border: 1px solid var(--line); color: var(--ink); }
  .empty { color: var(--ink-3); font-style: italic; padding: 16px 0; text-align: center; }
</style>
