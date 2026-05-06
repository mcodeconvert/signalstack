import postgres from 'postgres';

let _sql = null;

export function db() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _sql = postgres(url, {
    max: Number(process.env.PG_POOL_MAX ?? 6),
    idle_timeout: 30,
    prepare: false,
    onnotice: () => {}
  });
  return _sql;
}

export async function shutdown() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}
