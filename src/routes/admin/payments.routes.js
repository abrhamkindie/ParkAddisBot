/**
 * Admin payment management routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/payments`.
 *
 * @module routes/admin/payments
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
 * Creates the admin payments router.
 * @returns {import('express').Router}
 */
export function createAdminPaymentsRouter() {
  const router = Router();

  router.use(authenticate);

  // List payments (?status=paid&method=chapa&limit=20&offset=0)
  router.get('/',
    validate({ query: schemas.paymentListQuery }),
    asyncHandler(async (req, res) => {
      const { status, method, limit, offset } = req.query;
      const result = await adminBookingsRepo.listPayments({ status, method, limit, offset });
      paginated(res, result.payments, { total: result.total, limit, offset });
    }));

  // Refund payment
  router.post('/:id/refund',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const payment = await adminBookingsRepo.refundPayment(req.params.id);
      if (!payment) throw new NotFoundError('Payment not found');
      logger.info('Payment refunded', { paymentId: payment.id, adminId: req.admin.id });
      success(res, payment);
    }));

  return router;
}
