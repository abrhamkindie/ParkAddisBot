/**
 * @file Authentication & authorization Express middleware.
 *
 * @example
 * import { Router } from 'express';
 * import { authenticate, authorizeRole } from '../middlewares/auth.js';
 *
 * const router = Router();
 * router.get('/spots', authenticate, handler);
 * router.delete('/ratings/:id', authenticate, authorizeRole('superadmin'), handler);
 */

import { verifyToken } from '../services/authService.js';
import * as adminRepo from '../db/repositories/admin.js';
import { logger } from '../utils/logger.js';
import { UnauthorizedError, ForbiddenError, InternalError } from '../utils/errors.js';

/**
 * Express middleware that verifies a JWT from the `Authorization: Bearer <token>`
 * header, fetches the admin from the database, and attaches it to `req.admin`.
 *
 * Delegates errors to `next(err)` which the global error handler catches and
 * returns as a standard error envelope.
 *
 * @type {import('express').RequestHandler}
 */
export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const admin = await adminRepo.getById(decoded.id);

    if (!admin || !admin.is_active) {
      throw new UnauthorizedError('Admin account not found or deactivated');
    }

    req.admin = admin;
    next();
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      return next(new UnauthorizedError('Token has expired, please login again'));
    }
    if (err.message === 'INVALID_TOKEN') {
      return next(new UnauthorizedError('Invalid token'));
    }
    if (err.name === 'UnauthorizedError' || err.name === 'AppError') {
      return next(err);
    }
    logger.error('Auth middleware error', { error: err.message });
    return next(new InternalError('Authentication failed'));
  }
}

/**
 * Express middleware factory that restricts access to admins with one of the
 * given roles. Must be used **after** `authenticate`.
 *
 * @param {...string} allowedRoles Role names permitted to access the route.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.delete('/ratings/:id', authenticate, authorizeRole('superadmin'), handler);
 */
export function authorizeRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.admin) {
      return next(new UnauthorizedError('Not authenticated'));
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}
