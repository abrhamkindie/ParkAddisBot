import { InputFile } from 'grammy';
import { config } from '../../config/index.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import { shareLocationKeyboard, nearbyResultsKeyboard, spotDetailKeyboard } from '../keyboards.js';
import { spotLine, spotDetail, buildMapCaption } from '../views/spot.js';
import { renderNearbyMap } from '../../utils/staticMap.js';
import { allTranslations } from '../../i18n/index.js';
import { logger } from '../../utils/logger.js';

// Build a Mini App map URL with the user's coords. Returns null unless a
// PUBLIC_URL https origin is configured (Telegram requires https). Carries the
// bot username so the map's "Book" button can deep-link back into the chat flow.
function miniAppUrl(lat, lng) {
  if (!config.publicUrl.startsWith('https://')) return null;
  const u = new URL('/miniapp/', config.publicUrl);
  u.searchParams.set('lat', lat);
  u.searchParams.set('lng', lng);
  u.searchParams.set('bot', config.botUsername);
  return u.toString();
}

// Build the inline keyboard that sits under the map photo (and the list
// fallback): a per-spot Book + Directions row, plus the interactive-map button.
function resultsKeyboard(t, lat, lng, spots) {
  return nearbyResultsKeyboard(t, spots, { miniAppUrl: miniAppUrl(lat, lng) });
}

// Fallback when the map image can't be rendered (e.g. tiles unreachable): the
// classic numbered text list with the same Book/Directions/map buttons.
async function presentList(ctx, lat, lng, spots, headerText) {
  const body = spots.map((s, i) => spotLine(ctx.t, s, i)).join('\n');
  await ctx.reply(`${headerText}\n\n${body}`, {
    reply_markup: resultsKeyboard(ctx.t, lat, lng, spots),
  });
}

// Map-first results: render ONE map image with every nearby spot as a numbered
// pin (plus the driver's location) and send it as a single photo — the
// Google-Maps-style overview. The numbered caption + Book/Directions buttons
// line up with the pins. If rendering fails we degrade to the text list.
async function presentResults(ctx, lat, lng, spots, headerText) {
  const t = ctx.t;
  try {
    const png = await renderNearbyMap({ lat, lng, spots });
    await ctx.replyWithPhoto(new InputFile(png, 'nearby.png'), {
      caption: buildMapCaption(t, spots, { headerText }),
      reply_markup: resultsKeyboard(t, lat, lng, spots),
    });
  } catch (err) {
    logger.warn('map render failed; falling back to list', { error: err.message });
    await presentList(ctx, lat, lng, spots, headerText);
  }
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
    const header = t('nearby.map_header_far', {
      radius: (radiusM / 1000).toFixed(1),
      count: nearest.length,
      distance,
    });
    return presentResults(ctx, lat, lng, nearest, header);
  }

  return presentResults(ctx, lat, lng, spots, t('nearby.map_header', { count: spots.length }));
}

// Prompt the driver to share their location (the entry point to a search).
async function askForLocation(ctx) {
  await ctx.reply(ctx.t('nearby.ask_location'), {
    reply_markup: shareLocationKeyboard(ctx.t),
  });
}

export function registerNearby(bot) {
  // "Find parking" menu button → ask for location.
  bot.hears(allTranslations('menu.find_parking'), askForLocation);

  // Inline "Find parking" CTA (from the welcome message) → same prompt.
  bot.callbackQuery('nearby:find', async (ctx) => {
    await ctx.answerCallbackQuery();
    await askForLocation(ctx);
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
