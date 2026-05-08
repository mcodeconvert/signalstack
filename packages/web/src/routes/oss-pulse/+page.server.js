import { db, HAS_DB } from '$lib/server/db.js';
import { getMeta } from '$lib/server/data.js';

/**
 * GitHub OSS-cluster velocity — repos count + 7-day stars delta per topic_cluster.
 * Powered by v_topic_cluster_velocity (defined in 0003 migration).
 *
 * Plus a per-cluster top-repo drilldown driven by the listings.topic_cluster column.
 */
export async function load({ url, setHeaders }) {
  setHeaders({ 'cache-control': 'private, max-age=60' });
  const meta = await getMeta();
  const cluster = (url.searchParams.get('c') ?? '').trim() || null;

  if (!HAS_DB) {
    return { meta, clusters: [], topRepos: [], cluster, dbBacked: false, viewMissing: false };
  }
  const sql = db();
  let clusterRows = [];
  let topRepos = [];
  try {
    clusterRows = await sql`
      SELECT topic_cluster, repos, total_stars, stars_delta_7d
      FROM v_topic_cluster_velocity
      ORDER BY total_stars DESC NULLS LAST
    `;
  } catch (err) {
    return { meta, clusters: [], topRepos: [], cluster, dbBacked: true, viewMissing: true };
  }

  // Drilldown: top repos within the selected cluster, sorted by stars desc.
  if (cluster) {
    try {
      topRepos = await sql`
        SELECT v.repo_full_name, v.stars, v.forks, v.last_commit, v.snapshot_at
        FROM (
          SELECT DISTINCT ON (repo_full_name)
            repo_full_name, stars, forks, last_commit, snapshot_at
          FROM github_stars_velocity
          WHERE topic_cluster = ${cluster}
          ORDER BY repo_full_name, snapshot_at DESC
        ) v
        ORDER BY v.stars DESC NULLS LAST
        LIMIT 50
      `;
    } catch { /* ignore */ }
  }

  return {
    meta,
    clusters: clusterRows,
    topRepos,
    cluster,
    dbBacked: true,
    viewMissing: false
  };
}
