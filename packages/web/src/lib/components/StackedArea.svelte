<script>
  /**
   * Multi-series stacked area chart. Server-rendered SVG.
   * @typedef {object} Props
   * @property {Record<string, number[]>} series  source -> values
   * @property {Record<string, { name: string, color: string }>} meta source meta
   * @property {string[]} weekLabels             length === values length
   */
  let { series, meta, weekLabels, width = 1100, height = 240 } = $props();

  const PADL = 46, PADR = 12, PADT = 10, PADB = 28;

  const sourceIds = $derived(Object.keys(series));
  const wks = $derived(weekLabels.length);

  const stacked = $derived.by(() => {
    const out = [];
    for (let w = 0; w < wks; w++) {
      let cum = 0;
      const col = [];
      for (const s of sourceIds) { const v = series[s][w] ?? 0; col.push([cum, cum + v]); cum += v; }
      out.push(col);
    }
    return out;
  });
  const maxY = $derived(Math.max(1, ...stacked.map(c => c[c.length - 1][1])));
  function xS(i) { return PADL + (i / Math.max(1, wks - 1)) * (width - PADL - PADR); }
  function yS(v) { return height - PADB - (v / maxY) * (height - PADT - PADB); }
  const paths = $derived(sourceIds.map((sid, si) => {
    let top = '', bot = '';
    for (let w = 0; w < wks; w++) top += (w === 0 ? 'M' : 'L') + xS(w).toFixed(1) + ',' + yS(stacked[w][si][1]).toFixed(1) + ' ';
    for (let w = wks - 1; w >= 0; w--) bot += 'L' + xS(w).toFixed(1) + ',' + yS(stacked[w][si][0]).toFixed(1) + ' ';
    return { d: top + bot + 'Z', color: meta[sid]?.color ?? '#888' };
  }));
  const yTicks = $derived.by(() => {
    const out = [];
    for (let i = 0; i <= 4; i++) {
      const v = maxY * i / 4; const y = yS(v);
      out.push({ y, label: fmt(v) });
    }
    return out;
  });
  const xTicks = $derived.by(() => {
    const step = Math.max(4, Math.floor(wks / 8));
    const out = [];
    for (let i = 0; i < wks; i += step) out.push({ x: xS(i), label: weekLabels[i].slice(0, 7) });
    out.push({ x: xS(wks - 1), label: weekLabels[wks - 1].slice(0, 7) });
    return out;
  });
  function fmt(n) { if (n >= 1e6) return (n/1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n/1e3).toFixed(1) + 'k'; return Math.round(n).toString(); }
</script>

<svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" class="chart">
  {#each yTicks as t}
    <line x1={PADL} y1={t.y} x2={width - PADR} y2={t.y} stroke="var(--line)" stroke-width="0.5" stroke-dasharray="2 3" />
    <text x={PADL - 6} y={t.y + 3} text-anchor="end">{t.label}</text>
  {/each}
  {#each xTicks as t}
    <text x={t.x} y={height - PADB + 14} text-anchor="middle">{t.label}</text>
  {/each}
  {#each paths as p}
    <path d={p.d} fill={p.color} opacity="0.78" />
  {/each}
  <line x1={PADL} y1={height - PADB} x2={width - PADR} y2={height - PADB} stroke="var(--line-2)" stroke-width="1" />
  <line x1={PADL} y1={PADT} x2={PADL} y2={height - PADB} stroke="var(--line-2)" stroke-width="1" />
</svg>

<div class="legend">
  {#each sourceIds as sid}
    <span class="key">
      <span class="swatch" style="background: {meta[sid]?.color ?? '#888'}"></span>
      {meta[sid]?.name ?? sid} · {series[sid].reduce((a,b) => a + b, 0)}
    </span>
  {/each}
</div>

<style>
  .chart { display: block; width: 100%; height: auto; }
  .chart text { font-family: 'IBM Plex Mono', monospace; font-size: 10px; fill: var(--ink-3); }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); }
  .legend .key { display: flex; align-items: center; gap: 6px; }
  .legend .swatch { width: 11px; height: 11px; display: inline-block; }
</style>
