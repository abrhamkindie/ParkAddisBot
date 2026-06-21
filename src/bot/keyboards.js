import { InlineKeyboard, Keyboard } from 'grammy';

// Language picker (used at /start and from the menu).
export function languageKeyboard(t) {
  return new InlineKeyboard()
    .text(t('language.english'), 'lang:en')
    .text(t('language.amharic'), 'lang:am');
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
    kb.text(t('nearby.book_spot', { index: i + 1 }), `spot:view:${s.id}`).row();
  });
  if (miniAppUrl) {
    kb.webApp(t('nearby.open_map'), miniAppUrl);
  }
  return kb;
}

// Spot detail actions.
export function spotDetailKeyboard(t, spotId) {
  return new InlineKeyboard()
    .text(t('spot.book_now'), `book:start:${spotId}`)
    .row()
    .text(t('common.back'), 'nearby:back');
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

// Duration choices (in hours).
export function durationKeyboard(t, spotId, startOffsetMin) {
  const kb = new InlineKeyboard();
  [1, 2, 3, 4].forEach((h) => {
    kb.text(t('booking.duration_hours', { hours: h }), `book:dur:${spotId}:${startOffsetMin}:${h}`);
    if (h % 2 === 0) kb.row();
  });
  kb.row().text(t('common.cancel'), 'book:cancel');
  return kb;
}

// Final confirm.
export function confirmBookingKeyboard(t, spotId, startOffsetMin, hours) {
  return new InlineKeyboard()
    .text(t('booking.confirm'), `book:confirm:${spotId}:${startOffsetMin}:${hours}`)
    .row()
    .text(t('common.cancel'), 'book:cancel');
}
