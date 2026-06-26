/**
 * Integration test utilities — builds a lightweight Express app with mocked DB
 * repos and a JWT helper for authenticated routes.
 *
 * Usage in test files:
 * @example
 * import { createTestServer, adminToken } from '../../testSetup.js';
 * import request from 'supertest';
 *
 * const { app } = createTestServer();
 * const res = await request(app).get('/health');
 * expect(res.status).toBe(200);
 *
 * // Authenticated:
 * const res2 = await request(app)
 *   .get('/api/admin/spots')
 *   .set('Authorization', `Bearer ${adminToken}`);
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

// Import route factories directly (no mocked deps — each test file must mock
// its own DB repos via vi.mock at the top of the file before imports).
import { createPublicRouter } from './routes/public.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createAdminSpotsRouter } from './routes/admin/spots.routes.js';
import { createAdminBookingsRouter } from './routes/admin/bookings.routes.js';
import { createAdminPaymentsRouter } from './routes/admin/payments.routes.js';
import { createAdminFinanceRouter } from './routes/admin/finance.routes.js';
import { createAdminDisputesRouter } from './routes/admin/disputes.routes.js';
import { createAdminUsersRouter } from './routes/admin/users.routes.js';
import { createAdminAnalyticsRouter } from './routes/admin/analytics.routes.js';
import { createAdminRatingsRouter } from './routes/admin/ratings.routes.js';

// Shared JWT secret used across all tests (must match config mock).
const TEST_JWT_SECRET = 'test-jwt-secret-min-8-chars!!';

/** A valid JWT for an admin user — use with `Authorization: Bearer <token>`. */
export const adminToken = jwt.sign(
  { id: 1, email: 'admin@test.com', role: 'admin' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' },
);

/** A valid JWT for a superadmin user. */
export const superAdminToken = jwt.sign(
  { id: 2, email: 'super@test.com', role: 'superadmin' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' },
);

/**
 * Builds a minimal Express app for testing, without helmet/cors/rate-limit
 * middleware that would interfere with fast integration tests.
 *
 * Callers must `vi.mock()` the DB repos and auth service before importing
 * this module so the route factories pick up the mocks.
 */
export function createTestServer() {
  const app = express();
  app.use(express.json());

  // Public routes
  app.use(createPublicRouter());

  // Admin auth
  app.use('/api/admin', createAuthRouter());

  // Admin resources
  app.use('/api/admin/spots', createAdminSpotsRouter());
  app.use('/api/admin/bookings', createAdminBookingsRouter());
  app.use('/api/admin/payments', createAdminPaymentsRouter());
  app.use('/api/admin/finance', createAdminFinanceRouter());
  app.use('/api/admin/disputes', createAdminDisputesRouter());
  app.use('/api/admin/users', createAdminUsersRouter());
  app.use('/api/admin/analytics', createAdminAnalyticsRouter());
  app.use('/api/admin/ratings', createAdminRatingsRouter());

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app };
}
