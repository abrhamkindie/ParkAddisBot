import { formatMoney, currency } from '../../utils/format.js';
import { formatDistance, walkMinutes } from '../../utils/geo.js';

// Build the amenity badge string like "  🏠🛡️⚡" for a spot row.
export function amenityBadges(spot) {
  let s = '';
  if (spot.covered) s += '🏠';
  if (spot.guarded) s += '🛡️';
  if (spot.ev_charging) s += '⚡';
  return s ? ` ${s}` : '';
}

// One-line list entry for nearby results.
export function spotLine(t, spot, index) {
  return t('nearby.spot_line', {
    index: index + 1,
    address: spot.address || '—',
    price: formatMoney(spot.price_per_hour),
    currency,
    distance: formatDistance(spot.distance_m),
    badges: amenityBadges(spot),
  });
}

// Short title for a native venue pin, e.g. "45 ETB/hr · 🚶 6 min · ⭐ 4.6".
export function pinTitle(t, spot) {
  const minutes = walkMinutes(spot.distance_m);
  const rating =
    spot.rating_count > 0
      ? t('nearby.pin_rating', { rating: Number(spot.rating_avg).toFixed(1) })
      : '';
  return t('nearby.pin_title', {
    price: formatMoney(spot.price_per_hour),
    currency,
    minutes: minutes == null ? '?' : minutes,
    rating,
  });
}

// Pure presenter for a nearby-search result: given the spots and context, returns
// a plain plan the handler can send — a lead message (header + optional map
// button + "N more" note) and one venue pin per spot (capped at maxPins). No bot,
// DB, or i18n side effects beyond the passed-in translator, so it's unit-testable.
export function buildNearbyPresentation(t, spots, { mapUrl = null, maxPins = 5, headerText } = {}) {
  const pinnable = spots.filter((s) => s.lat != null && s.lng != null);
  const pins = pinnable.slice(0, maxPins).map((s) => ({
    spotId: Number(s.id),
    lat: Number(s.lat),
    lng: Number(s.lng),
    title: pinTitle(t, s),
    address: `${s.address || '—'}${amenityBadges(s)}`,
  }));

  const moreCount = spots.length - pins.length;
  let text = headerText;
  if (moreCount > 0) text += `\n\n${t('nearby.pins_more', { count: moreCount })}`;

  return { lead: { text, mapUrl, moreCount }, pins };
}

// Full detail block for a single spot.
export function spotDetail(t, spot) {
  const amenities = [];
  if (spot.covered) amenities.push(t('spot.covered'));
  if (spot.guarded) amenities.push(t('spot.guarded'));
  if (spot.ev_charging) amenities.push(t('spot.ev_charging'));

  const lines = [
    t('spot.details_title', { address: spot.address || '—' }),
    t('spot.available_now'),
    t('spot.price', { price: formatMoney(spot.price_per_hour), currency }),
    t('spot.capacity', { capacity: spot.capacity }),
  ];

  if (spot.distance_m != null) {
    lines.push(t('spot.distance', { distance: formatDistance(spot.distance_m) }));
    const minutes = walkMinutes(spot.distance_m);
    if (minutes != null) lines.push(t('spot.walk_time', { minutes }));
  }

  if (spot.rating_count > 0) {
    lines.push(t('spot.rating', { rating: spot.rating_avg, count: spot.rating_count }));
  } else {
    lines.push(t('spot.no_rating'));
  }

  lines.push(
    t('spot.amenities', {
      list: amenities.length ? amenities.join(', ') : t('spot.amenities_none'),
    })
  );

  return lines.join('\n');
}
