import { json } from '@sveltejs/kit';
import { callWorker } from '$lib/server/worker.js';

export async function POST({ request }) {
  const tok = request.headers.get('x-trigger-token');
  const expected = process.env.TRIGGER_TOKEN;
  if (!expected || tok !== expected) return json({ error: 'unauthorized' }, { status: 401 });

  const r = await callWorker('/reset', {
    method: 'POST',
    headers: { 'x-trigger-token': expected },
    timeoutMs: 30_000
  });
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.ct ?? 'application/json' } });
}
