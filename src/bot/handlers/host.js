/**
 * Host management handlers — listing wizard + "My spots" management.
 *
 * @module bot/handlers/host
 */

import * as spotsRepo from '../../db/repositories/spots.js';
import * as usersRepo from '../../db/repositories/users.js';
import * as bookingsRepo from '../../db/repositories/bookings.js';
import { allTranslations } from '../../i18n/index.js';
import { parsePrice, parseCapacity } from '../../utils/listing.js';
import { amenityBadges } from '../views/spot.js';
import { formatMoney, formatDateTime, currency } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { BotError, BotErrorCode, botAsyncHandler } from '../utils/botError.js';
import { Flow, ListingStep, isInFlow, isAtStep, clearFlowSession, setFlowSession, getFlowSession } from '../utils/session.js';
import {
  mainMenuKeyboard,
  spotLocationKeyboard,
  skipKeyboard,
  cancelKeyboard,
  capacityKeyboard,
  amenitiesKeyboard,
  spotManageKeyboard,
  deleteConfirmKeyboard,
} from '../keyboards.js';

// Concrete strings for the menu buttons in every language — tapping any of these
// mid-wizard aborts the flow and runs that button instead.
const MENU_BUTTONS = new Set(
  ['menu.find_parking', 'menu.my_bookings', 'menu.my_spots', 'menu.become_host', 'menu.language', 'menu.help']
    .flatMap((k) => allTranslations(k))
);
const isCancel = (text) => allTranslations('common.cancel').includes(text);
const isSkip = (text) => allTranslations('common.skip').includes(text);

// --- views ---

function ratingShort(t, spot) {
  return spot.rating_count > 0 ? `⭐ ${spot.rating_avg} (${spot.rating_count})` : '⭐ —';
}

function spotCard(t, spot) {
  return t('host.spot_card', {
    status: spot.is_available ? t('host.status_live') : t('host.status_paused'),
    address: spot.address || '—',
    price: formatMoney(spot.price_per_hour),
    currency,
    capacity: spot.capacity,
    amenities: amenityBadges(spot),
    rating: ratingShort(t, spot),
  });
}

// --- listing wizard steps ---

async function setCapacityAndAdvance(ctx, s, capacity) {
  s.draft.capacity = capacity;
  s.draft.covered = false;
  s.draft.guarded = false;
  s.draft.ev_charging = false;
  s.step = ListingStep.AMENITIES;
  setFlowSession(ctx.from.id, s);
  await ctx.reply(ctx.t('host.ask_amenities'), { reply_markup: amenitiesKeyboard(ctx.t, s.draft) });
}

async function finalizeListing(ctx, s) {
  const t = ctx.t;
  const d = s.draft;
  clearFlowSession(ctx.from.id);

  let spot;
  try {
    spot = await spotsRepo.create({
      ownerId: ctx.dbUser.id,
      lat: d.lat,
      lng: d.lng,
      address: d.address,
      pricePerHour: d.price,
      capacity: d.capacity,
      covered: !!d.covered,
      guarded: !!d.guarded,
      evCharging: !!d.ev_charging,
      photoFileId: d.photoFileId,
    });
  } catch (err) {
    logger.error('spot create failed', { error: err.message });
    return ctx.reply(t('common.error_generic'), { reply_markup: mainMenuKeyboard(t) });
  }

  // First listing promotes a driver to host (doesn't remove any ability).
  if (ctx.dbUser.role === 'driver') {
    try {
      await usersRepo.setRole(ctx.from.id, 'host');
    } catch (err) {
      logger.warn('role promote failed', { error: err.message });
    }
  }

  const body = t('host.created_body', {
    address: spot.address || '—',
    price: formatMoney(spot.price_per_hour),
    currency,
    capacity: spot.capacity,
    amenities: amenityBadges(spot),
  });
  await ctx.reply(`${t('host.created_title')}\n\n${body}`, { reply_markup: mainMenuKeyboard(t) });
  await ctx.replyWithLocation(d.lat, d.lng).catch(() => {});
}

