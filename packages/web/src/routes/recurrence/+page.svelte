<script>
  import { goto } from '$app/navigation';
  let { data } = $props();
  const { meta, rows, totalRows, page, totalPages, minCount, src, dbBacked, viewMissing } = $derived(data);

  function fmt(n) { return Number(n ?? 0).toLocaleString('de-DE'); }
  function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : '—'; }

  function setKnob(k, v) {
    const u = new URLSearchParams();
    const knobs = { min: minCount, src: src, page: 0, [k]: v };
    if (knobs.min !== 2) u.set('min', String(knobs.min));
    if (knobs.src) u.set('src', knobs.src);
    if (knobs.page > 0) u.set('page', String(knobs.page));
    goto('/recurrence' + (u.toString() ? '?' + u.toString() : ''));
  }
  function buildUrl(overrides) {
    const u = new URLSearchParams();
    const knobs = { min: minCount, src, page, ...overrides };
    if (knobs.min !== 2) u.set('min', String(knobs.min));
    if (knobs.src) u.set('src', knobs.src);
    if (knobs.page > 0) u.set('page', String(knobs.page));
    return '/recurrence' + (u.toString() ? '?' + u.toString() : '');
  }

  // Source pills
  const sources = $derived(Object.values(meta?.sources ?? {}));
</script>

<div class="hdr">
  <h1 class="display">Role-Recurrence Anomaly</h1>
  <p class="csub">
    Same canonical role × canonical employer reposted ≥ {minCount}× in the last 30 days.
    A reposting score of 5+ typically signals chronic shortage — the employer can't fill
    the role and is paying repeatedly to find a candidate.
  </p>
</div>

<div class="knobs">
  <label class="knob">
    <span>min reposts</span>
    <select onchange={(e) => setKnob('min', Number(e.currentTarget.value))}>
      {#each [2, 3, 5, 10, 17] as n}
        <option value={n} selected={n === minCount}>{n}</option>
      {/each}
    </select>
  </label>
  <label class="knob">
    <span>source</span>
    <select onchange={(e) => setKnob('src', e.currentTarget.value || null)}>
      <option value="">all sources</option>
      {#each sources as s}
        <option value={s.id} selected={s.id === src}>{s.name}</option>
      {/each}
    </select>
  </label>
  <span class="meta">
    {fmt(totalRows)} role-repost tuples · page {page + 1} / {totalPages}
  </span>
</div>

{#if !dbBacked}
  <div class="empty banner">
    Demo backend — role-repost detector requires a postgres backend with v_role_repost_30d.
  </div>
{:else if viewMissing}
  <div class="empty banner">
    v_role_repost_30d view not found — apply migration 0003_extraction_depth_columns.sql.
  </div>
{:else if !rows.length}
  <div class="empty">
    No role-reposts at min={minCount} {src ? `for source=${src}` : ''}.
    Either the corpus is too young (&lt; 30 days of W3 data) or no employer
    has reposted the same canonical role this often. Lower the threshold or wait.
  </div>
{:else}
  <section class="card">
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="num" style="width:50px">#</th>
            <th>Role</th>
            <th>Employer</th>
            <th>Source</th>
            <th class="num" style="width:90px">Reposts</th>
            <th class="num" style="width:90px">Span (d)</th>
            <th>First seen</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r, i}
            <tr>
              <td class="num idx">{page * 100 + i + 1}</td>
              <td><span class="mono role">{r.canonical_role}</span></td>
              <td><span class="mono emp">{r.canonical_employer}</span></td>
              <td><span class="mono src">{r.source_id}</span></td>
              <td class="num"><strong class="signal-mark">{fmt(r.repost_count)}×</strong></td>
              <td class="num">{fmt(r.span_days)}</td>
              <td class="mono date">{fmtDate(r.first_seen)}</td>
              <td class="mono date">{fmtDate(r.last_seen)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pager">
      <span>Page <strong>{page + 1}</strong> / {totalPages} · {fmt(totalRows)} total</span>
      <span>
        <a class="btn" href={buildUrl({ page: Math.max(0, page - 1) })} class:disabled={page === 0}>◀ prev</a>
        <a class="btn" href={buildUrl({ page: Math.min(totalPages - 1, page + 1) })} class:disabled={page >= totalPages - 1}>next ▶</a>
      </span>
    </div>
  </section>
{/if}

<style>
  .hdr { margin-bottom: 18px; }
  h1 { font-size: 28px; margin-bottom: 6px; }
  .csub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; max-width: 920px; }
  .knobs { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 14px; background: var(--paper-2); border: 1px solid var(--line); margin-bottom: 16px; align-items: center; }
  .knob { display: flex; align-items: center; gap: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; }
  .knob select { font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 4px 8px; border: 1px solid var(--line-2); background: var(--paper); color: var(--ink); }
  .knobs .meta { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; }

  .card { background: var(--paper-2); border: 1px solid var(--line); padding: 14px 18px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  td.idx { color: var(--ink-3); font-size: 11px; }
  .role { color: var(--ink); font-size: 12px; }
  .emp { color: var(--blue); font-size: 12px; }
  .src { color: var(--moss); font-size: 11px; }
  .date { color: var(--ink-3); font-size: 11px; }

  .empty { padding: 30px; text-align: center; font-style: italic; color: var(--ink-3); background: var(--paper-2); border: 1px dashed var(--line); }
  .empty.banner { color: var(--signal); font-style: normal; font-family: 'IBM Plex Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }

  .pager { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
  .pager .btn { font-size: 11px; padding: 3px 9px; background: var(--paper); border: 1px solid var(--line-2); color: var(--ink-2); text-decoration: none; }
  .pager .btn:hover { border-color: var(--ink); color: var(--ink); }
  .pager .btn.disabled { opacity: .4; pointer-events: none; }
</style>
