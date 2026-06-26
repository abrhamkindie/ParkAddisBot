/**
 * Integration tests for admin ratings management routes.
 *
 * @module routes/admin/ratings.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken } from '../../testSetup.js';

vi.mock('../../db/repositories/ratings.js', () => ({
  listBySpot: vi.fn(),
  listByHost: vi.fn(),
  getSpotRatingStats: vi.fn(),
  getById: vi.fn(),
  deleteById: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('../../db/repositories/admin.js', () => ({
  getById: vi.fn(),
}));

import * as ratingsRepo from '../../db/repositories/ratings.js';
import * as authService from '../../services/authService.js';
import * as adminRepo from '../../db/repositories/admin.js';

let app;
beforeEach(() => {
  vi.clearAllMocks();
  authService.verifyToken.mockReturnValue({ id: 1, email: 'admin@test.com', role: 'admin' });
  adminRepo.getById.mockReturnValue({ id: 1, email: 'admin@test.com', role: 'admin', is_active: true });
  app = createTestServer().app;
});

const rating = { id: 1, booking_id: 10, score: 4, comment: 'Great spot!', driver_name: 'John' };
const auth = { Authorization: `Bearer ${adminToken}` };

describe('GET /api/admin/ratings', () => {
  it('lists ratings by spot ID', async () => {
    ratingsRepo.listBySpot.mockResolvedValue({ ratings: [rating], total: 1 });
    const res = await request(app).get('/api/admin/ratings?spotId=5').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination.total).toBe(1);
  });

  it('lists ratings by host ID', async () => {
    ratingsRepo.listByHost.mockResolvedValue({ ratings: [rating], total: 1 });
    const res = await request(app).get('/api/admin/ratings?hostId=3').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns empty result when no filter provided', async () => {
    const res = await request(app).get('/api/admin/ratings').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/ratings');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/ratings/stats/spot/:spotId', () => {
  it('returns rating stats for a spot', async () => {
    ratingsRepo.getSpotRatingStats.mockResolvedValue({ average: 4.5, count: 10, distribution: { 5: 5, 4: 3, 3: 2 } });
    const res = await request(app).get('/api/admin/ratings/stats/spot/5').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.average).toBe(4.5);
  });

  it('returns 422 for non-numeric spotId', async () => {
    const res = await request(app).get('/api/admin/ratings/stats/spot/abc').set(auth);
    expect(res.status).toBe(422);
  });
});

describe('GET /api/admin/ratings/:id', () => {
  it('returns rating details', async () => {
    ratingsRepo.getById.mockResolvedValue(rating);
    const res = await request(app).get('/api/admin/ratings/1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(4);
  });

  it('returns 404 for unknown rating', async () => {
    ratingsRepo.getById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/ratings/999').set(auth);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/ratings/:id', () => {
  it('blocks regular admin from deleting', async () => {
    const res = await request(app).delete('/api/admin/ratings/1').set(auth);
    expect(res.status).toBe(403);
  });
});
