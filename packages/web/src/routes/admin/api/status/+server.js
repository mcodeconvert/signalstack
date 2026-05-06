/**
 * GET /admin/api/status — proxy worker /health (no token, since worker /health is public-readable).
 */
import { json } from '@sveltejs/kit';

export async function GET() {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) return json({ error: 'WORKER_URL not configured' }, { status: 500 });
  try {
    const r = await fetch(`${workerUrl}/health`, { headers: { accept: 'application/json' } });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return json({ error: 'worker unreachable: ' + String(err.message ?? err) }, { status: 502 });
  }
}
