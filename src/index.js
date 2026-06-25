// Entrypoint: starts the Express server and the Telegram bot (polling or webhook mode).
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

  const bot = createBot();

  const { app, stopScheduler } = createServer(bot);
  const server = app.listen(config.port, () => {
    logger.info(`${config.appName} HTTP listening`, { port: config.port });
  });

  // Set up webhook if configured
  if (config.telegram.mode === 'webhook') {
    if (!config.telegram.webhookUrl) {
      logger.error('TELEGRAM_WEBHOOK_URL is required when TELEGRAM_MODE=webhook');
      process.exit(1);
    }

    try {
      // Set the webhook URL with Telegram
      await bot.api.setWebhook(config.telegram.webhookUrl, {
        secret_token: process.env.WEBHOOK_SECRET || undefined,
      });
      logger.info('webhook set', { url: config.telegram.webhookUrl });
    } catch (err) {
      logger.error('failed to set webhook', { error: err.message });
      process.exit(1);
    }
  }

  // Graceful shutdown.
  const stop = async (signal) => {
    logger.info(`received ${signal}, shutting down`);

    // Stop scheduler
    if (stopScheduler) {
      stopScheduler();
    }

    // Delete webhook if using webhook mode
    if (config.telegram.mode === 'webhook') {
      try {
        await bot.api.deleteWebhook();
        logger.info('webhook deleted');
      } catch (err) {
        logger.warn('failed to delete webhook', { error: err.message });
      }
    }

    await bot.stop();
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  // Start bot in polling mode (webhook mode doesn't need bot.start())
  if (config.telegram.mode === 'polling') {
    bot.start({
      onStart: (info) => logger.info('bot started (long polling)', { username: info.username }),
      drop_pending_updates: true,
    });
  } else {
    logger.info('bot running in webhook mode');
  }
}

main().catch((err) => {
  logger.error('fatal startup error', { error: err.message });
  process.exit(1);
});