async function handleListingMessage(ctx, s) {
  const t = ctx.t;
  const msg = ctx.message;

  switch (s.step) {
    case ListingStep.LOCATION: {
      if (!msg.location) {
        return ctx.reply(t('host.need_location'), { reply_markup: spotLocationKeyboard(t) });
      }
      s.draft.lat = msg.location.latitude;
      s.draft.lng = msg.location.longitude;
      s.step = ListingStep.ADDRESS;
      setFlowSession(ctx.from.id, s);
      return ctx.reply(t('host.ask_address'), { reply_markup: skipKeyboard(t) });
    }
    case ListingStep.ADDRESS: {
      if (msg.text == null) return ctx.reply(t('host.ask_address'), { reply_markup: skipKeyboard(t) });
      s.draft.address = isSkip(msg.text) ? null : msg.text.trim();
      s.step = ListingStep.PRICE;
      setFlowSession(ctx.from.id, s);
      return ctx.reply(t('host.ask_price', { currency }), { reply_markup: cancelKeyboard(t) });
    }
    case ListingStep.PRICE: {
      const price = parsePrice(msg.text || '');
      if (price == null) return ctx.reply(t('host.bad_price'), { reply_markup: cancelKeyboard(t) });
      s.draft.price = price;
      s.step = ListingStep.CAPACITY;
      setFlowSession(ctx.from.id, s);
      return ctx.reply(t('host.ask_capacity'), { reply_markup: capacityKeyboard(t) });
    }
    case ListingStep.CAPACITY: {
      const cap = parseCapacity(msg.text || '');
      if (cap == null) return ctx.reply(t('host.bad_capacity'));
      return setCapacityAndAdvance(ctx, s, cap);
    }
    case ListingStep.AMENITIES:
      // Amenities are chosen via the inline buttons; nudge if they type.
      return ctx.reply(t('host.ask_amenities'), { reply_markup: amenitiesKeyboard(t, s.draft) });
    case ListingStep.PHOTO: {
      if (msg.photo && msg.photo.length) {
        s.draft.photoFileId = msg.photo[msg.photo.length - 1].file_id; // largest size
        return finalizeListing(ctx, s);
      }
      if (msg.text && isSkip(msg.text)) {
        s.draft.photoFileId = null;
        return finalizeListing(ctx, s);
      }
      return ctx.reply(t('host.need_photo'), { reply_markup: skipKeyboard(t) });
    }
    default:
      clearFlowSession(ctx.from.id);
      return;
  }
}

async function handleEditPriceMessage(ctx, s) {
  const t = ctx.t;
  const price = parsePrice(ctx.message.text || '');
  if (price == null) return ctx.reply(t('host.bad_price'), { reply_markup: cancelKeyboard(t) });
  clearFlowSession(ctx.from.id);
  const updated = await spotsRepo.updatePrice(s.spotId, ctx.dbUser.id, price);
  if (!updated) return ctx.reply(t('host.spot_gone'), { reply_markup: mainMenuKeyboard(t) });
  return ctx.reply(t('host.price_updated', { price: formatMoney(price), currency }), {
    reply_markup: mainMenuKeyboard(t),
  });
}

// Early middleware: when the user is mid-flow, route their message to the flow
// (so e.g. sharing a location while listing doesn't trigger a parking search).
// Tapping Cancel or any menu button exits the flow first.
export function hostFlowMiddleware() {
  return async (ctx, next) => {
    const s = getFlowSession(ctx.from?.id);
    if (!s || !ctx.message) return next();

    const text = ctx.message.text;
    if (text && isCancel(text)) {
      clearFlowSession(ctx.from.id);
      return ctx.reply(ctx.t('host.listing_cancelled'), { reply_markup: mainMenuKeyboard(ctx.t) });
    }
    if (text && MENU_BUTTONS.has(text)) {
      clearFlowSession(ctx.from.id);
      return next();
    }
    if (isInFlow(s, Flow.LIST_SPOT)) return handleListingMessage(ctx, s);
    if (isInFlow(s, Flow.EDIT_PRICE)) return handleEditPriceMessage(ctx, s);
    return next();
  };
}

// --- "My spots" ownership-checked manage actions ---

// Load a spot and verify the caller owns it; otherwise answer + explain.
async function ownedSpot(ctx, id) {
  const spot = await spotsRepo.getById(id);
  if (!spot) {
    await ctx.answerCallbackQuery({ text: ctx.t('host.spot_gone') });
    return null;
  }
  if (String(spot.owner_id) !== String(ctx.dbUser.id)) {
    await ctx.answerCallbackQuery({ text: ctx.t('host.not_your_spot') });
    return null;
  }
  return spot;
}

