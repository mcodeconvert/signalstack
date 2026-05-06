<script>
  let { num, title, sub, children } = $props();
</script>

<section class="card">
  <h2><span class="num">{num}</span>{title}</h2>
  {#if sub}<p class="sub">{@html sub}</p>{/if}
  {@render children()}
</section>

<style>
  .card { background: var(--paper-2); border: 1px solid var(--line); padding: 18px 20px; margin-bottom: 16px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 2px; display: flex; align-items: baseline; gap: 10px; }
  .num { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--signal); letter-spacing: .1em; }
  .sub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; }
</style>
