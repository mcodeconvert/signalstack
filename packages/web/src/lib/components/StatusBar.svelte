<script>
  let { filter, matched, total, watermark, totalSources = 4 } = $props();
  function fmt(n) { return n.toLocaleString('de-DE'); }
</script>

<div class="status">
  <span>
    <strong>{fmt(matched)}</strong> of <strong>{fmt(total)}</strong> listings match.
    Time = <strong>{filter.time}</strong>,
    src = <strong>{filter.sources.length}/{totalSources}</strong>,
    lang = <strong>{filter.lang}</strong>,
    dict = <strong>{filter.dict}</strong>,
    terms = <strong>{filter.terms.length || 'none'}</strong>{#if filter.terms.length > 1} (<strong>{filter.mode.toUpperCase()}</strong>){/if}{#if filter.search}, q = <strong>{filter.search}</strong>{/if}{#if filter.vertical}, vertical = <strong>{filter.vertical}</strong>{/if}.
  </span>
  <span class="right">last watermark · {watermark}</span>
</div>

<style>
  .status {
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3);
    padding: 4px 4px 14px; flex-wrap: wrap; gap: 8px;
  }
  .status strong { color: var(--ink); font-weight: 600; }
  .right { white-space: nowrap; }
</style>
