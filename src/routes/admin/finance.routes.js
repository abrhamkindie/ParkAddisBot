/**
 * Admin finance management routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/finance`.
 *
 * @module routes/admin/finance
 */
import { Router } from 'express';
import * as adminFinanceRepo from '../../db/repositories/admin/finance.js';
import { authenticate } from '../../middlewares/auth.js';
import { success, created } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin finance router.
 * @returns {import('express').Router}
 */
export function createAdminFinanceRouter() {
  const router = Router();

  router.use(authenticate);

  // Host payout balances
  router.get('/balances', asyncHandler(async (req, res) => {
    const balances = await adminFinanceRepo.getHostBalances();
    success(res, balances);
  }));

  // Create payout
  router.post('/payouts',
    validate({ body: schemas.createPayoutBody }),
    asyncHandler(async (req, res) => {
      const { hostId, amount, note } = req.body;
      const payout = await adminFinanceRepo.createPayout({
        hostId,
        amount,
        note,
        markedBy: req.admin.id,
      });
      logger.info('Payout created', { payoutId: payout.id, adminId: req.admin.id });
      created(res, payout);
    }));

  // Mark payout as sent
  router.post('/payouts/:id/sent',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const payout = await adminFinanceRepo.markPayoutSent(req.params.id);
      if (!payout) throw new NotFoundError('Payout not found');
      logger.info('Payout marked sent', { payoutId: payout.id, adminId: req.admin.id });
      success(res, payout);
    }));

  return router;
}
