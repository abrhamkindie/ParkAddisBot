/**
 * Admin user management routes.
 *
 * All routes require authentication.
 * Mounted at `/api/admin/users`.
 *
 * @module routes/admin/users
 */
import { Router } from 'express';
import * as adminUsersRepo from '../../db/repositories/admin/users.js';
import { authenticate } from '../../middlewares/auth.js';
import { success, paginated } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/errorHandler.js';
import { validate } from '../../middlewares/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as schemas from '../../utils/schemas.js';

/**
 * Creates the admin users router.
 * @returns {import('express').Router}
 */
export function createAdminUsersRouter() {
  const router = Router();

  router.use(authenticate);

  // List users (?role=host&isBanned=false&limit=20&offset=0)
  router.get('/',
    validate({ query: schemas.userListQuery }),
    asyncHandler(async (req, res) => {
      const { role, isBanned, limit, offset } = req.query;
      const result = await adminUsersRepo.listAll({
        role,
        isBanned: isBanned !== undefined ? isBanned === 'true' : undefined,
        limit,
        offset,
      });
      paginated(res, result.users, { total: result.total, limit, offset });
    }));

  // User details
  router.get('/:id',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const user = await adminUsersRepo.getById(req.params.id);
      if (!user) throw new NotFoundError('User not found');
      success(res, user);
    }));

  // Ban user
  router.post('/:id/ban',
    validate({ params: schemas.idParam, body: schemas.banUserBody }),
    asyncHandler(async (req, res) => {
      const { reason } = req.body;
      const user = await adminUsersRepo.ban(req.params.id, reason);
      if (!user) throw new NotFoundError('User not found');
      logger.info('User banned', { userId: user.id, adminId: req.admin.id });
      success(res, user);
    }));

  // Unban user
  router.post('/:id/unban',
    validate({ params: schemas.idParam }),
    asyncHandler(async (req, res) => {
      const user = await adminUsersRepo.unban(req.params.id);
      if (!user) throw new NotFoundError('User not found');
      logger.info('User unbanned', { userId: user.id, adminId: req.admin.id });
      success(res, user);
    }));

  // Change role
  router.put('/:id/role',
    validate({ params: schemas.idParam, body: schemas.setUserRoleBody }),
    asyncHandler(async (req, res) => {
      const { role } = req.body;
      const user = await adminUsersRepo.setRole(req.params.id, role);
      if (!user) throw new NotFoundError('User not found');
      logger.info('User role changed', { userId: user.id, role, adminId: req.admin.id });
      success(res, user);
    }));

  return router;
}
