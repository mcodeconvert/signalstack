/**
 * Talk to the worker container over the Coolify internal docker network.
 * Try a list of candidate hostnames and remember the one that works.
 */
const CANDIDATES = (() => {
  const explicit = process.env.WORKER_URL;
  const list = explicit ? [explicit] : [];
  // Common Coolify naming patterns
  list.push('http://signalstack-worker:3001');
  list.push('http://w2uedpve933szkz3qj7bse8p:3001');
  return list;
})();

let _good = null;

export async function callWorker(path, opts = {}) {
  const tryOnce = async (base) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
    try {
      const r = await fetch(`${base}${path}`, {
        method: opts.method ?? 'GET',
        headers: opts.headers ?? {},
        signal: ctrl.signal
      });
      const body = await r.text();
      return { ok: true, status: r.status, body, ct: r.headers.get('content-type') };
    } finally {
      clearTimeout(timer);
    }
  };

  if (_good) {
    try { return await tryOnce(_good); } catch { _good = null; }
  }
  const errors = [];
  for (const base of CANDIDATES) {
    try {
      const result = await tryOnce(base);
      _good = base;
      return result;
    } catch (err) {
      errors.push(`${base} → ${String(err?.message ?? err)}`);
    }
  }
  return { ok: false, status: 502, body: JSON.stringify({ error: 'all worker candidates failed', tried: errors }), ct: 'application/json' };
}
