import { callWorker } from '$lib/server/worker.js';

export async function GET() {
  const r = await callWorker('/health');
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.ct ?? 'application/json' } });
}
