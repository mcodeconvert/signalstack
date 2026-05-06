<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Card from '$lib/components/Card.svelte';
  import { encodeFilter } from '$lib/filters.js';

  let { data } = $props();
  const { filter, meta, totalListings, page, pageSize, totalPages, rows } = $derived(data);

  function fmt(n) { return n.toLocaleString('de-DE'); }
  function fmtBudget(l) {
    if (l.budget == null) return '—';
    const num = '€' + l.budget.toLocaleString('de-DE');
    if (l.budgetKind === 'day') return num + '/d';
    if (l.budgetKind === 'hour') return num + '/h';
    return num;
  }

  function pageHref(p) {
    const u = new URLSearchParams();
    const enc = encodeFilter(filter);
    if (enc) for (const [k, v] of new URLSearchParams(enc)) u.set(k, v);
    if (p > 0) u.set('page', String(p));
    return '/records' + (u.toString() ? '?' + u.toString() : '');
  }

  function exportCsv() {
    const header = ['id','source','posted_at','lang','title','city','bundesland','budget','budget_kind','duration_days','remote','hits','source_url'];
    const csv = [header.join(',')];
    for (const r of rows) {
      csv.push([
        r.id, r.src, r.postedAt, r.lang,
        '"' + r.title.replace(/"/g, '""') + '"',
        r.city ?? '', r.bundesland ?? '',
        r.budget ?? '', r.budgetKind ?? '',
        r.dur ?? '', r.remote ? 1 : 0,
        '"' + r.hits.join('|') + '"',
        r.sourceUrl ?? ''
      ].join(','));
    }
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'signalstack-records.csv';
    a.click();
  }
</script>

<FilterBar {filter} sources={meta.sources} dicts={meta.dicts} />
<StatusBar {filter} matched={totalListings} total={meta.totalListings} watermark={'(records view)'} />

<Card num="L" title="Listing browser" sub="all filters apply · 25 per page · click row for full record + source URL">
  <div class="actions">
    <button class="btn" onclick={exportCsv}>Export visible CSV</button>
  </div>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Posted</th>
          <th>Title</th>
          <th>City</th>
          <th class="num">Budget</th>
          <th>Hits (top 5)</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as l}
          <tr>
            <td><span class="src" style="background: {meta.sources[l.src]?.color}">{meta.sources[l.src]?.name.split(/[ .]/)[0]}</span></td>
            <td class="mono">{l.postedAt}</td>
            <td><a class="title" href="/records/{l.id}">{l.title}</a></td>
            <td class="mono">{l.city ?? '—'}</td>
            <td class="num">{fmtBudget(l)}</td>
            <td class="hits">
              {#each l.hits.slice(0, 5) as h}
                <span class:active={h.startsWith(filter.dict + ':')}>{h}</span>
              {/each}
              {#if l.hits.length > 5}<span class="more">+{l.hits.length - 5}</span>{/if}
            </td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr><td colspan="6" class="empty">No matches.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
  <div class="pager">
    <span>Page <strong>{page + 1}</strong> / {totalPages} · {fmt(totalListings)} total</span>
    <span>
      <a class="btn" href={pageHref(Math.max(0, page - 1))} class:disabled={page === 0}>◀ prev</a>
      <a class="btn" href={pageHref(Math.min(totalPages - 1, page + 1))} class:disabled={page >= totalPages - 1}>next ▶</a>
    </span>
  </div>
</Card>

<style>
  .actions { margin-bottom: 12px; display: flex; justify-content: flex-end; }
  .btn { font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 5px 12px; background: var(--ink); color: var(--paper); border: none; cursor: pointer; text-transform: uppercase; letter-spacing: .06em; text-decoration: none; }
  .btn:hover { background: var(--signal); }
  .btn.disabled { opacity: .35; pointer-events: none; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  td.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); }
  .src { font-family: 'IBM Plex Mono', monospace; font-size: 9px; padding: 1px 5px; color: var(--paper); text-transform: uppercase; }
  .title { font-family: Georgia, serif; font-size: 13px; }
  .hits { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: var(--ink-3); display: flex; flex-wrap: wrap; gap: 6px; }
  .hits .active { color: var(--signal); font-weight: 600; }
  .hits .more { color: var(--ink-3); }
  .pager { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
  .pager strong { color: var(--ink); }
  .empty { color: var(--ink-3); font-style: italic; text-align: center; padding: 24px 0; }
</style>
