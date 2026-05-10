<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Card from '$lib/components/Card.svelte';
  import Kpi from '$lib/components/Kpi.svelte';
  import { encodeFilter } from '$lib/filters.js';
  import { goto } from '$app/navigation';
  import { page as pageStore } from '$app/stores';

  let { data } = $props();
  const { filter, meta, totalListings, rows, totalWords, totalUnique, page, totalPages, titleOnly, keepFiller, minCount, search, probeResult } = $derived(data);

  function fmt(n) { return n.toLocaleString('de-DE'); }

  function buildUrl(overrides) {
    const u = new URLSearchParams();
    const enc = encodeFilter(filter);
    for (const [k, v] of new URLSearchParams(enc)) u.set(k, v);
    const knobs = { to: titleOnly?1:0, kf: keepFiller?1:0, mc: minCount, w: search, page, ...overrides };
    if (knobs.to) u.set('to','1');
    if (knobs.kf) u.set('kf','1');
    if (knobs.mc !== 3) u.set('mc', String(knobs.mc));
    if (knobs.w) u.set('w', knobs.w);
    if (knobs.page > 0) u.set('page', String(knobs.page));
    return '/words' + (u.toString() ? '?' + u.toString() : '');
  }

  function setKnob(k, v) { goto(buildUrl({ [k]: v, page: 0 })); }
  function onSearch(e) { goto(buildUrl({ w: e.currentTarget.value, page: 0 })); }

  // The single best citation: each row = [word, totalCount, listingsHit]
  const max = $derived(rows[0]?.[1] ?? 1);
  const recordsHrefFor = (word) => '/records?' + (() => {
    const u = new URLSearchParams();
    const enc = encodeFilter(filter);
    for (const [k, v] of new URLSearchParams(enc)) u.set(k, v);
    u.set('q', word);
    return u.toString();
  })();
</script>

<FilterBar {filter} sources={meta.sources} dicts={meta.dicts} />
<StatusBar {filter} matched={totalListings} total={meta.totalListings} watermark={'(words view)'} totalSources={Object.keys(meta.sources).length} />

