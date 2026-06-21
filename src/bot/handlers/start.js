import { config } from '../../config/index.js';
import { languageKeyboard, mainMenuKeyboard } from '../keyboards.js';
import { handleCheckin } from './checkin.js';

// /start — if the user has no explicit language yet, ask; otherwise greet.
export function registerStart(bot) {
  bot.command('start', async (ctx) => {
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (payload.startsWith('checkin_')) {
      return handleCheckin(ctx, payload.slice('checkin_'.length));
    }
    const t = ctx.t;
    // First-time-ish: always offer language on /start, it's cheap and clear.
    await ctx.reply(t('start.choose_language', { app: config.appName }), {
      reply_markup: languageKeyboard(t),
    });
  });

  // Help command + menu button.
  bot.command('help', async (ctx) => {
    await ctx.reply(ctx.t('help.text', { app: config.appName }), {
      reply_markup: mainMenuKeyboard(ctx.t),
    });
  });
}

// Sends the persistent main menu (used after language pick).
export async function sendMainMenu(ctx) {
  const t = ctx.t;
  await ctx.reply(t('start.welcome_driver', { name: ctx.dbUser?.name || '' }), {
    reply_markup: mainMenuKeyboard(t),
  });
}
