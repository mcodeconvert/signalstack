<script>
  import { goto } from '$app/navigation';
  let { data } = $props();
  const { meta, clusters, topRepos, cluster, dbBacked, viewMissing } = $derived(data);

  function fmt(n) { return Number(n ?? 0).toLocaleString('de-DE'); }
  function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : '—'; }
  function pickCluster(c) { goto(c ? `/oss-pulse?c=${encodeURIComponent(c)}` : '/oss-pulse'); }

  // Bar chart scale
  const maxStars = $derived(Math.max(1, ...(clusters?.map(c => Number(c.total_stars ?? 0)) ?? [1])));
</script>

<div class="hdr">
  <h1 class="display">OSS-Cluster Pulse</h1>
  <p class="csub">
    GitHub repos by SignalStack topic cluster. Cluster size + 7-day stars delta = the OSS
    commoditization-risk gauge: when an OSS cluster you compete against accelerates,
    your moat is shrinking. Click a cluster to see top repos.
  </p>
</div>

{#if !dbBacked}
  <div class="empty banner">Demo backend — OSS-cluster pulse requires postgres + github_stars_velocity table.</div>
{:else if viewMissing}
  <div class="empty banner">v_topic_cluster_velocity view not found — apply migration 0003.</div>
{:else if !clusters.length}
  <div class="empty">
    No cluster data yet — github_stars_velocity is populated by the weekly bucket
    (Sun 04:00 UTC). Re-check after the next run.
  </div>
{:else}
  <section class="card">
    <h2>Clusters · ranked by total stars</h2>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="num" style="width:50px">#</th>
            <th>Cluster</th>
            <th></th>
            <th class="num" style="width:90px">Repos</th>
            <th class="num" style="width:110px">Total stars</th>
            <th class="num" style="width:110px">Δ 7d</th>
          </tr>
        </thead>
        <tbody>
          {#each clusters as c, i}
            <tr class:selected={c.topic_cluster === cluster}>
              <td class="num idx">{i + 1}</td>
              <td>
                <button class="cl" onclick={() => pickCluster(c.topic_cluster === cluster ? null : c.topic_cluster)}>
                  {c.topic_cluster}
                </button>
              </td>
              <td><div class="bar"><div class="fill" class:signal={i < 3} style="width:{(Number(c.total_stars ?? 0)/maxStars*100).toFixed(1)}%"></div></div></td>
              <td class="num">{fmt(c.repos)}</td>
              <td class="num">{fmt(c.total_stars)}</td>
              <td class="num delta" class:up={Number(c.stars_delta_7d) > 0} class:down={Number(c.stars_delta_7d) < 0}>
                {Number(c.stars_delta_7d) > 0 ? '+' : ''}{fmt(c.stars_delta_7d)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  {#if cluster}
    <section class="card">
      <h2>Top repos · {cluster}</h2>
      <p class="csub">
        Latest snapshot from github_stars_velocity. Last commit reveals which are alive
        vs. abandoned — even high-star repos with stale commits aren't real competitors.
      </p>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th class="num" style="width:50px">#</th>
              <th>Repo</th>
              <th class="num" style="width:80px">Stars</th>
              <th class="num" style="width:80px">Forks</th>
              <th>Last commit</th>
              <th>Snapshot</th>
            </tr>
          </thead>
          <tbody>
            {#each topRepos as r, i}
              <tr>
                <td class="num idx">{i + 1}</td>
                <td><a class="mono repo" href="https://github.com/{r.repo_full_name}" target="_blank" rel="noopener">{r.repo_full_name}</a></td>
                <td class="num">{fmt(r.stars)}</td>
                <td class="num">{fmt(r.forks)}</td>
                <td class="mono date">{fmtDate(r.last_commit)}</td>
                <td class="mono date">{fmtDate(r.snapshot_at)}</td>
              </tr>
            {/each}
            {#if !topRepos.length}
              <tr><td colspan="6" class="empty">No repos in github_stars_velocity for this cluster yet.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
{/if}

<style>
  .hdr { margin-bottom: 18px; }
  h1 { font-size: 28px; margin-bottom: 6px; }
  .csub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; max-width: 920px; }
  .card { background: var(--paper-2); border: 1px solid var(--line); padding: 14px 18px; margin-bottom: 16px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }

  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  th { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 500; }
  td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
  td.idx { color: var(--ink-3); font-size: 11px; }

  .cl { background: none; border: none; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink); padding: 0; }
  .cl:hover { color: var(--signal); }
  tr.selected { background: var(--paper); }
  .bar { height: 12px; background: var(--paper); border: 1px solid var(--line); }
  .fill { height: 100%; background: var(--ink); }
  .fill.signal { background: var(--signal); }
  .delta.up { color: var(--moss); }
  .delta.down { color: var(--signal); }
  .repo { color: var(--blue); font-size: 12px; }
  .repo:hover { color: var(--signal); }
  .date { color: var(--ink-3); font-size: 11px; }

  .empty { padding: 30px; text-align: center; font-style: italic; color: var(--ink-3); background: var(--paper-2); border: 1px dashed var(--line); }
  .empty.banner { color: var(--signal); font-style: normal; font-family: 'IBM Plex Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
</style>
