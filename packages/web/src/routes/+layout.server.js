import { getMeta } from '$lib/server/data.js';

export async function load() {
  return { meta: await getMeta() };
}
