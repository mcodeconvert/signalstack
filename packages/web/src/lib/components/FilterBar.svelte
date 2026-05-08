<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  let { filter, sources, dicts } = $props();

  function update(patch) {
    const next = { ...filter, ...patch };
    const u = new URLSearchParams();
    if (next.time && next.time !== '5y') u.set('t', next.time);
    // sources is meta.sources (Record<id, meta>), not an array — use Object.keys(...).length.
    // Without this fix, clicks on source pills produced no URL change.
    const totalSources = sources ? Object.keys(sources).length : 0;
    if (next.sources && totalSources && next.sources.length < totalSources) u.set('s', next.sources.join(','));
    if (next.lang && next.lang !== 'all') u.set('l', next.lang);
    if (next.dict && next.dict !== 'D1') u.set('d', next.dict);
    if (next.terms?.length) u.set('terms', next.terms.join(','));
    if (next.mode && next.mode !== 'any') u.set('m', next.mode);
    if (next.search) u.set('q', next.search);
    if (next.vertical) u.set('v', next.vertical);
    const qs = u.toString();
    goto(`${$page.url.pathname}${qs ? `?${qs}` : ''}`, { keepFocus: true, noScroll: true });
  }

  function toggleSource(id) {
    const has = filter.sources.includes(id);
    if (has && filter.sources.length === 1) return;
    update({ sources: has ? filter.sources.filter(x => x !== id) : [...filter.sources, id] });
  }
  function toggleTerm(hit) {
    const has = filter.terms.includes(hit);
    update({ terms: has ? filter.terms.filter(x => x !== hit) : [...filter.terms, hit] });
  }
  function clearTerms() { update({ terms: [], mode: 'any' }); }
  function reset() { goto($page.url.pathname); }

  const TIMES = [['30d','30 d'],['6mo','6 mo'],['1y','1 y'],['3y','3 y'],['5y','5 y · max']];
  const LANGS = [['all','All'],['DE','DE'],['EN','EN']];
  const MODES = [['any','ANY'],['all','ALL']];
</script>

<div class="bar">
  <div class="row">
    <div class="grp">
      <span class="lbl">Time</span>
      <div class="pills">
        {#each TIMES as [k, label]}
          <button class="pill" class:active={filter.time === k} class:signal={k==='5y'&&filter.time==='5y'}
            onclick={() => update({ time: k })}>{label}</button>
        {/each}
      </div>
    </div>
    <div class="grp">
      <span class="lbl">Sources</span>
      <div class="pills">
        {#each Object.values(sources) as s}
          <button class="pill" class:active={filter.sources.includes(s.id)}
            class:short={s.archiveMonths < 18}
            onclick={() => toggleSource(s.id)} title="archive {s.archiveMonths}mo">
            {s.name.split(/[ .]/)[0]}{#if s.archiveMonths < 18}<span class="dot">·</span>{/if}
          </button>
        {/each}
      </div>
    </div>
    <div class="grp">
      <span class="lbl">Active dictionary</span>
      <div class="pills">
        {#each Object.entries(dicts) as [k, d]}
          <button class="pill" class:active={filter.dict === k}
            onclick={() => update({ dict: k })}>{k} {d.name}</button>
        {/each}
      </div>
    </div>
    <div class="grp">
      <span class="lbl">Language</span>
      <div class="pills">
        {#each LANGS as [k, label]}
          <button class="pill" class:active={filter.lang === k} onclick={() => update({ lang: k })}>{label}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="row row2">
    <div class="grp grow">
      <span class="lbl">Hard term filter — click any term in panels to add</span>
      <div class="pills tags">
        {#if !filter.terms.length}
          <span class="empty">no terms — showing all listings</span>
        {:else}
          {#each filter.terms as hit}
            {@const [d, t] = hit.split(':')}
            <span class="tag" onclick={() => toggleTerm(hit)} role="button">
              <span class="d">{d}</span>{t}<span class="x">×</span>
            </span>
          {/each}
          <button class="pill clear" onclick={clearTerms}>clear all</button>
        {/if}
      </div>
    </div>
    <div class="grp">
      <span class="lbl">Match mode</span>
      <div class="pills">
        {#each MODES as [k, label]}
          <button class="pill" class:active={filter.mode === k} onclick={() => update({ mode: k })}>{label}</button>
        {/each}
      </div>
    </div>
    <div class="grp">
      <span class="lbl">Title search</span>
      <div class="pills">
        <input class="search" placeholder="regex / phrase…" value={filter.search ?? ''}
          oninput={(e) => update({ search: e.currentTarget.value })} />
        <button class="reset" onclick={reset}>Reset</button>
      </div>
    </div>
  </div>
</div>

<style>
  .bar { background: var(--paper-2); border: 1px solid var(--line-2); padding: 14px 18px; margin-bottom: 14px; }
  .row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 20px; }
  @media (min-width: 1100px) { .row { grid-template-columns: repeat(4, 1fr); } }
  .row2 { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line-2); grid-template-columns: 1fr; }
  @media (min-width: 1100px) { .row2 { grid-template-columns: 2fr 1fr 1fr; } }
  .grp { display: flex; flex-direction: column; gap: 6px; }
  .grp.grow { min-width: 0; }
  .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); }
  .pills { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .pill {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 4px 10px;
    background: var(--paper); border: 1px solid var(--line-2); cursor: pointer;
    color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em;
    transition: all .12s; position: relative;
  }
  .pill:hover { border-color: var(--ink); color: var(--ink); }
  .pill.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .pill.active.signal { background: var(--signal); border-color: var(--signal); }
  .pill .dot { color: var(--signal); margin-left: 4px; }
  .pill.short.active .dot { color: #fff; }
  .pill.clear { color: var(--signal); border-color: var(--signal); background: transparent; }

  .tags { gap: 5px; }
  .empty { font-style: italic; font-size: 11px; color: var(--ink-3); }
  .tag {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    padding: 4px 8px 4px 10px; background: var(--ink); color: var(--paper);
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  }
  .tag .d { opacity: .6; }
  .tag .x { color: var(--paper); opacity: .7; }
  .tag:hover .x { color: var(--signal); opacity: 1; }

  .search {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 5px 10px;
    border: 1px solid var(--line-2); background: var(--paper); color: var(--ink);
    flex: 1; min-width: 100px;
  }
  .search:focus { outline: none; border-color: var(--ink); }
  .reset {
    font-family: 'IBM Plex Mono', monospace; font-size: 10px; padding: 5px 10px;
    background: transparent; border: 1px solid var(--line-2); cursor: pointer; color: var(--ink-3);
    text-transform: uppercase;
  }
  .reset:hover { color: var(--signal); border-color: var(--signal); }
</style>
