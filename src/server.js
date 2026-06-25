/**
 * ParkAddis Express Server
 * 
 * REST API Endpoints:
 * 
 * Public:
 * - GET  /health                    - Health check
 * - GET  /ready                     - Readiness check (DB health)
 * - GET  /api/spots/nearby          - Nearby spots (for Mini App)
 * - POST /api/payments/chapa/webhook - Chapa payment webhook
 * 
 * Admin API (requires JWT token in Authorization header):
 * - POST /api/admin/login           - Admin login
 * - POST /api/admin/register        - Bootstrap first admin (dev only)
 * 
 * Spots:
 * - GET    /api/admin/spots         - List spots (?status=pending_approval&limit=20&offset=0)
 * - GET    /api/admin/spots/:id     - Spot details
 * - POST   /api/admin/spots/:id/approve    - Approve spot
 * - POST   /api/admin/spots/:id/reject     - Reject spot
 * - POST   /api/admin/spots/:id/suspend    - Suspend spot
 * - PUT    /api/admin/spots/:id/price      - Update price
 * 
 * Bookings & Payments:
 * - GET    /api/admin/bookings      - List bookings (?status=reserved&paymentStatus=paid)
 * - GET    /api/admin/bookings/:id  - Booking details
 * - POST   /api/admin/bookings/:id/cancel  - Cancel booking
 * - GET    /api/admin/payments      - List payments
 * - POST   /api/admin/payments/:id/refund  - Refund payment
 * 
 * Finance:
 * - GET    /api/admin/finance/balances           - Host payout balances
 * - POST   /api/admin/finance/payouts            - Create payout
 * - POST   /api/admin/finance/payouts/:id/sent   - Mark payout sent
 * 
 * Disputes:
 * - GET    /api/admin/disputes                    - List disputes
 * - GET    /api/admin/disputes/:id                - Dispute details
 * - POST   /api/admin/disputes/:id/resolve        - Resolve dispute
 * 
 * Users:
 * - GET    /api/admin/users         - List users (?role=host&isBanned=false)
 * - GET    /api/admin/users/:id     - User details
 * - POST   /api/admin/users/:id/ban   - Ban user
 * - POST   /api/admin/users/:id/unban - Unban user
 * - PUT    /api/admin/users/:id/role  - Change role
 * 
 * Analytics:
 * - GET /api/admin/analytics/overview    - Platform stats
 * - GET /api/admin/analytics/revenue     - Revenue trends (?period=day|week|month)
 * - GET /api/admin/analytics/bookings    - Booking statistics
 * - GET /api/admin/analytics/top-spots   - Top spots (?limit=10)
 * - GET /api/admin/analytics/activity    - Recent activity (?limit=20)
 * 
 * Ratings:
 * - GET    /api/admin/ratings            - List ratings (?spotId=&hostId=&limit=&offset=)
 * - GET    /api/admin/ratings/stats/spot/:spotId  - Spot rating stats
 * - GET    /api/admin/ratings/:id        - Rating details
 * - DELETE /api/admin/ratings/:id        - Remove rating (superadmin only)
 * 
 * Usage Example:
 *   curl -X POST http://localhost:3000/api/admin/login \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"admin@parkaddis.com","password":"secret"}'
 *   
 *   curl -X GET http://localhost:3000/api/admin/spots \
 *     -H "Authorization: Bearer YOUR_TOKEN_HERE"
 */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { healthcheck } from './db/index.js';
import * as spotsRepo from './db/repositories/spots.js';
import * as adminRepo from './db/repositories/admin.js';
import * as adminSpotsRepo from './db/repositories/admin/spots.js';
import * as adminBookingsRepo from './db/repositories/admin/bookings.js';
import * as adminFinanceRepo from './db/repositories/admin/finance.js';
import * as adminUsersRepo from './db/repositories/admin/users.js';
import * as analyticsRepo from './db/repositories/admin/analytics.js';
import * as ratingsRepo from './db/repositories/ratings.js';
import { login, hashPassword } from './services/authService.js';
import { authenticate, authorizeRole } from './middlewares/auth.js';
import { handleWebhook } from './services/chapaService.js';
import { confirmChapaPayment, sendPaymentReceipt } from './services/paymentService.js';
import { getTranslator } from './i18n/index.js';
import { logger } from './utils/logger.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const miniappDir = join(__dirname, 'miniapp');

