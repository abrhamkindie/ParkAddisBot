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

// Caption for the nearby-map photo: a header followed by the numbered list of
// spots, the numbers matching the pins drawn on the map image. Pure/testable.
export function buildMapCaption(t, spots, { headerText } = {}) {
  const body = spots.map((s, i) => spotLine(t, s, i)).join('\n');
  return `${headerText}\n\n${body}`;
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
