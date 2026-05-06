<script>
  let { label, value, sub, valueClass } = $props();
</script>
<div class="kpi">
  <div class="lbl">{label}</div>
  <div class="val tabular {valueClass ?? ''}">{@html value}</div>
  {#if sub}<div class="sub">{@html sub}</div>{/if}
</div>

<style>
  .kpi { padding: 16px 18px; background: var(--paper-2); border: 1px solid var(--line); }
  .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); margin-bottom: 6px; }
  .val { font-family: Georgia, serif; font-size: 30px; font-weight: 600; line-height: 1; letter-spacing: -.02em; }
  .val.signal { color: var(--signal); font-family: 'IBM Plex Mono', monospace; font-size: 24px; }
  .val.up { color: var(--moss); }
  .val.down { color: var(--signal); }
  .sub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); margin-top: 6px; }
</style>