// Express app: health/readiness, the Mini App (static), and a read-only spots API
// the Mini App map calls. Admin REST + payments are added in later steps.
export function createServer(bot) {
  const app = express();

  // ---- Security Middleware ----
  // Helmet: Set various HTTP security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://router.project-osrm.org", "https://*.openstreetmap.org"],
        frameSrc: ["'self'", "https://t.me"],
      },
    },
  }));

  // CORS: Configure allowed origins
  const corsOrigins = config.security?.corsOrigins || '*';
  app.use(cors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(o => o.trim()),
    credentials: true,
  }));

  // Rate Limiting: Prevent abuse
  const limiter = rateLimit({
    windowMs: config.security?.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
    max: config.security?.rateLimitMaxRequests || 100, // limit each IP to 100 requests per windowMs
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });
  app.use(limiter);

  // Stricter rate limit for admin endpoints
  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // limit admin to 50 requests per 15 minutes
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many admin requests, please try again later.' } },
  });
  app.use('/api/admin', adminLimiter);

  app.use(express.json());

  // Request logging middleware (skip health checks)
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // Start notification scheduler if enabled
  if (config.notifications?.enabled !== false) {
    startScheduler(bot);
  } else {
    logger.info('Notification scheduler disabled');
  }

  app.get('/health', (req, res) => {
    res.json({ ok: true, app: config.appName, env: config.env });
  });

  app.get('/ready', async (req, res) => {
    try {
      const dbOk = await healthcheck();
      res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk });
    } catch (err) {
      logger.error('readiness check failed', { error: err.message });
      res.status(503).json({ ok: false, db: false });
    }
  });

  // Read-only nearby spots for the Mini App map. Public (parking data is public);
  // same-origin as the static app, so no CORS/auth needed in this phase.
  app.get('/api/spots/nearby', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusM = Number(req.query.radius) || config.search.defaultRadiusM;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }
    try {
      let spots = await spotsRepo.findNearby({ lat, lng, radiusM, limit: config.search.maxResults });
      let fallback = false;
      if (!spots.length) {
        spots = await spotsRepo.findNearestAny({ lat, lng, limit: config.search.maxResults });
        fallback = true;
      }
      res.json({
        fallback,
        spots: spots.map((s) => ({
          id: Number(s.id),
          address: s.address,
          price_per_hour: Number(s.price_per_hour),
          lat: Number(s.lat),
          lng: Number(s.lng),
          distance_m: s.distance_m != null ? Math.round(Number(s.distance_m)) : null,
          rating_avg: Number(s.rating_avg),
          rating_count: Number(s.rating_count),
          covered: s.covered,
          guarded: s.guarded,
          ev_charging: s.ev_charging,
        })),
      });
    } catch (err) {
      logger.error('api nearby failed', { error: err.message });
      res.status(500).json({ error: 'server error' });
    }
  });

  // Telegram Mini App (map). Served at /miniapp/.
  app.use('/miniapp', express.static(miniappDir));

  // ============================================================
  // ADMIN API ROUTES
  // ============================================================

  // --- Authentication ---

  // Admin login
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Email and password are required' } });
      }
      const result = await login({ email, password });
      res.json(result);
    } catch (err) {
      if (err.message === 'INVALID_CREDENTIALS') {
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
      }
      logger.error('Admin login error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Login failed' } });
    }
  });

  // Bootstrap first admin (dev only)
  app.post('/api/admin/register', async (req, res) => {
    if (config.env === 'production') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Registration disabled in production' } });
    }
    try {
      const { email, password, name, role } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Email and password are required' } });
      }
      const existing = await adminRepo.getByEmail(email);
      if (existing) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Admin already exists' } });
      }
      const passwordHash = await hashPassword(password);
      const admin = await adminRepo.createAdmin({ email, passwordHash, name: name || email, role: role || 'admin' });
      logger.info('Admin registered', { adminId: admin.id, email: admin.email });
      res.status(201).json({ data: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
    } catch (err) {
      logger.error('Admin registration error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } });
    }
  });

  // --- Spot Management ---

  app.get('/api/admin/spots', authenticate, async (req, res) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;
      const result = await adminSpotsRepo.listAll({ status, limit: parseInt(limit), offset: parseInt(offset) });
      res.json({ data: result.spots, pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) } });
    } catch (err) {
      logger.error('List spots error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list spots' } });
    }
  });

  app.get('/api/admin/spots/:id', authenticate, async (req, res) => {
    try {
      const spot = await adminSpotsRepo.getById(parseInt(req.params.id));
      if (!spot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spot not found' } });
      res.json({ data: spot });
    } catch (err) {
      logger.error('Get spot error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get spot' } });
    }
  });

  app.post('/api/admin/spots/:id/approve', authenticate, async (req, res) => {
    try {
      const spot = await adminSpotsRepo.approve(parseInt(req.params.id));
      if (!spot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spot not found' } });
      logger.info('Spot approved', { spotId: spot.id, adminId: req.admin.id });
      res.json({ data: spot });
    } catch (err) {
      logger.error('Approve spot error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to approve spot' } });
    }
  });

  app.post('/api/admin/spots/:id/reject', authenticate, async (req, res) => {
    try {
      const { reason } = req.body;
      const spot = await adminSpotsRepo.reject(parseInt(req.params.id), reason);
      if (!spot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spot not found' } });
      logger.info('Spot rejected', { spotId: spot.id, adminId: req.admin.id });
      res.json({ data: spot });
    } catch (err) {
      logger.error('Reject spot error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to reject spot' } });
    }
  });

  app.post('/api/admin/spots/:id/suspend', authenticate, async (req, res) => {
    try {
      const spot = await adminSpotsRepo.suspend(parseInt(req.params.id));
      if (!spot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spot not found' } });
      logger.info('Spot suspended', { spotId: spot.id, adminId: req.admin.id });
      res.json({ data: spot });
    } catch (err) {
      logger.error('Suspend spot error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to suspend spot' } });
    }
  });

  app.put('/api/admin/spots/:id/price', authenticate, async (req, res) => {
    try {
      const { price } = req.body;
      if (!price || price <= 0) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid price' } });
      const spot = await adminSpotsRepo.updatePrice(parseInt(req.params.id), price);
      if (!spot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spot not found' } });
      logger.info('Spot price updated', { spotId: spot.id, price, adminId: req.admin.id });
      res.json({ data: spot });
    } catch (err) {
      logger.error('Update price error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update price' } });
    }
  });

  // --- Booking & Payment Management ---

  app.get('/api/admin/bookings', authenticate, async (req, res) => {
    try {
      const { status, paymentStatus, dateFrom, dateTo, limit = 20, offset = 0 } = req.query;
      const result = await adminBookingsRepo.listAll({ status, paymentStatus, dateFrom, dateTo, limit: parseInt(limit), offset: parseInt(offset) });
      res.json({ data: result.bookings, pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) } });
    } catch (err) {
      logger.error('List bookings error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list bookings' } });
    }
  });

  app.get('/api/admin/bookings/:id', authenticate, async (req, res) => {
    try {
      const booking = await adminBookingsRepo.getById(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } });
      res.json({ data: booking });
    } catch (err) {
      logger.error('Get booking error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get booking' } });
    }
  });

  app.post('/api/admin/bookings/:id/cancel', authenticate, async (req, res) => {
    try {
      const { reason } = req.body;
      const booking = await adminBookingsRepo.cancel(parseInt(req.params.id), reason);
      if (!booking) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } });
      logger.info('Booking cancelled', { bookingId: booking.id, adminId: req.admin.id });
      res.json({ data: booking });
    } catch (err) {
      logger.error('Cancel booking error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel booking' } });
    }
  });

  app.get('/api/admin/payments', authenticate, async (req, res) => {
    try {
      const { status, method, limit = 20, offset = 0 } = req.query;
      const result = await adminBookingsRepo.listPayments({ status, method, limit: parseInt(limit), offset: parseInt(offset) });
      res.json({ data: result.payments, pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) } });
    } catch (err) {
      logger.error('List payments error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list payments' } });
    }
  });

  app.post('/api/admin/payments/:id/refund', authenticate, async (req, res) => {
    try {
      const payment = await adminBookingsRepo.refundPayment(parseInt(req.params.id));
      if (!payment) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payment not found' } });
      logger.info('Payment refunded', { paymentId: payment.id, adminId: req.admin.id });
      res.json({ data: payment });
    } catch (err) {
      logger.error('Refund payment error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to refund payment' } });
    }
  });

  // --- Finance Management ---

  app.get('/api/admin/finance/balances', authenticate, async (req, res) => {
    try {
      const balances = await adminFinanceRepo.getHostBalances();
      res.json({ data: balances });
    } catch (err) {
      logger.error('Get balances error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get balances' } });
    }
  });

  app.post('/api/admin/finance/payouts', authenticate, async (req, res) => {
    try {
      const { hostId, amount, note } = req.body;
      if (!hostId || !amount || amount <= 0) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid payout data' } });
      const payout = await adminFinanceRepo.createPayout({ hostId, amount, note, markedBy: req.admin.id });
      logger.info('Payout created', { payoutId: payout.id, adminId: req.admin.id });
      res.status(201).json({ data: payout });
    } catch (err) {
      logger.error('Create payout error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create payout' } });
    }
  });

  app.post('/api/admin/finance/payouts/:id/sent', authenticate, async (req, res) => {
    try {
      const payout = await adminFinanceRepo.markPayoutSent(parseInt(req.params.id));
      if (!payout) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payout not found' } });
      logger.info('Payout marked sent', { payoutId: payout.id, adminId: req.admin.id });
      res.json({ data: payout });
    } catch (err) {
      logger.error('Mark payout sent error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to mark payout' } });
    }
  });

  // --- Dispute Management ---

  app.get('/api/admin/disputes', authenticate, async (req, res) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;
      const result = await adminFinanceRepo.listDisputes({ status, limit: parseInt(limit), offset: parseInt(offset) });
      res.json({ data: result.disputes, pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) } });
    } catch (err) {
      logger.error('List disputes error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list disputes' } });
    }
  });

  app.get('/api/admin/disputes/:id', authenticate, async (req, res) => {
    try {
      const dispute = await adminFinanceRepo.getDisputeById(parseInt(req.params.id));
      if (!dispute) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dispute not found' } });
      res.json({ data: dispute });
    } catch (err) {
      logger.error('Get dispute error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dispute' } });
    }
  });

  app.post('/api/admin/disputes/:id/resolve', authenticate, async (req, res) => {
    try {
      const { resolution } = req.body;
      const dispute = await adminFinanceRepo.resolveDispute(parseInt(req.params.id), resolution, req.admin.id);
      if (!dispute) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Dispute not found' } });
      logger.info('Dispute resolved', { disputeId: dispute.id, adminId: req.admin.id });
      res.json({ data: dispute });
    } catch (err) {
      logger.error('Resolve dispute error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve dispute' } });
    }
  });

  // --- User Management ---

  app.get('/api/admin/users', authenticate, async (req, res) => {
    try {
      const { role, isBanned, limit = 20, offset = 0 } = req.query;
      const result = await adminUsersRepo.listAll({ role, isBanned: isBanned !== undefined ? isBanned === 'true' : undefined, limit: parseInt(limit), offset: parseInt(offset) });
      res.json({ data: result.users, pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) } });
    } catch (err) {
      logger.error('List users error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list users' } });
    }
  });

  app.get('/api/admin/users/:id', authenticate, async (req, res) => {
    try {
      const user = await adminUsersRepo.getById(parseInt(req.params.id));
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      res.json({ data: user });
    } catch (err) {
      logger.error('Get user error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get user' } });
    }
  });

  app.post('/api/admin/users/:id/ban', authenticate, async (req, res) => {
    try {
      const { reason } = req.body;
      const user = await adminUsersRepo.ban(parseInt(req.params.id), reason);
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      logger.info('User banned', { userId: user.id, adminId: req.admin.id });
      res.json({ data: user });
    } catch (err) {
      logger.error('Ban user error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to ban user' } });
    }
  });

  app.post('/api/admin/users/:id/unban', authenticate, async (req, res) => {
    try {
      const user = await adminUsersRepo.unban(parseInt(req.params.id));
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      logger.info('User unbanned', { userId: user.id, adminId: req.admin.id });
      res.json({ data: user });
    } catch (err) {
      logger.error('Unban user error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to unban user' } });
    }
  });

  app.put('/api/admin/users/:id/role', authenticate, async (req, res) => {
    try {
      const { role } = req.body;
      if (!['driver', 'host', 'admin'].includes(role)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid role' } });
      const user = await adminUsersRepo.setRole(parseInt(req.params.id), role);
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      logger.info('User role changed', { userId: user.id, role, adminId: req.admin.id });
      res.json({ data: user });
    } catch (err) {
      logger.error('Update role error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update role' } });
    }
  });

  // --- Analytics ---

  app.get('/api/admin/analytics/overview', authenticate, async (req, res) => {
    try {
      const stats = await analyticsRepo.getPlatformStats();
      res.json({ data: stats });
    } catch (err) {
      logger.error('Get overview error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get overview' } });
    }
  });

  app.get('/api/admin/analytics/revenue', authenticate, async (req, res) => {
    try {
      const { period } = req.query;
      const stats = await analyticsRepo.getRevenueStats({ period });
      res.json({ data: stats });
    } catch (err) {
      logger.error('Get revenue error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get revenue' } });
    }
  });

  app.get('/api/admin/analytics/bookings', authenticate, async (req, res) => {
    try {
      const [bookingStats, paymentStats] = await Promise.all([analyticsRepo.getBookingStats(), analyticsRepo.getPaymentMethodStats()]);
      res.json({ data: { byStatus: bookingStats, byPaymentMethod: paymentStats } });
    } catch (err) {
      logger.error('Get booking stats error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } });
    }
  });

  app.get('/api/admin/analytics/top-spots', authenticate, async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      const spots = await analyticsRepo.getTopSpots(parseInt(limit));
      res.json({ data: spots });
    } catch (err) {
      logger.error('Get top spots error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get top spots' } });
    }
  });

  app.get('/api/admin/analytics/activity', authenticate, async (req, res) => {
    try {
      const { limit = 20 } = req.query;
      const activity = await analyticsRepo.getRecentActivity(parseInt(limit));
      res.json({ data: activity });
    } catch (err) {
      logger.error('Get activity error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get activity' } });
    }
  });

  // --- Admin Ratings ---
  app.get('/api/admin/ratings', authenticate, async (req, res) => {
    try {
      const { spotId, hostId, limit = 20, offset = 0 } = req.query;
      let result;

      if (spotId) {
        result = await ratingsRepo.listBySpot(parseInt(spotId), parseInt(limit), parseInt(offset));
      } else if (hostId) {
        result = await ratingsRepo.listByHost(parseInt(hostId), parseInt(limit), parseInt(offset));
      } else {
        result = { ratings: [], total: 0 };
      }

      res.json({
        data: result.ratings,
        pagination: {
          total: result.total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (err) {
      logger.error('List ratings error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list ratings' } });
    }
  });

  app.get('/api/admin/ratings/stats/spot/:spotId', authenticate, async (req, res) => {
    try {
      const { spotId } = req.params;
      const stats = await ratingsRepo.getSpotRatingStats(parseInt(spotId));
      res.json({ data: stats });
    } catch (err) {
      logger.error('Get rating stats error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } });
    }
  });

  app.get('/api/admin/ratings/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const rating = await ratingsRepo.getById(parseInt(id));
      if (!rating) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rating not found' } });
      }
      res.json({ data: rating });
    } catch (err) {
      logger.error('Get rating error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get rating' } });
    }
  });

  app.delete('/api/admin/ratings/:id', authenticate, authorizeRole(['superadmin']), async (req, res) => {
    try {
      const { id } = req.params;
      const rating = await ratingsRepo.deleteById(parseInt(id));
      if (!rating) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rating not found' } });
      }
      logger.info('Rating deleted by admin', { ratingId: id, adminId: req.admin.id });
      res.json({ success: true });
    } catch (err) {
      logger.error('Delete rating error', { error: err.message });
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete rating' } });
    }
  });

  // --- Chapa Webhook ---
  // Chapa calls this when a payment completes (success or failure).
  app.post('/api/payments/chapa/webhook', async (req, res) => {
    try {
      logger.info('Chapa webhook received', { body: req.body });

      // Parse and validate webhook payload
      const webhookEvent = handleWebhook(req.body, config.chapa.webhookSecret);

      // Only process successful payments
      if (webhookEvent.event === 'charge.success') {
        try {
          const { booking, payment } = await confirmChapaPayment(webhookEvent.tx_ref);

          // Send receipt and QR to user via bot
          if (bot && booking.driver_telegram_id) {
            const ctx = {
              reply: async (text, extra) => {
                await bot.api.sendMessage(Number(booking.driver_telegram_id), text, extra);
              },
              replyWithPhoto: async (photo, extra) => {
                await bot.api.sendPhoto(Number(booking.driver_telegram_id), photo, extra);
              },
              dbUser: {
                language_pref: booking.driver_language_pref || 'en',
              },
            };

            await sendPaymentReceipt(ctx, booking, payment);
          }

          logger.info('Chapa payment confirmed and receipt sent', {
            bookingId: booking.id,
            confirmationCode: booking.confirmation_code,
          });
        } catch (err) {
          logger.error('Failed to confirm Chapa payment', {
            error: err.message,
            txRef: webhookEvent.tx_ref,
          });
        }
      }

      // Always return 200 to Chapa
      res.status(200).json({ success: true });
    } catch (err) {
      logger.error('Chapa webhook error', { error: err.message });
      res.status(200).json({ success: true }); // Still return 200 to prevent retries
    }
  });

  return { app, stopScheduler };
}
