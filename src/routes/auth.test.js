/**
 * Integration tests for admin authentication routes.
 *
 * @module routes/auth.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer } from '../testSetup.js';

// ── Mock DB dependencies ───────────────────────────────────────────────────

vi.mock('../db/repositories/admin.js', () => ({
  getByEmail: vi.fn(),
  createAdmin: vi.fn(),
  getById: vi.fn(),
  updateLastLogin: vi.fn(),
}));

vi.mock('../services/authService.js', () => ({
  login: vi.fn(),
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  verifyToken: vi.fn(),
}));

// ── Import mocks after vi.mock ─────────────────────────────────────────────

import * as adminRepo from '../db/repositories/admin.js';
import * as authService from '../services/authService.js';

/** @type {import('supertest').SuperTest<import('supertest').Test>} */
let app;

beforeEach(() => {
  vi.clearAllMocks();
  app = createTestServer().app;
});

// ── POST /api/admin/login ──────────────────────────────────────────────────

describe('POST /api/admin/login', () => {
  const mockAdmin = {
    id: 1,
    email: 'admin@test.com',
    name: 'Admin',
    role: 'admin',
    password_hash: '$2b$12$hashedpassword',
  };

  const loginResponse = {
    token: 'jwt-token-here',
    admin: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' },
  };

  it('returns 200 with token for valid credentials', async () => {
    authService.login.mockResolvedValue(loginResponse);

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('jwt-token-here');
    expect(res.body.data.admin.email).toBe('admin@test.com');
  });

  it('returns 422 for missing email', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 for missing password', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(422);
  });

  it('returns 401 for invalid credentials', async () => {
    authService.login.mockRejectedValue(new Error('INVALID_CREDENTIALS'));

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'wrong@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

// ── POST /api/admin/register ───────────────────────────────────────────────

describe('POST /api/admin/register', () => {
  const newAdmin = {
    id: 2,
    email: 'new@test.com',
    name: 'New Admin',
    role: 'admin',
  };

  it('returns 201 for valid registration', async () => {
    adminRepo.getByEmail.mockResolvedValue(null);
    adminRepo.createAdmin.mockResolvedValue(newAdmin);
    authService.hashPassword.mockResolvedValue('$2b$12$hashed');

    const res = await request(app)
      .post('/api/admin/register')
      .send({ email: 'new@test.com', password: 'password123', name: 'New Admin' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('new@test.com');
  });

  it('returns 422 for short password', async () => {
    const res = await request(app)
      .post('/api/admin/register')
      .send({ email: 'new@test.com', password: '12345' }); // min 6 chars

    expect(res.status).toBe(422);
  });

  it('returns 409 for duplicate email', async () => {
    adminRepo.getByEmail.mockResolvedValue({ id: 1, email: 'existing@test.com' });

    const res = await request(app)
      .post('/api/admin/register')
      .send({ email: 'existing@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
