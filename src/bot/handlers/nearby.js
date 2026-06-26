/**
 * Nearby parking handlers — location search, area browse, spot details.
 *
 * @module bot/handlers/nearby
 */

import { InputFile } from 'grammy';
import { config } from '../../config/index.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import { shareLocationKeyboard, nearbyResultsKeyboard, spotDetailKeyboard, areaBrowserKeyboard, AREAS } from '../keyboards.js';
import { spotLine, spotDetail } from '../views/spot.js';
import { renderNearbyMap } from '../../utils/staticMap.js';
import { allTranslations } from '../../i18n/index.js';
import { logger } from '../../utils/logger.js';
import { botAsyncHandler } from '../utils/botError.js';

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

// Fallback when the map image can't be rendered (e.g. tiles unreachable): the
// classic numbered text list with the same Book/Directions/map buttons.
async function presentList(ctx, lat, lng, spots, headerText) {
  const body = spots.map((s, i) => spotLine(ctx.t, s, i)).join('\n');
  await ctx.reply(`${headerText}\n\n${body}`, {
    reply_markup: resultsKeyboard(ctx.t, lat, lng, spots),
  });
}

// Map-first results: send an interactive Telegram WebApp map where users can
// tap pins to view details and book spots.
async function presentResults(ctx, lat, lng, spots, headerText) {
  const t = ctx.t;

  // Try to send the interactive miniapp map
  const appUrl = miniAppUrl(lat, lng);

  if (appUrl) {
    // Send as a WebApp button for interactive map experience
    logger.info('Sending interactive map via WebApp', { spotCount: spots.length });
    await ctx.reply(headerText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗺️ Open Interactive Map', web_app: { url: appUrl } }],
        ],
      },
    });
  } else {
    // Fallback: render static map image if no https URL configured
    logger.info('No HTTPS URL configured, rendering static map image');
    try {
      const png = await renderNearbyMap({ lat, lng, spots });
      await ctx.replyWithPhoto(new InputFile(png, 'nearby.png'), {
        caption: `${headerText}\n\nNote: Configure PUBLIC_URL with HTTPS for interactive map.`,
      });
      logger.info('Static map sent successfully');
    } catch (err) {
      logger.warn('Map render failed, falling back to list', {
        error: err.message,
        stack: err.stack
      });
      await presentList(ctx, lat, lng, spots, headerText);
    }
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
  bot.hears(allTranslations('menu.find_parking'), botAsyncHandler(askForLocation));

  // Inline "Find parking" CTA (from the welcome message) → same prompt.
  bot.callbackQuery('nearby:find', botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    await askForLocation(ctx);
  }));

  // Any shared location (live or static) triggers a search.
  bot.on('message:location', botAsyncHandler(async (ctx) => {
    const { latitude, longitude } = ctx.msg.location;
    await runSearch(ctx, latitude, longitude);
  }));

  // Tap a spot in the result list → show details.
  bot.callbackQuery(/^spot:view:(\d+)$/, botAsyncHandler(async (ctx) => {
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
  }));

  // "Browse by area" menu button → show area picker (no location needed).
  bot.hears(allTranslations('menu.browse_areas'), botAsyncHandler(async (ctx) => {
    await ctx.reply(ctx.t('browse.pick_area'), {
      reply_markup: areaBrowserKeyboard(),
    });
  }));

  // User picked a neighbourhood area.
  bot.callbackQuery(/^browse:area:(.+)$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const key = ctx.match[1];
    const area = AREAS.find((a) => a.key === key);
    if (!area) return;

    const spots = await spotsRepo.findByArea({
      centerLat: area.lat,
      centerLng: area.lng,
      latDelta: 0.025,   // ~2.7 km north/south
      lngDelta: 0.030,   // ~2.7 km east/west
      limit: config.search.maxResults,
    });

    if (!spots.length) {
      return ctx.reply(ctx.t('browse.none_in_area', { area: area.label }));
    }

    const header = ctx.t('browse.results_header', { area: area.label, count: spots.length });
    await presentResults(ctx, area.lat, area.lng, spots, header);
  }));

  // "Back" from a spot detail — just acknowledge; the result list is still above.
  bot.callbackQuery('nearby:back', botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
  }));
}
