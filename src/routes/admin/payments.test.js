/**
 * Integration tests for admin payment management routes.
 *
 * @module routes/admin/payments.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken } from '../../testSetup.js';

vi.mock('../../db/repositories/admin/bookings.js', () => ({
  listPayments: vi.fn(),
  refundPayment: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  verifyToken: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin' })),
}));

vi.mock('../../db/repositories/admin.js', () => ({
  getById: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin', is_active: true })),
}));

import * as adminBookingsRepo from '../../db/repositories/admin/bookings.js';

let app;
beforeEach(() => {
  vi.clearAllMocks();
  app = createTestServer().app;
});

const auth = { Authorization: `Bearer ${adminToken}` };
const payment = { id: 1, booking_id: 10, amount: 500, status: 'paid', method: 'chapa' };

describe('GET /api/admin/payments', () => {
  it('lists payments with pagination', async () => {
    adminBookingsRepo.listPayments.mockResolvedValue({ payments: [payment], total: 1 });
    const res = await request(app).get('/api/admin/payments').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination.total).toBe(1);
  });

  it('filters by status', async () => {
    adminBookingsRepo.listPayments.mockResolvedValue({ payments: [payment], total: 1 });
    await request(app).get('/api/admin/payments?status=paid').set(auth);
    expect(adminBookingsRepo.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paid' }),
    );
  });

  it('filters by payment method', async () => {
    adminBookingsRepo.listPayments.mockResolvedValue({ payments: [payment], total: 1 });
    await request(app).get('/api/admin/payments?method=chapa').set(auth);
    expect(adminBookingsRepo.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'chapa' }),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/admin/payments');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/payments/:id/refund', () => {
  it('refunds a payment', async () => {
    adminBookingsRepo.refundPayment.mockResolvedValue({ id: 1, status: 'refunded' });
    const res = await request(app).post('/api/admin/payments/1/refund').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('refunded');
  });

  it('returns 404 for unknown payment', async () => {
    adminBookingsRepo.refundPayment.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/payments/999/refund').set(auth);
    expect(res.status).toBe(404);
  });

  it('returns 422 for non-numeric ID', async () => {
    const res = await request(app).post('/api/admin/payments/abc/refund').set(auth);
    expect(res.status).toBe(422);
  });
});
