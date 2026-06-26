/**
 * Rating handlers — submit scores, comments, and view reviews.
 *
 * @module bot/handlers/rating
 */

import { InlineKeyboard } from 'grammy';
import { submitRating, canRateBooking, RatingError } from '../../services/ratingService.js';
import * as ratingsRepo from '../../db/repositories/ratings.js';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import { formatDateTime } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';  import { botAsyncHandler } from '../utils/botError.js';
import { Flow, clearFlowSession, getFlowSession, setFlowSession } from '../utils/session.js';

function createStarKeyboard(t, bookingId) {
  const kb = new InlineKeyboard();
  kb.text('5 ⭐', `rate:score:${bookingId}:5`)
    .text('4 ⭐', `rate:score:${bookingId}:4`)
    .text('3 ⭐', `rate:score:${bookingId}:3`);
  kb.row();
  kb.text('2 ⭐', `rate:score:${bookingId}:2`)
    .text('1 ⭐', `rate:score:${bookingId}:1`);
  kb.row();
  kb.text(`🚫 ${t('rating.dismiss')}`, 'rate:dismiss');
  return kb;
}

// Show rating prompt for a booking.
async function showRatingPrompt(ctx, bookingId) {
  const t = ctx.t;
  const booking = await bookingsRepo.getByIdWithParties(bookingId);

  if (!booking) {
    return ctx.reply(t('common.error_generic'));
  }

  // Check if can rate
  const canRate = await canRateBooking(bookingId, ctx.from.id);
  if (!canRate) {
    return ctx.reply(t('rating.already_rated'));
  }

  const address = booking.address || '—';

  await ctx.reply(
    `⭐ **${t('rating.prompt_title')}**\n\n${t('rating.prompt_body', { address })}`,
    {
      reply_markup: createStarKeyboard(t, bookingId),
      parse_mode: 'Markdown',
    }
  );
}

// Show comment input prompt.
async function showCommentPrompt(ctx, bookingId, score) {
  const t = ctx.t;

  // Store score in session
  setFlowSession(ctx.from.id, { flow: Flow.RATING, bookingId, score });

  const starLabels = {
    5: t('rating.stars_5'),
    4: t('rating.stars_4'),
    3: t('rating.stars_3'),
    2: t('rating.stars_2'),
    1: t('rating.stars_1'),
  };

  const kb = new InlineKeyboard().text(`⏭️ ${t('rating.skip')}`, `rate:comment:skip`);

  await ctx.reply(
    `${starLabels[score]}\n\n${t('rating.ask_comment')}`,
    { reply_markup: kb }
  );
}

// Submit rating with optional comment.
async function submitRatingFlow(ctx, bookingId, score, comment) {
  const { rating } = await submitRating({
    bookingId,
    driverId: ctx.from.id,
    score,
    comment,
  });

  await ctx.reply(
    `✅ **${ctx.t('rating.submitted')}**\n\n⭐ **${score}/5**`,
    { parse_mode: 'Markdown' }
  );

  logger.info('Rating submitted via bot', {
    bookingId,
    driverId: ctx.from.id,
    score,
  });
}

// View reviews for a spot.
async function viewReviews(ctx, spotId) {
  const t = ctx.t;

  const { ratings, total } = await ratingsRepo.listBySpot(spotId, 5, 0);

  if (ratings.length === 0) {
    return ctx.reply(t('rating.no_reviews'));
  }

  const booking = await bookingsRepo.getByIdWithParties(
    ratings[0].booking_id
  );
  const address = booking?.address || 'Spot';

  let message = `📝 **${t('rating.reviews_header', { address, count: total })}**\n\n`;

  ratings.forEach((r, idx) => {
    const date = formatDateTime(r.created_at, { dateOnly: true });
    const driverName = r.driver_name || 'Anonymous';

    if (r.comment) {
      message += `${t('rating.review_line', {
        score: r.score,
        comment: r.comment,
        driver_name: driverName,
        date,
      })}\n\n`;
    } else {
      message += `${t('rating.review_no_comment', {
        score: r.score,
        driver_name: driverName,
        date,
      })}\n\n`;
    }
  });

  if (total > 5) {
    message += `\n_...and ${total - 5} more reviews_`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

// Register rating handlers.
export function registerRating(bot) {
  // Show rating prompt
  bot.callbackQuery(/^rate:prompt:(\d+)$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const bookingId = Number(ctx.match[1]);
    await showRatingPrompt(ctx, bookingId);
  }));

  // User selected a score
  bot.callbackQuery(/^rate:score:(\d+):(\d)$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const bookingId = Number(ctx.match[1]);
    const score = Number(ctx.match[2]);
    await showCommentPrompt(ctx, bookingId, score);
  }));

  // Skip comment
  bot.callbackQuery(/^rate:comment:skip$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const session = getFlowSession(ctx.from.id);
    if (!session || session.flow !== Flow.RATING) {
      return ctx.reply(ctx.t('common.error_generic'));
    }
    const { bookingId, score } = session;
    clearFlowSession(ctx.from.id);
    await submitRatingFlow(ctx, bookingId, score, null);
  }));

  // Dismiss rating prompt
  bot.callbackQuery(/^rate:dismiss$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    clearFlowSession(ctx.from.id);
    await ctx.reply(ctx.t('rating.dismiss'));
  }));

  // View reviews for a spot
  bot.callbackQuery(/^rating:reviews:(\d+)$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const spotId = Number(ctx.match[1]);
    await viewReviews(ctx, spotId);
  }));

  // Handle comment text (when waiting for comment)
  bot.on('message:text', botAsyncHandler(async (ctx, next) => {
    // Only process if in rating flow
    const session = getFlowSession(ctx.from.id);
    if (!session || session.flow !== Flow.RATING || !session.bookingId) {
      return next();
    }

    const { bookingId, score } = session;
    clearFlowSession(ctx.from.id);
    const comment = ctx.message.text;

    await submitRatingFlow(ctx, bookingId, score, comment);
  }));
}

// Export function to trigger rating prompt (used by checkin handler).
export async function triggerRatingPrompt(ctx, bookingId) {
  try {
    const dt = ctx.t;
    const booking = await bookingsRepo.getByIdWithParties(bookingId);

    if (!booking || booking.status !== 'completed') {
      return;
    }

    // Check if already rated or prompted
    const canRate = await canRateBooking(bookingId, booking.driver_id);
    if (!canRate) {
      return;
    }

    // Send rating prompt to driver
    await ctx.api.sendMessage(
      Number(booking.driver_telegram_id),
      `⭐ **${dt('rating.prompt_title')}**\n\n${dt('rating.prompt_body', { address: booking.address || '—' })}`,
      {
        reply_markup: createStarKeyboard(dt, bookingId),
        parse_mode: 'Markdown',
      }
    );

    logger.info('Rating prompt sent', { bookingId, driverId: booking.driver_id });
  } catch (err) {
    logger.warn('Failed to send rating prompt', { error: err.message, bookingId });
  }
}
