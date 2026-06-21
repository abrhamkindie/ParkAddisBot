// Entrypoint: starts the Express server and the Telegram bot (long polling).
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { createServer } from './server.js';
import { createBot } from './bot/index.js';
import { close as closeDb, healthcheck } from './db/index.js';

async function main() {
  // Fail fast if the DB is unreachable.
  try {
    await healthcheck();
    logger.info('database connected');
  } catch (err) {
    logger.error('cannot connect to database — is it up? (npm run db:up)', {
      error: err.message,
    });
    process.exit(1);
  }

  const app = createServer();
  const server = app.listen(config.port, () => {
    logger.info(`${config.appName} HTTP listening`, { port: config.port });
  });

  const bot = createBot();

  // Graceful shutdown.
  const stop = async (signal) => {
    logger.info(`received ${signal}, shutting down`);
    await bot.stop();
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  // start() resolves only when the bot stops; run it without awaiting.
  bot.start({
    onStart: (info) => logger.info('bot started (long polling)', { username: info.username }),
    drop_pending_updates: true,
  });
}

main().catch((err) => {
  logger.error('fatal startup error', { error: err.message });
  process.exit(1);
});
