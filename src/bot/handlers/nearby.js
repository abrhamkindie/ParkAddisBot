import { InlineKeyboard } from 'grammy';
import { config } from '../../config/index.js';
import * as spotsRepo from '../../db/repositories/spots.js';
import {
  shareLocationKeyboard,
  nearbyResultsKeyboard,
  spotDetailKeyboard,
  venuePinKeyboard,
} from '../keyboards.js';
import { spotLine, spotDetail, buildNearbyPresentation } from '../views/spot.js';
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

// Fallback when native venue pins can't be sent: the classic text list (with a
// map button when https is available).
async function presentList(ctx, lat, lng, spots, headerText) {
  const t = ctx.t;
  const mapUrl = miniAppUrl(lat, lng);
  if (mapUrl) {
    await ctx.reply(t('nearby.map_cta', { count: spots.length }), {
      reply_markup: new InlineKeyboard().webApp(t('nearby.open_map'), mapUrl),
    });
  }
  const body = spots.map((s, i) => spotLine(t, s, i)).join('\n');
  await ctx.reply(`${headerText}\n\n${body}`, {
    reply_markup: nearbyResultsKeyboard(t, spots, {}),
  });
}

// Map-first results: immediately drop a native map pin per nearby spot in the
// chat (each with Book/Directions/Details), led by a header that also carries the
// one-tap interactive-map button. Pins render even without the https tunnel, so
// if anything goes wrong we degrade to the plain text list rather than fail.
async function presentResults(ctx, lat, lng, spots, headerText) {
  const t = ctx.t;
  const mapUrl = miniAppUrl(lat, lng);
  const plan = buildNearbyPresentation(t, spots, {
    mapUrl,
    maxPins: config.search.maxInlinePins,
    headerText,
  });

  try {
    await ctx.reply(plan.lead.text, {
      reply_markup: plan.lead.mapUrl
        ? new InlineKeyboard().webApp(t('nearby.open_map'), plan.lead.mapUrl)
        : undefined,
    });
    for (const pin of plan.pins) {
      await ctx.replyWithVenue(pin.lat, pin.lng, pin.title, pin.address, {
        reply_markup: venuePinKeyboard(t, { id: pin.spotId, lat: pin.lat, lng: pin.lng }),
      });
    }
  } catch (err) {
    logger.warn('venue pins failed; falling back to list', { error: err.message });
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
    const header = t('nearby.pins_header_far', {
      radius: (radiusM / 1000).toFixed(1),
      count: nearest.length,
      distance,
    });
    return presentResults(ctx, lat, lng, nearest, header);
  }

  return presentResults(ctx, lat, lng, spots, t('nearby.pins_header', { count: spots.length }));
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
