/**
 * Token-gated proxy: POST /admin/api/run
 * → calls worker /run over internal docker network.
 */
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
  const tok = request.headers.get('x-trigger-token');
  const expected = process.env.TRIGGER_TOKEN;
  if (!expected || tok !== expected) return json({ error: 'unauthorized' }, { status: 401 });
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) return json({ error: 'WORKER_URL not configured' }, { status: 500 });
  try {
    const r = await fetch(`${workerUrl}/run`, {
      method: 'POST', headers: { 'x-trigger-token': expected }
    });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
  } catch (err) {
    return json({ error: 'worker unreachable: ' + String(err.message ?? err) }, { status: 502 });
  }
}
