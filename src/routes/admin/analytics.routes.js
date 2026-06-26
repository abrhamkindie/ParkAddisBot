/**
 * Admin analytics routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/analytics`.
 *
 * @module routes/admin/analytics
 */
import { Router } from 'express';
import * as analyticsRepo from '../../db/repositories/admin/analytics.js';
import { authenticate } from '../../middlewares/auth.js';
import { success } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin analytics router.
 * @returns {import('express').Router}
 */
export function createAdminAnalyticsRouter() {
  const router = Router();

  router.use(authenticate);

  // Platform overview stats
  router.get('/overview', asyncHandler(async (req, res) => {
    const stats = await analyticsRepo.getPlatformStats();
    success(res, stats);
  }));

  // Revenue trends (?period=day|week|month)
  router.get('/revenue',
    validate({ query: schemas.revenueQuery }),
    asyncHandler(async (req, res) => {
      const { period } = req.query;
      const stats = await analyticsRepo.getRevenueStats({ period });
      success(res, stats);
    }));

  // Booking & payment method stats
  router.get('/bookings', asyncHandler(async (req, res) => {
    const [bookingStats, paymentStats] = await Promise.all([
      analyticsRepo.getBookingStats(),
      analyticsRepo.getPaymentMethodStats(),
    ]);
    success(res, { byStatus: bookingStats, byPaymentMethod: paymentStats });
  }));

  // Top spots by booking count (?limit=10)
  router.get('/top-spots',
    validate({ query: schemas.topSpotsQuery }),
    asyncHandler(async (req, res) => {
      const { limit } = req.query;
      const spots = await analyticsRepo.getTopSpots(limit);
      success(res, spots);
    }));

  // Recent activity (?limit=20)
  router.get('/activity',
    validate({ query: schemas.activityQuery }),
    asyncHandler(async (req, res) => {
      const { limit } = req.query;
      const activity = await analyticsRepo.getRecentActivity(limit);
      success(res, activity);
    }));

  return router;
}
