<script>
  /**
   * Multi-line series with anomaly markers.
   * @typedef {object} Props
   * @property {Array<{ term: string, arr: number[] }>} series
   * @property {string[]} weekLabels
   */
  let { series, weekLabels, width = 540, height = 220 } = $props();
  const PADL = 36, PADR = 10, PADT = 10, PADB = 22;
  const palette = ['#c4423b','#5a7355','#3d5a80','#9d6b53','#6b6b6b'];
  const wks = $derived(weekLabels.length);
  const maxY = $derived(Math.max(1, ...series.flatMap(s => s.arr)));

  function xS(i) { return PADL + (i / Math.max(1, wks - 1)) * (width - PADL - PADR); }
  function yS(v) { return height - PADB - (v / maxY) * (height - PADT - PADB); }

  function pathOf(arr) {
    let p = '';
    for (let w = 0; w < wks; w++) p += (w === 0 ? 'M' : 'L') + xS(w).toFixed(1) + ',' + yS(arr[w] ?? 0).toFixed(1) + ' ';
    return p;
  }
  function anomalies(arr) {
    if (arr.length < 8) return [];
    const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const z = mean ? (arr[i] - mean) / Math.sqrt(Math.max(1, mean)) : 0;
      if (z > 2.5) out.push(i);
    }
    return out;
  }
  function fmt(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'k'; return Math.round(n).toString(); }
</script>

<svg viewBox="0 0 {width} {height}" class="chart">
  {#each [0,1,2,3,4] as i}
    {@const v = maxY * i / 4}
    {@const y = yS(v)}
    <line x1={PADL} y1={y} x2={width-PADR} y2={y} stroke="var(--line)" stroke-width="0.5" stroke-dasharray="2 3" />
    <text x={PADL-5} y={y+3} text-anchor="end">{fmt(v)}</text>
  {/each}
  {#each series as s, i}
    <path d={pathOf(s.arr)} fill="none" stroke={palette[i]} stroke-width="1.6" />
    {#each anomalies(s.arr) as idx}
      <circle cx={xS(idx)} cy={yS(s.arr[idx])} r="3" fill="var(--signal)" stroke="var(--paper)" stroke-width="1" />
    {/each}
  {/each}
  {#each [0, Math.floor(wks/4), Math.floor(wks/2), Math.floor(3*wks/4), wks-1] as i}
    <text x={xS(i)} y={height-PADB+12} text-anchor="middle">{(weekLabels[i]||'').slice(0,7)}</text>
  {/each}
  <line x1={PADL} y1={height-PADB} x2={width-PADR} y2={height-PADB} stroke="var(--line-2)" />
  <line x1={PADL} y1={PADT} x2={PADL} y2={height-PADB} stroke="var(--line-2)" />
</svg>

<div class="legend">
  {#each series as s, i}
    <span class="key"><span class="swatch" style="background: {palette[i]}"></span>{s.term}</span>
  {/each}
</div>

<style>
  .chart { width: 100%; height: auto; display: block; }
  .chart text { font-family: 'IBM Plex Mono', monospace; font-size: 10px; fill: var(--ink-3); }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); }
  .legend .key { display: flex; align-items: center; gap: 6px; }
  .legend .swatch { width: 11px; height: 11px; display: inline-block; }
</style>
