import { Bot } from 'grammy';
import { config, assertBotConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { userMiddleware } from './middlewares/user.js';
import { registerStart } from './handlers/start.js';
import { registerLanguage } from './handlers/language.js';
import { registerNearby } from './handlers/nearby.js';
import { registerBooking } from './handlers/booking.js';
import { registerBookingsList } from './handlers/bookingsList.js';
import { registerHost } from './handlers/host.js';
import { registerCheckin } from './handlers/checkin.js';

export function createBot() {
  assertBotConfig();
  const bot = new Bot(config.botToken);

  // Trace incoming updates (helps diagnose "nothing happens"). Logs the update
  // kind + a short payload preview, then passes control on.
  bot.use(async (ctx, next) => {
    const u = ctx.update;
    const kind = u.message
      ? u.message.location
        ? 'message:location'
        : u.message.text
          ? `message:text "${u.message.text.slice(0, 40)}"`
          : 'message:other'
      : u.callback_query
        ? `callback "${u.callback_query.data}"`
        : Object.keys(u).filter((k) => k !== 'update_id')[0] || 'unknown';
    logger.info('update', { from: ctx.from?.id, kind });
    await next();
  });

  // Every update: load/refresh the user and attach ctx.t + ctx.dbUser.
  bot.use(userMiddleware());

  // Order matters: specific commands/callbacks before generic hears().
  registerStart(bot);
  registerLanguage(bot);
  registerNearby(bot);
  registerBooking(bot);
  registerBookingsList(bot);
  registerHost(bot); // also handles help + cancel hears()
  registerCheckin(bot);

  // Global error boundary so one bad update can't crash the long-poller.
  bot.catch((err) => {
    logger.error('bot error', {
      update_id: err.ctx?.update?.update_id,
      error: err.error?.message || String(err.error),
    });
  });

  return bot;
}
