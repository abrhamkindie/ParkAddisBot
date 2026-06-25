import * as promoRepo from '../db/repositories/promoCodes.js';

// Apply promo code to a booking.
export async function applyPromoCode(code, bookingAmount) {
  const validation = await promoRepo.validatePromoCode(code, bookingAmount);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      originalAmount: bookingAmount,
      discountAmount: 0,
      finalAmount: bookingAmount,
    };
  }

  const { promo } = validation;
  let discountAmount = 0;

  if (promo.discount_type === 'percent') {
    discountAmount = bookingAmount * (promo.discount_value / 100);
  } else {
    discountAmount = promo.discount_value;
  }

  // Ensure discount doesn't exceed booking amount
  discountAmount = Math.min(discountAmount, bookingAmount);
  const finalAmount = bookingAmount - discountAmount;

  return {
    success: true,
    promo,
    originalAmount: bookingAmount,
    discountAmount,
    finalAmount,
  };
}

// Finalize promo code usage (call after successful payment).
export async function finalizePromoUsage(promoId) {
  await promoRepo.incrementUsage(promoId);
}
