/**
 * Integration tests for admin booking management routes.
 *
 * @module routes/admin/bookings.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken } from '../../testSetup.js';

vi.mock('../../db/repositories/admin/bookings.js', () => ({
  listAll: vi.fn(),
  getById: vi.fn(),
  cancel: vi.fn(),
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

const booking = { id: 1, spot_id: 1, driver_name: 'John', status: 'reserved', confirmation_code: 'ABC123' };
const auth = { Authorization: `Bearer ${adminToken}` };

describe('GET /api/admin/bookings', () => {
  it('lists bookings with pagination', async () => {
    adminBookingsRepo.listAll.mockResolvedValue({ bookings: [booking], total: 1 });
    const res = await request(app).get('/api/admin/bookings').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by status', async () => {
    adminBookingsRepo.listAll.mockResolvedValue({ bookings: [booking], total: 1 });
    await request(app).get('/api/admin/bookings?status=reserved').set(auth);
    expect(adminBookingsRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reserved' }),
    );
  });
});

describe('GET /api/admin/bookings/:id', () => {
  it('returns booking details', async () => {
    adminBookingsRepo.getById.mockResolvedValue(booking);
    const res = await request(app).get('/api/admin/bookings/1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.confirmation_code).toBe('ABC123');
  });

  it('returns 404 for unknown booking', async () => {
    adminBookingsRepo.getById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/bookings/999').set(auth);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/bookings/:id/cancel', () => {
  it('cancels a booking', async () => {
    adminBookingsRepo.cancel.mockResolvedValue({ ...booking, status: 'cancelled' });
    const res = await request(app).post('/api/admin/bookings/1/cancel').set(auth);
    expect(res.status).toBe(200);
  });
});


