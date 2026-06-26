import { describe, it, expect, vi } from 'vitest';
import { success, created, noContent, paginated, error } from './apiResponse.js';

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

describe('success', () => {
  it('returns 200 with data envelope', () => {
    const res = mockRes();
    success(res, { id: 1, name: 'Test' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 1, name: 'Test' },
    });
  });

  it('includes meta when provided', () => {
    const res = mockRes();
    success(res, {}, { requestId: 'abc' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {},
      meta: { requestId: 'abc' },
    });
  });
});

describe('created', () => {
  it('returns 201 with data envelope', () => {
    const res = mockRes();
    created(res, { id: 42 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 42 },
    });
  });
});

describe('noContent', () => {
  it('returns 204 with no body', () => {
    const res = mockRes();
    noContent(res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });
});

describe('paginated', () => {
  it('returns 200 with data and pagination meta', () => {
    const res = mockRes();
    paginated(res, [1, 2, 3], { total: 50, limit: 20, offset: 0 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [1, 2, 3],
      meta: {
        pagination: {
          total: 50,
          limit: 20,
          offset: 0,
          hasMore: true,
        },
      },
    });
  });

  it('sets hasMore to false when at the end', () => {
    const res = mockRes();
    paginated(res, [], { total: 5, limit: 20, offset: 0 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: {
          pagination: expect.objectContaining({ hasMore: false }),
        },
      }),
    );
  });
});

describe('error', () => {
  it('returns the correct status and error envelope', () => {
    const res = mockRes();
    error(res, { code: 'NOT_FOUND', statusCode: 404, message: 'Missing' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Missing' },
    });
  });

  it('includes details when provided', () => {
    const res = mockRes();
    error(res, {
      code: 'VALIDATION_ERROR',
      statusCode: 422,
      message: 'Invalid',
      details: [{ field: 'email', message: 'Invalid email' }],
    });
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid',
        details: [{ field: 'email', message: 'Invalid email' }],
      },
    });
  });
});
