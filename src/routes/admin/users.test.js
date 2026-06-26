/**
 * Integration tests for admin user management routes.
 *
 * @module routes/admin/users.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, adminToken, superAdminToken } from '../../testSetup.js';

vi.mock('../../db/repositories/admin/users.js', () => ({
  listAll: vi.fn(),
  getById: vi.fn(),
  ban: vi.fn(),
  unban: vi.fn(),
  setRole: vi.fn(),
}));

vi.mock('../../services/authService.js', () => ({
  verifyToken: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin' })),
}));

vi.mock('../../db/repositories/admin.js', () => ({
  getById: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'admin', is_active: true })),
}));

import * as adminUsersRepo from '../../db/repositories/admin/users.js';

let app;
beforeEach(() => {
  vi.clearAllMocks();
  app = createTestServer().app;
});

const user = { id: 10, name: 'Driver A', role: 'driver', is_banned: false };
const auth = { Authorization: `Bearer ${adminToken}` };

describe('GET /api/admin/users', () => {
  it('lists users with pagination', async () => {
    adminUsersRepo.listAll.mockResolvedValue({ users: [user], total: 1 });
    const res = await request(app).get('/api/admin/users').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by role', async () => {
    adminUsersRepo.listAll.mockResolvedValue({ users: [user], total: 1 });
    await request(app).get('/api/admin/users?role=driver').set(auth);
    expect(adminUsersRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'driver' }),
    );
  });
});

describe('GET /api/admin/users/:id', () => {
  it('returns user details', async () => {
    adminUsersRepo.getById.mockResolvedValue(user);
    const res = await request(app).get('/api/admin/users/10').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Driver A');
  });

  it('returns 404 for unknown user', async () => {
    adminUsersRepo.getById.mockResolvedValue(null);
    const res = await request(app).get('/api/admin/users/999').set(auth);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/users/:id/ban', () => {
  it('bans a user', async () => {
    adminUsersRepo.ban.mockResolvedValue({ ...user, is_banned: true });
    const res = await request(app).post('/api/admin/users/10/ban').set(auth).send({ reason: 'Spam' });
    expect(res.status).toBe(200);
    expect(adminUsersRepo.ban).toHaveBeenCalledWith(10, 'Spam');
  });

  it('bans without reason', async () => {
    adminUsersRepo.ban.mockResolvedValue({ ...user, is_banned: true });
    const res = await request(app).post('/api/admin/users/10/ban').set(auth);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/users/:id/unban', () => {
  it('unbans a user', async () => {
    adminUsersRepo.unban.mockResolvedValue({ ...user, is_banned: false });
    const res = await request(app).post('/api/admin/users/10/unban').set(auth);
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/admin/users/:id/role', () => {
  it('changes user role', async () => {
    adminUsersRepo.setRole.mockResolvedValue({ ...user, role: 'host' });
    const res = await request(app)
      .put('/api/admin/users/10/role')
      .set(auth)
      .send({ role: 'host' });
    expect(res.status).toBe(200);
    expect(adminUsersRepo.setRole).toHaveBeenCalledWith(10, 'host');
  });

  it('returns 422 for invalid role', async () => {
    const res = await request(app)
      .put('/api/admin/users/10/role')
      .set(auth)
      .send({ role: 'invalid_role' });
    expect(res.status).toBe(422);
  });
});
