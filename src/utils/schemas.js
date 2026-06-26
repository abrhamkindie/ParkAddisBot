/**
 * Zod validation schemas for all API route inputs.
 *
 * Each schema validates one input source: body, query, or params.
 * Use with the `validate()` middleware from middlewares/validate.js.
 *
 * Example:
 *   router.post('/login', validate({ body: schemas.login }), handler);
 *   router.get('/spots', validate({ query: schemas.pagination }), handler);
 *   router.get('/spots/:id', validate({ params: schemas.idParam }), handler);
 *
 * @module schemas
 */

import { z } from 'zod';

// ── Shared primitives ──────────────────────────────────────────────────────

/**
 * Generic ID path parameter — coerces a string path segment to a positive integer.
 * @example { id: "42" } → { id: 42 }
 */
export const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Spot ID path parameter — for nested routes like /ratings/stats/spot/:spotId.
 * @example { spotId: "7" } → { spotId: 7 }
 */
export const spotIdParam = z.object({
  spotId: z.coerce.number().int().positive(),
});

/**
 * @typedef {Object} PaginationFields
 * @property {number} limit - Results per page (1–100, default 20)
 * @property {number} offset - Offset from start (0+, default 0)
 */

/** @type {PaginationFields} Standard pagination query params, spread into list schemas. */
export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

// ── Auth ───────────────────────────────────────────────────────────────────

/** Validates POST /api/admin/login body: email + password. */
export const login = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

/** Validates POST /api/admin/register body: email, password (min 6), optional name and role. */
export const register = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
  role: z.enum(['admin', 'superadmin']).optional(),
});

// ── Public ─────────────────────────────────────────────────────────────────

/** Validates GET /api/spots/nearby query: lat (±90), lng (±180), optional radius (meters). */
export const nearbySpots = z.object({
  lat: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  lng: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  radius: z.coerce.number().int().positive().optional(),
});

// ── Admin: Spots ──────────────────────────────────────────────────────────

/** Validates GET /api/admin/spots query: optional status filter + pagination. */
export const spotListQuery = z.object({
  status: z.string().optional(),
  ...pagination,
});

/** Validates POST /api/admin/spots/:id/reject body: optional reason. */
export const rejectSpotBody = z.object({
  reason: z.string().optional(),
});

/** Validates PUT /api/admin/spots/:id/price body: price must be positive and ≤ 999,999. */
export const updateSpotPriceBody = z.object({
  price: z.coerce.number().positive('Price must be greater than 0').max(999999),
});

// ── Admin: Bookings ────────────────────────────────────────────────────────

/** Validates GET /api/admin/bookings query: optional status, paymentStatus, date range + pagination. */
export const bookingListQuery = z.object({
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  ...pagination,
});

/** Validates POST /api/admin/bookings/:id/cancel body: optional reason. */
export const cancelBookingBody = z.object({
  reason: z.string().optional(),
});

// ── Admin: Payments ────────────────────────────────────────────────────────

/** Validates GET /api/admin/payments query: optional status, payment method filter + pagination. */
export const paymentListQuery = z.object({
  status: z.string().optional(),
  method: z.string().optional(),
  ...pagination,
});

// ── Admin: Finance ─────────────────────────────────────────────────────────

/** Validates POST /api/admin/finance/payouts body: host ID (required), amount (positive), optional note. */
export const createPayoutBody = z.object({
  hostId: z.coerce.number().int().positive('Host ID is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  note: z.string().optional(),
});

// ── Admin: Users ───────────────────────────────────────────────────────────

/** Validates GET /api/admin/users query: optional role, isBanned filter + pagination. */
export const userListQuery = z.object({
  role: z.string().optional(),
  isBanned: z.string().optional(),
  ...pagination,
});

/** Validates POST /api/admin/users/:id/ban body: optional reason. */
export const banUserBody = z.object({
  reason: z.string().optional(),
});

/** Validates PUT /api/admin/users/:id/role body: role must be one of driver, host, or admin. */
export const setUserRoleBody = z.object({
  role: z.enum(['driver', 'host', 'admin'], {
    errorMap: () => ({ message: 'Role must be driver, host, or admin' }),
  }),
});

// ── Admin: Analytics ───────────────────────────────────────────────────────

/** Validates GET /api/admin/analytics/revenue query: optional period (day|week|month). */
export const revenueQuery = z.object({
  period: z.enum(['day', 'week', 'month']).optional(),
});

/** Validates GET /api/admin/analytics/top-spots query: optional limit (1–100, default 10). */
export const topSpotsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/** Validates GET /api/admin/analytics/activity query: optional limit (1–100, default 20). */
export const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Admin: Ratings ─────────────────────────────────────────────────────────

/** Validates GET /api/admin/ratings query: optional spotId, hostId filters + pagination. */
export const ratingListQuery = z.object({
  spotId: z.coerce.number().int().positive().optional(),
  hostId: z.coerce.number().int().positive().optional(),
  ...pagination,
});

// ── Admin: Disputes ────────────────────────────────────────────────────────

/** Validates GET /api/admin/disputes query: optional status filter + pagination. */
export const disputeListQuery = z.object({
  status: z.string().optional(),
  ...pagination,
});

/** Validates POST /api/admin/disputes/:id/resolve body: resolution text is required. */
export const resolveDisputeBody = z.object({
  resolution: z.string().min(1, 'Resolution is required'),
});

// ── Webhook ────────────────────────────────────────────────────────────────

/** Validates POST /api/payments/chapa/webhook body: event and tx_ref are required. */
export const chapaWebhookBody = z.object({
  event: z.string(),
  tx_ref: z.string(),
  status: z.string().optional(),
  amount: z.string().optional(),
});
