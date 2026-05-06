import { json } from '@sveltejs/kit';
import { getMeta } from '$lib/server/data.js';

export async function GET() {
  try {
    const meta = await getMeta();
    return json({ ok: true, backend: meta.backend, listings: meta.totalListings });
  } catch (err) {
    return json({ ok: false, error: String(err.message ?? err) }, { status: 503 });
  }
}
