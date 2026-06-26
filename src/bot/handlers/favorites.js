/**
 * Favorites handlers — add, remove, list, and rebook favorite spots.
 *
 * @module bot/handlers/favorites
 */

import * as favoritesRepo from '../../db/repositories/favorites.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import { beginBooking } from './booking.js';
import { botAsyncHandler } from '../utils/botError.js';

export function registerFavorites(bot) {
  // Show user's favorite spots.
  bot.callbackQuery(/^favorites:list$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const favorites = await favoritesRepo.getUserFavorites(ctx.from.id);

    if (favorites.length === 0) {
      return ctx.editMessageText(ctx.t('favorites.empty'));
    }

    const text = ctx.t('favorites.title') + '\n\n' +
      favorites.map((f, i) =>
        `${i + 1}. ${f.address}\n` +
        `   ⭐ ${f.rating_avg || '—'} | ${ctx.t('booking.price_per_hour', { price: f.price_per_hour })}\n` +
        `   /book_${f.id}`
      ).join('\n\n');

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: favorites.map(f => [
          { text: `📍 ${f.address}`, callback_data: `spot:view:${f.id}` },
        ]).concat([[
          { text: ctx.t('common.back'), callback_data: 'nearby:back' },
        ]]),
      },
    });
  }));

  // Add spot to favorites.
  bot.callbackQuery(/^favorite:add:(\d+)$/, botAsyncHandler(async (ctx) => {
    const spotId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    const added = await favoritesRepo.addFavorite(ctx.from.id, spotId);

    if (added) {
      await ctx.reply(ctx.t('favorites.added'), { show_alert: true });
    } else {
      await ctx.reply(ctx.t('favorites.already_added'), { show_alert: true });
    }
  }));

  // Remove spot from favorites.
  bot.callbackQuery(/^favorite:remove:(\d+)$/, botAsyncHandler(async (ctx) => {
    const spotId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    const removed = await favoritesRepo.removeFavorite(ctx.from.id, spotId);

    if (removed) {
      await ctx.reply(ctx.t('favorites.removed'), { show_alert: true });
    }
  }));

  // Quick rebook from favorites.
  bot.callbackQuery(/^favorite:rebook:(\d+)$/, botAsyncHandler(async (ctx) => {
    const spotId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    // Start booking flow directly
    await beginBooking(ctx, spotId);
  }));
}
