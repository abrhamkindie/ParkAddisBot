import { config } from '../../config/index.js';
import { languageKeyboard, mainMenuKeyboard, welcomeKeyboard } from '../keyboards.js';
import { handleCheckin } from './checkin.js';
import { beginBooking } from './booking.js';

// /start — if the user has no explicit language yet, ask; otherwise greet.
export function registerStart(bot) {
  bot.command('start', async (ctx) => {
    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (payload.startsWith('checkin_')) {
      return handleCheckin(ctx, payload.slice('checkin_'.length));
    }
    if (payload.startsWith('book_')) {
      const spotId = Number(payload.slice('book_'.length));
      if (Number.isFinite(spotId)) return beginBooking(ctx, spotId);
    }
    const t = ctx.t;
    // Only ask brand-new users to pick a language; returning users go straight to
    // a warm welcome so /start isn't a language quiz every time.
    if (ctx.dbUser?.is_new) {
      await ctx.reply(t('start.choose_language', { app: config.appName }), {
        reply_markup: languageKeyboard(t),
      });
      return;
    }
    await sendMainMenu(ctx, { returning: true });
  });

  // Help command + menu button.
  bot.command('help', async (ctx) => {
    await ctx.reply(ctx.t('help.text', { app: config.appName }), {
      reply_markup: mainMenuKeyboard(ctx.t),
    });
  });
}

// Sends the welcome + persistent main menu. For returning users we use a shorter
// "welcome back" line; both carry a one-tap "Find parking" inline CTA, then the
// persistent reply menu in a follow-up so both keyboards attach cleanly.
export async function sendMainMenu(ctx, { returning = false } = {}) {
  const t = ctx.t;
  const name = ctx.dbUser?.name ? ` ${ctx.dbUser.name}` : '';
  const text = returning
    ? t('start.welcome_back', { name })
    : t('start.welcome_driver', { name: ctx.dbUser?.name || '' });

  await ctx.reply(text, { reply_markup: welcomeKeyboard(t) });
  await ctx.reply(t('start.menu_ready'), { reply_markup: mainMenuKeyboard(t) });
}
