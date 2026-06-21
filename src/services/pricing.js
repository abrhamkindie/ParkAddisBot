import { getCommissionPercent } from '../db/repositories/settings.js';

// Round money to 2 decimals.
function money(n) {
  return Math.round(n * 100) / 100;
}

// Total = price_per_hour * hours. Duration is in hours (can be fractional).
export function calcTotal(pricePerHour, hours) {
  return money(Number(pricePerHour) * Number(hours));
}

// Split a total into platform commission + host payout using current %.
export async function calcSplit(total) {
  const percent = await getCommissionPercent();
  const commission = money((total * percent) / 100);
  const hostPayout = money(total - commission);
  return { total: money(total), commissionPercent: percent, commission, hostPayout };
}
