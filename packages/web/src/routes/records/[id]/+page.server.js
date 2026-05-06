import { error } from '@sveltejs/kit';
import { getListingById, getMeta } from '$lib/server/data.js';

export async function load({ params }) {
  const meta = await getMeta();
  const listing = await getListingById(params.id);
  if (!listing) throw error(404, 'listing not found');
  return { meta, listing };
}
