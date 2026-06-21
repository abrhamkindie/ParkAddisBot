import * as usersRepo from '../../db/repositories/users.js';
import { getTranslator, SUPPORTED_LANGS, allTranslations } from '../../i18n/index.js';
import { languageKeyboard } from '../keyboards.js';
import { sendMainMenu } from './start.js';

export function registerLanguage(bot) {
  // Open the language picker from the menu button.
  bot.hears(allTranslations('menu.language'), async (ctx) => {
    await ctx.reply(ctx.t('language.changed'), { reply_markup: languageKeyboard(ctx.t) });
  });

  // Handle lang:en / lang:am callbacks.
  bot.callbackQuery(/^lang:(en|am)$/, async (ctx) => {
    const lang = ctx.match[1];
    if (!SUPPORTED_LANGS.includes(lang)) return ctx.answerCallbackQuery();

    const updated = await usersRepo.setLanguage(ctx.from.id, lang);
    ctx.dbUser = updated;
    ctx.t = getTranslator(lang);

    await ctx.answerCallbackQuery({ text: ctx.t('language.changed') });
    // Remove the inline keyboard to avoid stale taps.
    await ctx.editMessageReplyMarkup().catch(() => {});
    await sendMainMenu(ctx);
  });
}
