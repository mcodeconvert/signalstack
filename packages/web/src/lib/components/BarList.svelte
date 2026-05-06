<script>
  /**
   * @typedef {object} Props
   * @property {Array<{ key: string, label: string, value: number, sparkline?: number[], drillUrl?: string, active?: boolean }>} rows
   * @property {boolean} [showSpark]
   */
  let { rows, showSpark = false } = $props();
  const max = $derived(rows.length ? rows[0].value : 1);
  function fmt(n) { return n.toLocaleString('de-DE'); }

  function sparkPath(arr) {
    if (!arr?.length) return '';
    const sparkW = 80, sparkH = 14;
    const m = Math.max(1, ...arr);
    let p = '';
    for (let w = 0; w < arr.length; w++) {
      const x = (w / Math.max(1, arr.length - 1)) * sparkW;
      const y = sparkH - (arr[w] / m) * sparkH;
      p += (w === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    }
    return p;
  }
</script>

<div class="list">
  {#each rows as r, i}
    <a class="row" class:active={r.active} class:top={i < 3} href={r.drillUrl ?? null}>
      <span class="lbl" title={r.label}>{r.label}</span>
      {#if showSpark}
        <svg class="spark" width="80" height="14">
          <path d={sparkPath(r.sparkline)} fill="none" stroke={i < 3 ? 'var(--signal)' : 'var(--ink)'} stroke-width="1.2" />
        </svg>
      {/if}
      <span class="track"><span class="fill" class:signal={i < 3} style="width: {(r.value / max * 100).toFixed(1)}%"></span></span>
      <span class="val">{fmt(r.value)}</span>
    </a>
  {/each}
  {#if !rows.length}
    <p class="empty">no data</p>
  {/if}
</div>

<style>
  .list { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: grid; grid-template-columns: 140px 80px 1fr 60px; align-items: center; gap: 8px;
    font-size: 13px; padding: 2px 6px; cursor: pointer; color: inherit; text-decoration: none;
  }
  .row:not(:has(svg)) { grid-template-columns: 140px 1fr 60px; }
  .row:hover { background: var(--paper-3); }
  .row.active { background: var(--paper-3); box-shadow: inset 3px 0 0 var(--signal); }
  .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-2); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track { height: 14px; background: var(--paper); border: 1px solid var(--line); }
  .fill { display: block; height: 100%; background: var(--ink); transition: width .25s; }
  .fill.signal { background: var(--signal); }
  .val { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; }
  .empty { color: var(--ink-3); font-style: italic; padding: 16px 0; }
</style>