export function registerHost(bot) {
  // Start the listing wizard.
  bot.hears(allTranslations('menu.become_host'), botAsyncHandler(async (ctx) => {
    setFlowSession(ctx.from.id, { flow: Flow.LIST_SPOT, step: ListingStep.LOCATION, draft: {} });
    await ctx.reply(ctx.t('host.start_intro'));
    await ctx.reply(ctx.t('host.ask_location'), { reply_markup: spotLocationKeyboard(ctx.t) });
  }));

  // List the host's spots with per-spot management.
  bot.hears(allTranslations('menu.my_spots'), botAsyncHandler(async (ctx) => {
    const spots = await spotsRepo.listByOwner(ctx.dbUser.id);
    if (!spots.length) return ctx.reply(ctx.t('host.my_spots_empty'));
    await ctx.reply(ctx.t('host.my_spots_header', { count: spots.length }));
    for (const spot of spots) {
      await ctx.reply(spotCard(ctx.t, spot), { reply_markup: spotManageKeyboard(ctx.t, spot) });
    }
  }));

  // Capacity quick-pick (only valid while on the capacity step).
  bot.callbackQuery(/^host:cap:(\d+)$/, botAsyncHandler(async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = getFlowSession(ctx.from.id);
    if (!isInFlow(s, Flow.LIST_SPOT) || !isAtStep(s, ListingStep.CAPACITY)) return;
    await setCapacityAndAdvance(ctx, s, Number(ctx.match[1]));
  }));

  // Amenity toggles + continue (only while on the amenities step).
  bot.callbackQuery(/^host:am:(covered|guarded|ev|done)$/, botAsyncHandler(async (ctx) => {
    const s = getFlowSession(ctx.from.id);
    if (!isInFlow(s, Flow.LIST_SPOT) || !isAtStep(s, ListingStep.AMENITIES)) return ctx.answerCallbackQuery();
    const which = ctx.match[1];
    if (which === 'done') {
      await ctx.answerCallbackQuery();
      s.step = ListingStep.PHOTO;
      setFlowSession(ctx.from.id, s);
      return ctx.reply(ctx.t('host.ask_photo'), { reply_markup: skipKeyboard(ctx.t) });
    }
    const key = which === 'ev' ? 'ev_charging' : which;
    s.draft[key] = !s.draft[key];
    setFlowSession(ctx.from.id, s);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: amenitiesKeyboard(ctx.t, s.draft) }).catch(() => {});
  }));

  // Pause / resume — flip availability and re-render the card in place.
  bot.callbackQuery(/^host:toggle:(\d+)$/, botAsyncHandler(async (ctx) => {
    const id = Number(ctx.match[1]);
    const spot = await ownedSpot(ctx, id);
    if (!spot) return;
    const updated = await spotsRepo.setAvailability(id, ctx.dbUser.id, !spot.is_available);
    await ctx.answerCallbackQuery({
      text: updated.is_available ? ctx.t('host.resumed_ok') : ctx.t('host.paused_ok'),
    });
    await ctx.editMessageText(spotCard(ctx.t, updated), {
      reply_markup: spotManageKeyboard(ctx.t, updated),
    }).catch(() => {});
  }));

  // Edit price — start a short edit_price flow.
  bot.callbackQuery(/^host:price:(\d+)$/, botAsyncHandler(async (ctx) => {
    const id = Number(ctx.match[1]);
    const spot = await ownedSpot(ctx, id);
    if (!spot) return;
    await ctx.answerCallbackQuery();
    setFlowSession(ctx.from.id, { flow: Flow.EDIT_PRICE, step: ListingStep.PRICE, spotId: id });
    await ctx.reply(ctx.t('host.edit_price_ask', { currency, address: spot.address || '—' }), {
      reply_markup: cancelKeyboard(ctx.t),
    });
  }));

  // Delete — confirm in place.
  bot.callbackQuery(/^host:del:(\d+)$/, botAsyncHandler(async (ctx) => {
    const id = Number(ctx.match[1]);
    const spot = await ownedSpot(ctx, id);
    if (!spot) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t('host.delete_confirm', { address: spot.address || '—' }), {
      reply_markup: deleteConfirmKeyboard(ctx.t, id),
    }).catch(() => {});
  }));

  bot.callbackQuery(/^host:delok:(\d+)$/, botAsyncHandler(async (ctx) => {
    const id = Number(ctx.match[1]);
    const spot = await ownedSpot(ctx, id);
    if (!spot) return;
    await spotsRepo.remove(id, ctx.dbUser.id);
    await ctx.answerCallbackQuery({ text: ctx.t('host.deleted_ok') });
    await ctx.editMessageText(ctx.t('host.deleted_ok')).catch(() => {});
  }));

  bot.callbackQuery(/^host:delno:(\d+)$/, botAsyncHandler(async (ctx) => {
    const id = Number(ctx.match[1]);
    const spot = await ownedSpot(ctx, id);
    if (!spot) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(spotCard(ctx.t, spot), {
      reply_markup: spotManageKeyboard(ctx.t, spot),
    }).catch(() => {});
  }));

  // View upcoming bookings for a spot.
  bot.callbackQuery(/^host:bk:(\d+)$/, botAsyncHandler(async (ctx) => {
    const id = Number(ctx.match[1]);
    const spot = await ownedSpot(ctx, id);
    if (!spot) return;
    await ctx.answerCallbackQuery();
    const rows = await bookingsRepo.listBySpot(id, 10);
    if (!rows.length) return ctx.reply(ctx.t('host.bookings_empty'));
    const lines = rows.map((b) =>
      ctx.t('host.booking_line', {
        code: b.confirmation_code || b.id,
        driver: b.driver_name || '—',
        start: formatDateTime(b.start_time),
        end: formatDateTime(b.end_time),
        status: ctx.t(`status.${b.status}`),
      })
    );
    await ctx.reply(
      `${ctx.t('host.bookings_header', { address: spot.address || '—' })}\n\n${lines.join('\n\n')}`
    );
  }));

  // Help button.
  bot.hears(allTranslations('menu.help'), botAsyncHandler(async (ctx) => {
    const { config } = await import('../../config/index.js');
    await ctx.reply(ctx.t('help.text', { app: config.appName }));
  }));

  // Cancel outside a flow (e.g. from the booking share-location keyboard).
  bot.hears(allTranslations('common.cancel'), botAsyncHandler(async (ctx) => {
    await ctx.reply(ctx.t('booking.cancelled'), { reply_markup: mainMenuKeyboard(ctx.t) });
  }));
}
