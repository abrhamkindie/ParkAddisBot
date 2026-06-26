/**
 * Integration tests for admin spot management routes.
 *
 * @module routes/admin/spots.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken } from '../../testSetup.js';

// ── Mock DB repos ──────────────────────────────────────────────────────────

vi.mock('../../db/repositories/admin/spots.js', () => ({
  listAll: vi.fn(),
  getById: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  suspend: vi.fn(),
  updatePrice: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  verifyToken: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin' })),
  login: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../../db/repositories/admin.js', () => ({
  getByEmail: vi.fn(),
  createAdmin: vi.fn(),
  getById: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin', is_active: true })),
  updateLastLogin: vi.fn(),
}));

// ── Import mocks ───────────────────────────────────────────────────────────

import * as adminSpotsRepo from '../../db/repositories/admin/spots.js';

/** @type {import('supertest').SuperTest<import('supertest').Test>} */
let app;

beforeEach(() => {
  vi.clearAllMocks();
  app = createTestServer().app;
});

const spot = { id: 1, address: 'Bole Road', price_per_hour: 50, status: 'pending_approval' };
const authHeader = { Authorization: `Bearer ${adminToken}` };

// ── GET /api/admin/spots ───────────────────────────────────────────────────

describe('GET /api/admin/spots', () => {
  it('lists all spots with pagination', async () => {
    adminSpotsRepo.listAll.mockResolvedValue({ spots: [spot], total: 1 });

    const res = await request(app)
      .get('/api/admin/spots')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination.total).toBe(1);
  });

  it('filters by status', async () => {
    adminSpotsRepo.listAll.mockResolvedValue({ spots: [spot], total: 1 });

    await request(app)
      .get('/api/admin/spots?status=pending_approval')
      .set(authHeader);

    expect(adminSpotsRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_approval' }),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/admin/spots');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/admin/spots/:id ───────────────────────────────────────────────

describe('GET /api/admin/spots/:id', () => {
  it('returns spot details', async () => {
    adminSpotsRepo.getById.mockResolvedValue(spot);

    const res = await request(app)
      .get('/api/admin/spots/1')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.address).toBe('Bole Road');
  });

  it('returns 404 for unknown spot', async () => {
    adminSpotsRepo.getById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/admin/spots/999')
      .set(authHeader);

    expect(res.status).toBe(404);
  });
});

// ── POST /api/admin/spots/:id/approve ──────────────────────────────────────

describe('POST /api/admin/spots/:id/approve', () => {
  it('approves a spot', async () => {
    adminSpotsRepo.approve.mockResolvedValue({ ...spot, status: 'active' });

    const res = await request(app)
      .post('/api/admin/spots/1/approve')
      .set(authHeader);

    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown spot', async () => {
    adminSpotsRepo.approve.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/admin/spots/999/approve')
      .set(authHeader);

    expect(res.status).toBe(404);
  });
});

// ── POST /api/admin/spots/:id/reject ──────────────────────────────────────

describe('POST /api/admin/spots/:id/reject', () => {
  it('rejects a spot with reason', async () => {
    adminSpotsRepo.reject.mockResolvedValue({ ...spot, status: 'rejected' });

    const res = await request(app)
      .post('/api/admin/spots/1/reject')
      .set(authHeader)
      .send({ reason: 'Incomplete information' });

    expect(res.status).toBe(200);
    expect(adminSpotsRepo.reject).toHaveBeenCalledWith(1, 'Incomplete information');
  });

  it('rejects even without reason', async () => {
    adminSpotsRepo.reject.mockResolvedValue({ ...spot, status: 'rejected' });

    const res = await request(app)
      .post('/api/admin/spots/1/reject')
      .set(authHeader);

    expect(res.status).toBe(200);
  });
});

// ── POST /api/admin/spots/:id/suspend ──────────────────────────────────────

describe('POST /api/admin/spots/:id/suspend', () => {
  it('suspends a spot', async () => {
    adminSpotsRepo.suspend.mockResolvedValue({ ...spot, status: 'suspended' });

    const res = await request(app)
      .post('/api/admin/spots/1/suspend')
      .set(authHeader);

    expect(res.status).toBe(200);
  });
});

// ── PUT /api/admin/spots/:id/price ─────────────────────────────────────────

describe('PUT /api/admin/spots/:id/price', () => {
  it('updates spot price', async () => {
    adminSpotsRepo.updatePrice.mockResolvedValue({ ...spot, price_per_hour: 75 });

    const res = await request(app)
      .put('/api/admin/spots/1/price')
      .set(authHeader)
      .send({ price: 75 });

    expect(res.status).toBe(200);
    expect(adminSpotsRepo.updatePrice).toHaveBeenCalledWith(1, 75);
  });

  it('returns 422 for zero price', async () => {
    const res = await request(app)
      .put('/api/admin/spots/1/price')
      .set(authHeader)
      .send({ price: 0 });

    expect(res.status).toBe(422);
  });

  it('returns 422 for negative price', async () => {
    const res = await request(app)
      .put('/api/admin/spots/1/price')
      .set(authHeader)
      .send({ price: -10 });

    expect(res.status).toBe(422);
  });
});
