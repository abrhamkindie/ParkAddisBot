import { describe, it, expect, vi, beforeEach } from 'vitest';
import { errorHandler, asyncHandler, notFoundHandler } from './errorHandler.js';
import { NotFoundError, BadRequestError, InternalError } from '../utils/errors.js';

// Mock the logger to avoid console noise
vi.mock('../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock('../config/index.js', () => ({
  config: { env: 'test' },
}));

function mockReq() {
  return {
    method: 'GET',
    path: '/test',
    requestId: 'req-123',
    admin: null,
    dbUser: null,
  };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('returns 404 for NotFoundError', () => {
    const err = new NotFoundError('Spot not found');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Spot not found' },
    });
  });

  it('returns 400 for BadRequestError', () => {
    const err = new BadRequestError('Invalid input');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid input' },
    });
  });

  it('returns 500 for InternalError', () => {
    const err = new InternalError('DB connection failed');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('converts legacy Error to proper error response', () => {
    const err = new Error('NOT_FOUND');
    err.code = 'NOT_FOUND';
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });

  it('includes validation details when present', () => {
    const err = new BadRequestError('Invalid');
    err.details = [{ field: 'name', message: 'Required' }];
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          details: [{ field: 'name', message: 'Required' }],
        }),
      }),
    );
  });
});

describe('asyncHandler', () => {
  it('calls next with error when async handler throws', async () => {
    const fn = async () => {
      throw new BadRequestError('Oops');
    };
    const wrapped = asyncHandler(fn);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await wrapped(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it('passes through successful handler', async () => {
    const fn = async (req, res) => {
      res.json({ ok: true });
    };
    const wrapped = asyncHandler(fn);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await wrapped(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with route info', () => {
    const req = mockReq();
    req.method = 'POST';
    req.path = '/unknown';
    const res = mockRes();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route POST /unknown not found',
      },
    });
  });
});
