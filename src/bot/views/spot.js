import { formatMoney, currency } from '../../utils/format.js';
import { formatDistance } from '../../utils/geo.js';

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

// Full detail block for a single spot.
export function spotDetail(t, spot) {
  const amenities = [];
  if (spot.covered) amenities.push(t('spot.covered'));
  if (spot.guarded) amenities.push(t('spot.guarded'));
  if (spot.ev_charging) amenities.push(t('spot.ev_charging'));

  const lines = [
    t('spot.details_title', { address: spot.address || '—' }),
    t('spot.price', { price: formatMoney(spot.price_per_hour), currency }),
    t('spot.capacity', { capacity: spot.capacity }),
  ];

  if (spot.distance_m != null) {
    lines.push(t('spot.distance', { distance: formatDistance(spot.distance_m) }));
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
