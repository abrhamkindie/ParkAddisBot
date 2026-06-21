import { allTranslations } from '../../i18n/index.js';

// Placeholder for host onboarding (built in step 3). Wires the menu button so
// the UI is complete; replaced with the real flow next.
export function registerHost(bot) {
  bot.hears(allTranslations('menu.become_host'), async (ctx) => {
    await ctx.reply(ctx.t('host.coming_soon'));
  });

  // Help button.
  bot.hears(allTranslations('menu.help'), async (ctx) => {
    const { config } = await import('../../config/index.js');
    await ctx.reply(ctx.t('help.text', { app: config.appName }));
  });

  // Cancel from the share-location reply keyboard.
  bot.hears(allTranslations('common.cancel'), async (ctx) => {
    const { mainMenuKeyboard } = await import('../keyboards.js');
    await ctx.reply(ctx.t('booking.cancelled'), { reply_markup: mainMenuKeyboard(ctx.t) });
  });
}
