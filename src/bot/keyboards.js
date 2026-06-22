import { InlineKeyboard, Keyboard } from 'grammy';
import { directionsUrl } from '../utils/maps.js';

// Language picker (used at /start and from the menu).
export function languageKeyboard(t) {
  return new InlineKeyboard()
    .text(t('language.english'), 'lang:en')
    .text(t('language.amharic'), 'lang:am');
}

// Inline CTA shown under the welcome message: one tap to start a parking search.
export function welcomeKeyboard(t) {
  return new InlineKeyboard().text(t('start.find_parking_cta'), 'nearby:find');
}

// Actions under a single native venue pin: book, directions, full details.
export function venuePinKeyboard(t, spot) {
  const kb = new InlineKeyboard().text(t('spot.book_now'), `book:start:${spot.id}`);
  if (spot.lat != null && spot.lng != null) {
    kb.url(t('common.directions'), directionsUrl(spot.lat, spot.lng));
  }
  kb.text(t('nearby.details_button'), `spot:view:${spot.id}`);
  return kb;
}

// Main reply (persistent) menu shown to drivers.
export function mainMenuKeyboard(t) {
  return new Keyboard()
    .text(t('menu.find_parking'))
    .row()
    .text(t('menu.my_bookings'))
    .text(t('menu.become_host'))
    .row()
    .text(t('menu.language'))
    .text(t('menu.help'))
    .resized()
    .persistent();
}

// Reply keyboard with a single "share location" request button.
export function shareLocationKeyboard(t) {
  return new Keyboard()
    .requestLocation(t('nearby.share_location_button'))
    .row()
    .text(t('common.cancel'))
    .resized()
    .oneTime();
}

// Inline list of nearby spots: a "Book #n" button per spot, plus map view.
export function nearbyResultsKeyboard(t, spots, { miniAppUrl } = {}) {
  const kb = new InlineKeyboard();
  spots.forEach((s, i) => {
    kb.text(t('nearby.book_spot', { index: i + 1 }), `spot:view:${s.id}`);
    if (s.lat != null && s.lng != null) {
      kb.url(t('common.directions'), directionsUrl(s.lat, s.lng));
    }
    kb.row();
  });
  if (miniAppUrl) {
    kb.webApp(t('nearby.open_map'), miniAppUrl);
  }
  return kb;
}

// Spot detail actions.
export function spotDetailKeyboard(t, spot) {
  const kb = new InlineKeyboard().text(t('spot.book_now'), `book:start:${spot.id}`).row();
  if (spot.lat != null && spot.lng != null) {
    kb.url(t('common.directions'), directionsUrl(spot.lat, spot.lng)).row();
  }
  kb.text(t('common.back'), 'nearby:back');
  return kb;
}

// Start-time choices.
export function startTimeKeyboard(t, spotId) {
  return new InlineKeyboard()
    .text(t('booking.start_now'), `book:start_at:${spotId}:0`)
    .row()
    .text(t('booking.start_in_30'), `book:start_at:${spotId}:30`)
    .text(t('booking.start_in_60'), `book:start_at:${spotId}:60`)
    .row()
    .text(t('common.cancel'), 'book:cancel');
}

// Duration choices (in hours). Back returns to the start-time step.
export function durationKeyboard(t, spotId, startOffsetMin) {
  const kb = new InlineKeyboard();
  [1, 2, 3, 4].forEach((h) => {
    kb.text(t('booking.duration_hours', { hours: h }), `book:dur:${spotId}:${startOffsetMin}:${h}`);
    if (h % 2 === 0) kb.row();
  });
  kb.row()
    .text(t('common.back'), `book:to_start:${spotId}`)
    .text(t('common.cancel'), 'book:cancel');
  return kb;
}

// Final confirm. Back returns to the duration step (re-using the start_at route).
export function confirmBookingKeyboard(t, spotId, startOffsetMin, hours) {
  return new InlineKeyboard()
    .text(t('booking.confirm'), `book:confirm:${spotId}:${startOffsetMin}:${hours}`)
    .row()
    .text(t('common.back'), `book:start_at:${spotId}:${startOffsetMin}`)
    .text(t('common.cancel'), 'book:cancel');
}
