/**
 * Admin dispute management routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/disputes`.
 *
 * @module routes/admin/disputes
 */
import { Router } from 'express';
import * as adminFinanceRepo from '../../db/repositories/admin/finance.js';
import { authenticate } from '../../middlewares/auth.js';
import { success, paginated } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin disputes router.
 * @returns {import('express').Router}
 */
export function createAdminDisputesRouter() {
  const router = Router();

  router.use(authenticate);

  // List disputes (?status=open&limit=20&offset=0)
  router.get('/',
    validate({ query: schemas.disputeListQuery }),
    asyncHandler(async (req, res) => {
      const { status, limit, offset } = req.query;
      const result = await adminFinanceRepo.listDisputes({ status, limit, offset });
      paginated(res, result.disputes, { total: result.total, limit, offset });
    }));

  // Dispute details
  router.get('/:id',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const dispute = await adminFinanceRepo.getDisputeById(req.params.id);
      if (!dispute) throw new NotFoundError('Dispute not found');
      success(res, dispute);
    }));

  // Resolve dispute
  router.post('/:id/resolve',
    validate({ params: schemas.idParam, body: schemas.resolveDisputeBody }),
    asyncHandler(async (req, res) => {
      const { resolution } = req.body;
      const dispute = await adminFinanceRepo.resolveDispute(
        req.params.id,
        resolution,
        req.admin.id
      );
      if (!dispute) throw new NotFoundError('Dispute not found');
      logger.info('Dispute resolved', { disputeId: dispute.id, adminId: req.admin.id });
      success(res, dispute);
    }));

  return router;
}
