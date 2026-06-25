import { verifyToken } from '../services/authService.js';
import * as adminRepo from '../db/repositories/admin.js';
import { logger } from '../utils/logger.js';

// Authenticate middleware: verify JWT from Authorization header.
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Fetch admin from DB to ensure still active
    const admin = await adminRepo.getById(decoded.id);
    
    if (!admin || !admin.is_active) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin account not found or deactivated',
        },
      });
    }

    // Attach admin to request
    req.admin = admin;
    next();
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired, please login again',
        },
      });
    }
    
    if (err.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token',
        },
      });
    }

    logger.error('Auth middleware error', { error: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
    });
  }
}

// Authorize role middleware: check if admin has required role.
export function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
}
