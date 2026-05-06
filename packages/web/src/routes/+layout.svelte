<script>
  import { page } from '$app/stores';
  let { children, data } = $props();
  let path = $derived($page.url.pathname);
  function isActive(p) { return path === p || (p !== '/' && path.startsWith(p)); }
</script>

<svelte:head>
  <title>SignalStack — DACH market signal observatory</title>
</svelte:head>

<div class="shell">
  <header>
    <div class="brand">
      <span class="mark">▲</span>
      <div>
        <div class="name">SignalStack</div>
        <div class="tag">Where the money flows · what the market says</div>
      </div>
    </div>
    <nav>
      <a href="/" class:active={isActive('/') && path === '/'}>Money</a>
      <a href="/pulse" class:active={isActive('/pulse')}>Pulse</a>
      <a href="/words" class:active={isActive('/words')}>Words</a>
      <a href="/verticals" class:active={isActive('/verticals')}>Verticals</a>
      <a href="/records" class:active={isActive('/records')}>Records</a>
      <a href="/admin/sources" class:active={isActive('/admin')}>Admin</a>
    </nav>
    <div class="meta">
      backend · <strong>{data.meta.backend}</strong>
      &nbsp; · &nbsp;
      {data.meta.totalListings.toLocaleString('de-DE')} listings
    </div>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    SignalStack · 5 yrs · 5 sources · self-running weekly · {data.meta.backend} backend
  </footer>
</div>

<style>
  :global(:root) {
    --paper: #f5f1e8;
    --paper-2: #ebe5d3;
    --paper-3: #e1d8bf;
    --ink: #1a1a1a;
    --ink-2: #4a4a4a;
    --ink-3: #8a8a8a;
    --line: #d4cdb5;
    --line-2: #b5ad95;
    --signal: #c4423b;
    --moss: #5a7355;
    --blue: #3d5a80;
    --clay: #9d6b53;
    --grey: #6b6b6b;
    --warm: #e3a23c;
  }
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html), :global(body) {
    background: var(--paper);
    color: var(--ink);
    font-family: Georgia, 'Times New Roman', serif;
    line-height: 1.5;
    font-size: 15px;
  }
  :global(.mono) { font-family: 'IBM Plex Mono', Consolas, monospace; }
  :global(.display) { font-family: Georgia, 'Cormorant Garamond', serif; font-weight: 600; letter-spacing: -.01em; }
  :global(.tabular) { font-variant-numeric: tabular-nums; }
  :global(.signal-mark) { color: var(--signal); }
  :global(.moss-mark) { color: var(--moss); }
  :global(a) { color: var(--ink); text-decoration: none; }
  :global(a:hover) { color: var(--signal); }

  .shell { max-width: 1500px; margin: 0 auto; padding: 24px 32px 60px; }
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 24px;
    align-items: center;
    padding-bottom: 18px;
    border-bottom: 2px solid var(--ink);
    margin-bottom: 22px;
  }
  .brand { display: flex; gap: 12px; align-items: center; }
  .brand .mark { color: var(--signal); font-size: 26px; line-height: 1; }
  .brand .name {
    font-family: Georgia, 'Cormorant Garamond', serif;
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -.02em;
  }
  .brand .tag {
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--ink-3);
  }
  nav {
    display: flex;
    gap: 22px;
    justify-content: center;
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  nav a { color: var(--ink-2); padding: 4px 0; border-bottom: 2px solid transparent; }
  nav a.active { color: var(--ink); border-bottom-color: var(--signal); }
  .meta {
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-size: 10px;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: .08em;
    text-align: right;
  }
  footer {
    margin-top: 40px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    font-family: 'IBM Plex Mono', Consolas, monospace;
    font-size: 11px;
    color: var(--ink-3);
    text-align: center;
  }
</style>
