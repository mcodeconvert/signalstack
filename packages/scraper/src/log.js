import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'signalstack-scraper' },
  timestamp: pino.stdTimeFunctions.isoTime
});

/** Make a child logger bound to a specific run_id + source. */
export function runLogger(runId, sourceId) {
  return log.child({ runId, sourceId });
}
