import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const log = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { service: 'signalstack-scraper' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {})
});

/** Make a child logger bound to a specific run_id + source. */
export function runLogger(runId, sourceId) {
  return log.child({ runId, sourceId });
}
