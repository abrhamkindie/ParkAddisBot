/**
 * Integration tests for admin finance routes.
 *
 * @module routes/admin/finance.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken } from '../../testSetup.js';

vi.mock('../../db/repositories/admin/finance.js', () => ({
  getHostBalances: vi.fn(),
  createPayout: vi.fn(),
  markPayoutSent: vi.fn(),
  listDisputes: vi.fn(),
  getDisputeById: vi.fn(),
  resolveDispute: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  verifyToken: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin' })),
}));

vi.mock('../../db/repositories/admin.js', () => ({
  getById: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin', is_active: true })),
}));

import * as adminFinanceRepo from '../../db/repositories/admin/finance.js';

let app;
beforeEach(() => {
  vi.clearAllMocks();
  app = createTestServer().app;
});

const auth = { Authorization: `Bearer ${adminToken}` };

// ── Finance routes ────────────────────────────────────────────────────────

describe('GET /api/admin/finance/balances', () => {
  it('returns host payout balances', async () => {
    adminFinanceRepo.getHostBalances.mockResolvedValue([
      { host_id: 1, host_name: 'Host A', balance: 1500 },
    ]);
    const res = await request(app).get('/api/admin/finance/balances').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/admin/finance/payouts', () => {
  it('creates a payout', async () => {
    adminFinanceRepo.createPayout.mockResolvedValue({ id: 1, host_id: 5, amount: 500, status: 'pending' });
    const res = await request(app)
      .post('/api/admin/finance/payouts')
      .set(auth)
      .send({ hostId: 5, amount: 500 });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(500);
  });

  it('returns 422 for missing hostId', async () => {
    const res = await request(app)
      .post('/api/admin/finance/payouts')
      .set(auth)
      .send({ amount: 500 });
    expect(res.status).toBe(422);
  });

  it('returns 422 for zero amount', async () => {
    const res = await request(app)
      .post('/api/admin/finance/payouts')
      .set(auth)
      .send({ hostId: 5, amount: 0 });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/admin/finance/payouts/:id/sent', () => {
  it('marks payout as sent', async () => {
    adminFinanceRepo.markPayoutSent.mockResolvedValue({ id: 1, status: 'sent' });
    const res = await request(app).post('/api/admin/finance/payouts/1/sent').set(auth);
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown payout', async () => {
    adminFinanceRepo.markPayoutSent.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/finance/payouts/999/sent').set(auth);
    expect(res.status).toBe(404);
  });
});

// ── Dispute routes ─────────────────────────────────────────────────────────

describe('GET /api/admin/disputes', () => {
  it('lists disputes', async () => {
    adminFinanceRepo.listDisputes.mockResolvedValue({
      disputes: [{ id: 1, status: 'open', reason: 'Payment issue' }],
      total: 1,
    });
    const res = await request(app).get('/api/admin/disputes').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/admin/disputes/:id', () => {
  it('returns dispute details', async () => {
    adminFinanceRepo.getDisputeById.mockResolvedValue({ id: 1, status: 'open' });
    const res = await request(app).get('/api/admin/disputes/1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
  });

  it('returns 404 for unknown dispute', async () => {
    adminFinanceRepo.getDisputeById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/disputes/999').set(auth);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/disputes/:id/resolve', () => {
  it('resolves a dispute', async () => {
    adminFinanceRepo.resolveDispute.mockResolvedValue({ id: 1, status: 'resolved' });
    const res = await request(app)
      .post('/api/admin/disputes/1/resolve')
      .set(auth)
      .send({ resolution: 'Refund issued' });
    expect(res.status).toBe(200);
    expect(adminFinanceRepo.resolveDispute).toHaveBeenCalledWith(1, 'Refund issued', 1);
  });

  it('returns 422 for empty resolution', async () => {
    const res = await request(app)
      .post('/api/admin/disputes/1/resolve')
      .set(auth)
      .send({ resolution: '' });
    expect(res.status).toBe(422);
  });
});
