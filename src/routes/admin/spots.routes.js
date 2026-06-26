/**
 * Admin spot management routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/spots`.
 *
 * @module routes/admin/spots
 */
import { Router } from 'express';
import * as adminSpotsRepo from '../../db/repositories/admin/spots.js';
import { authenticate } from '../../middlewares/auth.js';
import { success, paginated } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin spots router.
 * @returns {import('express').Router}
 */
export function createAdminSpotsRouter() {
  const router = Router();

  // All spot routes require authentication
  router.use(authenticate);

  // List spots (?status=pending_approval&limit=20&offset=0)
  router.get('/',
    validate({ query: schemas.spotListQuery }),
    asyncHandler(async (req, res) => {
      const { status, limit, offset } = req.query;
      const result = await adminSpotsRepo.listAll({ status, limit, offset });
      paginated(res, result.spots, { total: result.total, limit, offset });
    }));

  // Spot details
  router.get('/:id',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const spot = await adminSpotsRepo.getById(req.params.id);
      if (!spot) throw new NotFoundError('Spot not found');
      success(res, spot);
    }));

  // Approve spot
  router.post('/:id/approve',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const spot = await adminSpotsRepo.approve(req.params.id);
      if (!spot) throw new NotFoundError('Spot not found');
      logger.info('Spot approved', { spotId: spot.id, adminId: req.admin.id });
      success(res, spot);
    }));

  // Reject spot
  router.post('/:id/reject',
    validate({ params: schemas.idParam, body: schemas.rejectSpotBody }),
    asyncHandler(async (req, res) => {
      const { reason } = req.body;
      const spot = await adminSpotsRepo.reject(req.params.id, reason);
      if (!spot) throw new NotFoundError('Spot not found');
      logger.info('Spot rejected', { spotId: spot.id, adminId: req.admin.id });
      success(res, spot);
    }));

  // Suspend spot
  router.post('/:id/suspend',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const spot = await adminSpotsRepo.suspend(req.params.id);
      if (!spot) throw new NotFoundError('Spot not found');
      logger.info('Spot suspended', { spotId: spot.id, adminId: req.admin.id });
      success(res, spot);
    }));

  // Update price
  router.put('/:id/price',
    validate({ params: schemas.idParam, body: schemas.updateSpotPriceBody }),
    asyncHandler(async (req, res) => {
      const { price } = req.body;
      const spot = await adminSpotsRepo.updatePrice(req.params.id, price);
      if (!spot) throw new NotFoundError('Spot not found');
      logger.info('Spot price updated', { spotId: spot.id, price, adminId: req.admin.id });
      success(res, spot);
    }));

  return router;
}
