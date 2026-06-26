import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.js';
import { ValidationError } from '../utils/errors.js';

function mockReq(body, query, params) {
  return { body: body || {}, query: query || {}, params: params || {} };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('validate middleware', () => {
  it('passes valid body through', () => {
    const schema = z.object({ email: z.string().email() });
    const middleware = validate({ body: schema });
    const req = mockReq({ email: 'test@test.com' });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.body.email).toBe('test@test.com');
  });

  it('calls next with ValidationError for invalid body', () => {
    const schema = z.object({ email: z.string().email() });
    const middleware = validate({ body: schema });
    const req = mockReq({ email: 'not-an-email' });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('replaces req.query with coerced values', () => {
    const schema = z.object({ limit: z.coerce.number().int().default(20) });
    const middleware = validate({ query: schema });
    const req = mockReq({}, { limit: '50' });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(req.query.limit).toBe(50);
    expect(next).toHaveBeenCalled();
  });

  it('replaces req.params with coerced values', () => {
    const schema = z.object({ id: z.coerce.number().int().positive() });
    const middleware = validate({ params: schema });
    const req = mockReq({}, {}, { id: '42' });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(req.params.id).toBe(42);
    expect(next).toHaveBeenCalled();
  });

  it('validates body, query, and params simultaneously', () => {
    const bodySchema = z.object({ name: z.string().min(1) });
    const querySchema = z.object({ page: z.coerce.number().default(1) });
    const paramsSchema = z.object({ id: z.coerce.number() });

    const middleware = validate({ body: bodySchema, query: querySchema, params: paramsSchema });
    const req = mockReq({ name: 'Test' }, { page: '2' }, { id: '10' });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(req.body.name).toBe('Test');
    expect(req.query.page).toBe(2);
    expect(req.params.id).toBe(10);
    expect(next).toHaveBeenCalled();
  });

  it('reports multiple field errors', () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    });
    const middleware = validate({ body: schema });
    const req = mockReq({ email: 'bad', password: 'ab' });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details.length).toBeGreaterThanOrEqual(2);
  });

  it('passes through when no schemas provided', () => {
    const middleware = validate();
    const req = mockReq({ any: 'thing' });
    const next = vi.fn();

    middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
