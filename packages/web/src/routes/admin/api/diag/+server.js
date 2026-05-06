/**
 * GET /admin/api/diag — reports what hostnames the web container can resolve
 * and connect to on the Coolify internal network. Helps debug worker DNS.
 */
import { json } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const CANDIDATES = [
  'signalstack-worker',
  'w2uedpve933szkz3qj7bse8p',
  'z52by0wdyvqyz2lxxr8l683y',  // pg, known to work
  'signalstack-pg',
  'pg',
  'localhost'
];

async function probe(host) {
  let dns = null, tcp = null;
  try { const r = await lookup(host); dns = r.address; }
  catch (err) { dns = `ERR ${err.code ?? err.message}`; }
  if (dns && !dns.startsWith('ERR')) {
    tcp = await new Promise(resolve => {
      const s = net.connect({ host, port: 3001, timeout: 2000 }, () => { s.destroy(); resolve('open'); });
      s.on('error', e => resolve(`ERR ${e.code ?? e.message}`));
      s.on('timeout', () => { s.destroy(); resolve('TIMEOUT'); });
    });
  }
  return { host, dns, tcp };
}

export async function GET() {
  const results = await Promise.all(CANDIDATES.map(probe));
  return json({ env_WORKER_URL: process.env.WORKER_URL ?? null, candidates: results });
}
