/**
 * Admin booking management routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/bookings`.
 *
 * @module routes/admin/bookings
 */
import { Router } from 'express';
import * as adminBookingsRepo from '../../db/repositories/admin/bookings.js';
import { authenticate } from '../../middlewares/auth.js';
import { success, paginated } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin bookings router.
 * @returns {import('express').Router}
 */
export function createAdminBookingsRouter() {
  const router = Router();

  router.use(authenticate);

  // List bookings (?status=reserved&paymentStatus=paid&dateFrom=&dateTo=&limit=20&offset=0)
  router.get('/',
    validate({ query: schemas.bookingListQuery }),
    asyncHandler(async (req, res) => {
      const { status, paymentStatus, dateFrom, dateTo, limit, offset } = req.query;
      const result = await adminBookingsRepo.listAll({
        status, paymentStatus, dateFrom, dateTo, limit, offset,
      });
      paginated(res, result.bookings, { total: result.total, limit, offset });
    }));

  // Booking details
  router.get('/:id',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const booking = await adminBookingsRepo.getById(req.params.id);
      if (!booking) throw new NotFoundError('Booking not found');
      success(res, booking);
    }));

  // Cancel booking
  router.post('/:id/cancel',
    validate({ params: schemas.idParam, body: schemas.cancelBookingBody }),
    asyncHandler(async (req, res) => {
      const { reason } = req.body;
      const booking = await adminBookingsRepo.cancel(req.params.id, reason);
      if (!booking) throw new NotFoundError('Booking not found');
      logger.info('Booking cancelled', { bookingId: booking.id, adminId: req.admin.id });
      success(res, booking);
    }));

  return router;
}
