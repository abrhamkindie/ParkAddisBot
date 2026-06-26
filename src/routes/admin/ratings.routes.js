/**
 * Admin ratings management routes.
 *
 * All routes require authentication. Delete requires `superadmin` role.
 * Mounted at `/api/admin/ratings`.
 *
 * @module routes/admin/ratings
 */
import { Router } from 'express';
import * as ratingsRepo from '../../db/repositories/ratings.js';
import { authenticate, authorizeRole } from '../../middlewares/auth.js';
import { success, paginated } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin ratings router.
 * @returns {import('express').Router}
 */
export function createAdminRatingsRouter() {
  const router = Router();

  router.use(authenticate);

  // List ratings (?spotId=&hostId=&limit=20&offset=0)
  router.get('/',
    validate({ query: schemas.ratingListQuery }),
    asyncHandler(async (req, res) => {
      const { spotId, hostId, limit, offset } = req.query;
      let result;

      if (spotId) {
        result = await ratingsRepo.listBySpot(spotId, limit, offset);
      } else if (hostId) {
        result = await ratingsRepo.listByHost(hostId, limit, offset);
      } else {
        result = { ratings: [], total: 0 };
      }

      paginated(res, result.ratings, { total: result.total, limit, offset });
    }));

  // Spot rating stats
  router.get('/stats/spot/:spotId',
    validate({ params: schemas.spotIdParam }),
    asyncHandler(async (req, res) => {
      const { spotId } = req.params;
      const stats = await ratingsRepo.getSpotRatingStats(spotId);
      success(res, stats);
    }));

  // Rating details
  router.get('/:id',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const rating = await ratingsRepo.getById(id);
      if (!rating) throw new NotFoundError('Rating not found');
      success(res, rating);
    }));

  // Delete rating (superadmin only)
  router.delete('/:id',
    authorizeRole(['superadmin']),
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const rating = await ratingsRepo.deleteById(id);
      if (!rating) throw new NotFoundError('Rating not found');
      logger.info('Rating deleted by admin', { ratingId: id, adminId: req.admin.id });
      success(res, { deleted: true });
    }));

  return router;
}
