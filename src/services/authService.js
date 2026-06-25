import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import * as adminRepo from '../db/repositories/admin.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = config.jwtExpiry || '24h';

// Hash a password with bcrypt.
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compare password with hash.
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Admin login: validate credentials and return JWT token.
export async function login({ email, password }) {
  const admin = await adminRepo.getByEmail(email);
  
  if (!admin) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const validPassword = await comparePassword(password, admin.password_hash);
  
  if (!validPassword) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // Generate JWT token
  const token = jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
    config.jwtSecret,
    { expiresIn: JWT_EXPIRY }
  );

  // Update last login
  await adminRepo.updateLastLogin(admin.id);

  logger.info('Admin login successful', { adminId: admin.id, email: admin.email });

  return {
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  };
}

// Verify and decode a JWT token.
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error('INVALID_TOKEN');
  }
}
