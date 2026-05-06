import postgres from 'postgres';

let _sql = null;

export const HAS_DB = !!process.env.DATABASE_URL;

export function db() {
  if (_sql) return _sql;
  if (!HAS_DB) throw new Error('DATABASE_URL not set');
  _sql = postgres(process.env.DATABASE_URL, {
    max: Number(process.env.PG_POOL_MAX ?? 4),
    idle_timeout: 30,
    prepare: false,
    onnotice: () => {}
  });
  return _sql;
}
