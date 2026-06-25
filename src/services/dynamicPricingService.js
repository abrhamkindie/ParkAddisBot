import * as pricingRulesRepo from '../db/repositories/pricingRules.js';

// Calculate dynamic price for a booking based on pricing rules.
export async function calculateDynamicPrice(basePricePerHour, spotId, startTime, hours) {
  const start = new Date(startTime);
  let totalPrice = 0;

  for (let i = 0; i < hours; i++) {
    const hourTimestamp = new Date(start.getTime() + i * 3600 * 1000);
    const multiplier = await pricingRulesRepo.getPriceMultiplier 
      ? await pricingRulesRepo.getPriceMultiplier(spotId, hourTimestamp)
      : 1.0;
    
    totalPrice += basePricePerHour * multiplier;
  }

  return {
    baseTotal: basePricePerHour * hours,
    dynamicTotal: totalPrice,
    multiplier: hours > 0 ? totalPrice / (basePricePerHour * hours) : 1.0,
  };
}

// Get applicable pricing rules for display.
export async function getPricingRulesForSpot(spotId) {
  return await pricingRulesRepo.getRulesBySpotId(spotId);
}