{#if probeResult}
  {#if probeResult.ok}
    <section class="card probe">
      <h2><span class="badge">PROBE</span><code class="pat">{probeResult.pattern}</code></h2>
      <p class="csub">
        regex against title + description ·
        scanned {fmt(probeResult.scanned)}{probeResult.scanned !== probeResult.total ? ' / ' + fmt(probeResult.total) : ''} listings ·
        {probeResult.elapsedMs}&nbsp;ms{probeResult.truncated ? ' · TRUNCATED (time budget hit)' : ''}
      </p>

      <div class="grid">
        <div class="cell">
          <div class="lbl">title</div>
          <div class="big">{fmt(probeResult.title.citations)}</div>
          <div class="sub">citations · {fmt(probeResult.title.records)} records</div>
        </div>
        <div class="cell">
          <div class="lbl">description</div>
          <div class="big">{fmt(probeResult.description.citations)}</div>
          <div class="sub">citations · {fmt(probeResult.description.records)} records</div>
        </div>
        <div class="cell">
          <div class="lbl">either</div>
          <div class="big">{fmt(probeResult.either)}</div>
          <div class="sub">records (union)</div>
        </div>
        <div class="cell">
          <div class="lbl">both</div>
          <div class="big">{fmt(probeResult.both)}</div>
          <div class="sub">records (intersection)</div>
        </div>
      </div>

      {#if meta.backend === 'demo'}
        <p class="note">demo mode: descriptions are not in the demo dataset, so description counts will always be 0. Connect a database to see real numbers.</p>
      {/if}

      {#if probeResult.matches.length}
        <details class="samples">
          <summary>sample matches ({probeResult.matches.length})</summary>
          <ul>
            {#each probeResult.matches as m}
              <li>
                <a class="hit-title" href={'/records/' + m.id}>{m.title || '(no title)'}</a>
                <span class="hit-meta">title&nbsp;{m.tCount} · desc&nbsp;{m.dCount}</span>
                {#if m.snippet}<div class="snippet">…{m.snippet}…</div>{/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  {:else}
    <section class="card probe error">
      <h2><span class="badge err">PROBE ERROR</span></h2>
      <p>{probeResult.error}</p>
      <p class="csub">tip: the search box accepts a case-insensitive regex. examples: <code>\bsap\b</code>, <code>(abap|hana)</code>, <code>migration.*datev</code></p>
    </section>
  {/if}
{/if}

<div class="kpis">
  <Kpi label="Listings tokenised" value={fmt(totalListings)} sub="title + description per row" />
  <Kpi label="Unique words" value={fmt(totalUnique)} sub={`min ${minCount} citations`} />
  <Kpi label="Words shown" value={fmt(totalWords)} sub={search ? `match "${search}"` : 'all kept words'} />
  <Kpi label="Top word" value={rows[0]?.[0] ?? '—'} valueClass="signal" sub={rows[0] ? `${fmt(rows[0][1])} citations · ${fmt(rows[0][2])} records` : '—'} />
</div>

<section class="card">
  <h2>Word frequency · all words across {fmt(totalListings)} listings</h2>
  <p class="csub">Stopwords removed (DE + EN). Click word → see all records mentioning it. Min count, title-only and keep-filler are toggles.</p>

  <div class="knobs">
    <label class="knob">
      <span>min count</span>
      <select onchange={(e) => setKnob('mc', Number(e.currentTarget.value))}>
        {#each [1,2,3,5,10,25,50,100] as n}
          <option value={n} selected={n === minCount}>{n}</option>
        {/each}
      </select>
    </label>
    <label class="knob check">
      <input type="checkbox" checked={titleOnly} onchange={(e) => setKnob('to', e.currentTarget.checked ? 1 : 0)} />
      <span>title only · sharper signal</span>
    </label>
    <label class="knob check">
      <input type="checkbox" checked={keepFiller} onchange={(e) => setKnob('kf', e.currentTarget.checked ? 1 : 0)} />
      <span>keep filler · germany, gmbh, project, vergabe…</span>
    </label>
    <label class="knob grow">
      <span>search</span>
      <input class="search" type="text" placeholder="type to filter…" value={search ?? ''} oninput={onSearch} />
    </label>
  </div>

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th class="num" style="width:50px">#</th>
          <th>Word</th>
          <th></th>
          <th class="num" style="width:90px">Citations</th>
          <th class="num" style="width:90px">In records</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as [w, count, lhit], i}
          <tr>
            <td class="num idx">{page * 100 + i + 1}</td>
            <td><a class="word" href={recordsHrefFor(w)}>{w}</a></td>
            <td><div class="bar"><div class="fill" class:signal={i + page*100 < 3} style="width:{(count/max*100).toFixed(1)}%"></div></div></td>
            <td class="num">{fmt(count)}</td>
            <td class="num">{fmt(lhit)}</td>
          </tr>
        {/each}
        {#if !rows.length}
          <tr><td colspan="5" class="empty">No words match.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>

  <div class="pager">
    <span>Page <strong>{page + 1}</strong> / {totalPages} · {fmt(totalWords)} words total</span>
    <span>
      <a class="btn" href={buildUrl({ page: Math.max(0, page - 1) })} class:disabled={page === 0}>◀ prev</a>
      <a class="btn" href={buildUrl({ page: Math.min(totalPages - 1, page + 1) })} class:disabled={page >= totalPages - 1}>next ▶</a>
    </span>
  </div>
</section>

<style>
  .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (min-width: 1000px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
  .card { background: var(--paper-2); border: 1px solid var(--line); padding: 18px 22px; margin-bottom: 16px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .csub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; }

  .knobs { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 14px; background: var(--paper); border: 1px solid var(--line); margin-bottom: 14px; align-items: center; }
  .knob { display: flex; align-items: center; gap: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; }
  .knob.grow { flex: 1; min-width: 200px; }
  .knob select, .knob .search { font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 4px 8px; border: 1px solid var(--line-2); background: var(--paper); color: var(--ink); }
  .knob .search { width: 100%; }
  .knob.check input { margin: 0; }

  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  td.idx { color: var(--ink-3); font-size: 11px; }
  .word { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--ink); }
  .word:hover { color: var(--signal); }
  .bar { height: 12px; background: var(--paper); border: 1px solid var(--line); }
  .fill { height: 100%; background: var(--ink); }
  .fill.signal { background: var(--signal); }
  .empty { color: var(--ink-3); font-style: italic; text-align: center; padding: 24px 0; }
  .pager { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
  .pager .btn { font-size: 11px; padding: 3px 9px; background: var(--paper); border: 1px solid var(--line-2); color: var(--ink-2); text-decoration: none; }
  .pager .btn:hover { border-color: var(--ink); color: var(--ink); }
  .pager .btn.disabled { opacity: .4; pointer-events: none; }

  .probe { padding: 16px 20px; }
  .probe h2 { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .probe .badge { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: .12em; background: var(--signal); color: var(--paper); padding: 3px 8px; }
  .probe .badge.err { background: #c0392b; }
  .probe .pat { font-family: 'IBM Plex Mono', monospace; font-size: 14px; color: var(--ink); background: var(--paper); padding: 2px 8px; border: 1px solid var(--line-2); }
  .probe .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); margin-top: 12px; }
  @media (min-width: 800px) { .probe .grid { grid-template-columns: repeat(4, 1fr); } }
  .probe .cell { background: var(--paper); padding: 14px 16px; }
  .probe .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); margin-bottom: 6px; }
  .probe .big { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .probe .sub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); margin-top: 4px; }
  .probe .note { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); margin-top: 12px; padding: 8px 10px; background: var(--paper); border-left: 2px solid var(--ink-3); }
  .probe .samples { margin-top: 14px; font-size: 13px; }
  .probe .samples summary { cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); padding: 6px 0; }
  .probe .samples ul { list-style: none; padding: 0; margin: 8px 0 0; }
  .probe .samples li { padding: 8px 0; border-top: 1px solid var(--line); }
  .probe .hit-title { color: var(--ink); text-decoration: none; font-weight: 500; }
  .probe .hit-title:hover { color: var(--signal); }
  .probe .hit-meta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); margin-left: 10px; }
  .probe .snippet { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); margin-top: 4px; line-height: 1.5; white-space: pre-wrap; }
  .probe.error { border-color: #c0392b; }
  .probe code { font-family: 'IBM Plex Mono', monospace; background: var(--paper); padding: 1px 6px; border: 1px solid var(--line-2); text-transform: none; letter-spacing: 0; }
</style>
