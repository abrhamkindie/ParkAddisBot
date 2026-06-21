import { config } from '../../config/index.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import { shareLocationKeyboard, nearbyResultsKeyboard, spotDetailKeyboard } from '../keyboards.js';
import { spotLine, spotDetail } from '../views/spot.js';
import { allTranslations } from '../../i18n/index.js';
import { logger } from '../../utils/logger.js';

// Build a Mini App URL with the user's coords (used in step 5). Returns null
// unless a BOT_USERNAME + PUBLIC_URL https origin is configured.
function miniAppUrl(lat, lng) {
  if (!config.publicUrl.startsWith('https://')) return null; // Telegram requires https
  const u = new URL('/miniapp/', config.publicUrl);
  u.searchParams.set('lat', lat);
  u.searchParams.set('lng', lng);
  return u.toString();
}

async function runSearch(ctx, lat, lng) {
  const t = ctx.t;
  await ctx.reply(t('nearby.searching'));

  const radiusM = config.search.defaultRadiusM;
  let spots;
  try {
    spots = await spotsRepo.findNearby({
      lat,
      lng,
      radiusM,
      limit: config.search.maxResults,
    });
  } catch (err) {
    logger.error('nearby search failed', { error: err.message });
    return ctx.reply(t('common.error_generic'));
  }

  logger.info('nearby search', { lat, lng, radiusM, found: spots.length });

  if (!spots.length) {
    // Nothing within the radius. Rather than a dead end, show the closest spots
    // we have and tell the user how far they are — this is what makes "no nearby
    // parking" actionable while the catalog is still small.
    const nearest = await spotsRepo.findNearestAny({ lat, lng, limit: config.search.maxResults });
    if (!nearest.length) {
      return ctx.reply(t('nearby.none_found', { radius: (radiusM / 1000).toFixed(1) }));
    }
    const distance = `${(nearest[0].distance_m / 1000).toFixed(1)} km`;
    const header = t('nearby.results_header_far', {
      radius: (radiusM / 1000).toFixed(1),
      distance,
    });
    const body = nearest.map((s, i) => spotLine(t, s, i)).join('\n');
    return ctx.reply(`${header}\n\n${body}`, {
      reply_markup: nearbyResultsKeyboard(t, nearest, { miniAppUrl: miniAppUrl(lat, lng) }),
    });
  }

  const header = t('nearby.results_header', { count: spots.length });
  const body = spots.map((s, i) => spotLine(t, s, i)).join('\n');

  await ctx.reply(`${header}\n\n${body}`, {
    reply_markup: nearbyResultsKeyboard(t, spots, { miniAppUrl: miniAppUrl(lat, lng) }),
  });
}

export function registerNearby(bot) {
  // "Find parking" menu button → ask for location.
  bot.hears(allTranslations('menu.find_parking'), async (ctx) => {
    await ctx.reply(ctx.t('nearby.ask_location'), {
      reply_markup: shareLocationKeyboard(ctx.t),
    });
  });

  // Any shared location (live or static) triggers a search.
  bot.on('message:location', async (ctx) => {
    const { latitude, longitude } = ctx.msg.location;
    await runSearch(ctx, latitude, longitude);
  });

  // Tap a spot in the result list → show details.
  bot.callbackQuery(/^spot:view:(\d+)$/, async (ctx) => {
    const spotId = Number(ctx.match[1]);
    const spot = await spotsRepo.getById(spotId);
    await ctx.answerCallbackQuery();
    if (!spot) return ctx.reply(ctx.t('booking.spot_unavailable'));

    await ctx.reply(spotDetail(ctx.t, spot), {
      reply_markup: spotDetailKeyboard(ctx.t, spot),
    });

    // Native map card the driver can tap to open maps.
    if (spot.lat != null && spot.lng != null) {
      await ctx.replyWithLocation(spot.lat, spot.lng);
    }
  });

  // "Back" from a spot detail — just acknowledge; the result list is still above.
  bot.callbackQuery('nearby:back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
  });
}
