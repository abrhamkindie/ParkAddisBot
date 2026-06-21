import * as usersRepo from '../../db/repositories/users.js';
import { getTranslator } from '../../i18n/index.js';
import { logger } from '../../utils/logger.js';

// Loads (or creates) the DB user for the Telegram sender, attaches it to
// ctx.dbUser, and attaches a language-bound translator ctx.t.
// Blocks banned users early.
export function userMiddleware() {
  return async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return; // ignore channel posts / other bots

    try {
      const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
      const user = await usersRepo.upsertUser({
        telegramId: from.id,
        name,
        username: from.username,
      });

      ctx.dbUser = user;
      ctx.t = getTranslator(user.language_pref);

      if (user.is_banned) {
        await ctx.reply(ctx.t('common.banned'));
        return;
      }
    } catch (err) {
      logger.error('userMiddleware failed', { error: err.message });
      ctx.t = getTranslator('en');
      await ctx.reply(ctx.t('common.error_generic'));
      return;
    }

    return next();
  };
}
