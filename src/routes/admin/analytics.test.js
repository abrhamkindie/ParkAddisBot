/**
 * Integration tests for admin analytics routes.
 *
 * @module routes/admin/analytics.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken } from '../../testSetup.js';

vi.mock('../../db/repositories/admin/analytics.js', () => ({
  getPlatformStats: vi.fn(),
  getRevenueStats: vi.fn(),
  getBookingStats: vi.fn(),
  getPaymentMethodStats: vi.fn(),
  getTopSpots: vi.fn(),
  getRecentActivity: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  verifyToken: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin' })),
}));

vi.mock('../../db/repositories/admin.js', () => ({
  getById: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin', is_active: true })),
}));

import * as analyticsRepo from '../../db/repositories/admin/analytics.js';

let app;
beforeEach(() => {
  vi.clearAllMocks();
  app = createTestServer().app;
});

const auth = { Authorization: `Bearer ${adminToken}` };

describe('GET /api/admin/analytics/overview', () => {
  it('returns platform stats', async () => {
    analyticsRepo.getPlatformStats.mockResolvedValue({
      total_users: 100,
      total_spots: 50,
      total_bookings: 300,
      total_revenue: 15000,
    });
    const res = await request(app).get('/api/admin/analytics/overview').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.total_users).toBe(100);
    expect(res.body.data.total_bookings).toBe(300);
  });
});

describe('GET /api/admin/analytics/revenue', () => {
  it('returns revenue stats without period', async () => {
    analyticsRepo.getRevenueStats.mockResolvedValue({ daily: [], weekly: [] });
    const res = await request(app).get('/api/admin/analytics/revenue').set(auth);
    expect(res.status).toBe(200);
  });

  it('returns revenue stats with period filter', async () => {
    analyticsRepo.getRevenueStats.mockResolvedValue({ daily: [{ date: '2026-01-01', amount: 500 }] });
    const res = await request(app).get('/api/admin/analytics/revenue?period=day').set(auth);
    expect(res.status).toBe(200);
    expect(analyticsRepo.getRevenueStats).toHaveBeenCalledWith({ period: 'day' });
  });

  it('returns 422 for invalid period', async () => {
    const res = await request(app).get('/api/admin/analytics/revenue?period=year').set(auth);
    expect(res.status).toBe(422);
  });
});

describe('GET /api/admin/analytics/bookings', () => {
  it('returns booking and payment stats', async () => {
    analyticsRepo.getBookingStats.mockResolvedValue([
      { status: 'completed', count: 200 },
      { status: 'cancelled', count: 50 },
    ]);
    analyticsRepo.getPaymentMethodStats.mockResolvedValue([
      { method: 'chapa', count: 180 },
      { method: 'manual', count: 70 },
    ]);

    const res = await request(app).get('/api/admin/analytics/bookings').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.byStatus).toHaveLength(2);
    expect(res.body.data.byPaymentMethod).toHaveLength(2);
  });
});

describe('GET /api/admin/analytics/top-spots', () => {
  it('returns top spots with default limit', async () => {
    analyticsRepo.getTopSpots.mockResolvedValue([
      { id: 1, address: 'Bole Road', booking_count: 50 },
    ]);
    const res = await request(app).get('/api/admin/analytics/top-spots').set(auth);
    expect(res.status).toBe(200);
    expect(analyticsRepo.getTopSpots).toHaveBeenCalledWith(10);
  });

  it('respects custom limit', async () => {
    analyticsRepo.getTopSpots.mockResolvedValue([]);
    await request(app).get('/api/admin/analytics/top-spots?limit=5').set(auth);
    expect(analyticsRepo.getTopSpots).toHaveBeenCalledWith(5);
  });

  it('returns 422 for out-of-range limit', async () => {
    const res = await request(app).get('/api/admin/analytics/top-spots?limit=200').set(auth);
    expect(res.status).toBe(422);
  });
});

describe('GET /api/admin/analytics/activity', () => {
  it('returns recent activity', async () => {
    analyticsRepo.getRecentActivity.mockResolvedValue([
      { action: 'booking_created', timestamp: '2026-01-15T10:00:00Z' },
    ]);
    const res = await request(app).get('/api/admin/analytics/activity').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
