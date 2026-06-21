// Tiny structured logger (no dependency). Good enough for now.
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[process.env.LOG_LEVEL] || levels.info;

function log(level, msg, meta) {
  if (levels[level] < threshold) return;
  const line = { t: new Date().toISOString(), level, msg };
  if (meta !== undefined) line.meta = meta;
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

export const logger = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
};
