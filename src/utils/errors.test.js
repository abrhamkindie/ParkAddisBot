import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  toAppError,
} from './errors.js';

describe('AppError', () => {
  it('creates an error with code, statusCode, and message', () => {
    const err = new AppError('TEST_ERROR', 418, 'I am a teapot', { trace: 'abc' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe('I am a teapot');
    expect(err.meta).toEqual({ trace: 'abc' });
    expect(err.isOperational).toBe(true);
  });

  it('defaults to 500 and generic message', () => {
    const err = new AppError('UNKNOWN');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Internal Server Error');
  });
});

describe('Error hierarchy', () => {
  const cases = [
    [BadRequestError, 'BAD_REQUEST', 400],
    [UnauthorizedError, 'UNAUTHORIZED', 401],
    [ForbiddenError, 'FORBIDDEN', 403],
    [NotFoundError, 'NOT_FOUND', 404],
    [ConflictError, 'CONFLICT', 409],
    [ValidationError, 'VALIDATION_ERROR', 422],
    [RateLimitError, 'RATE_LIMIT_EXCEEDED', 429],
    [InternalError, 'INTERNAL_ERROR', 500],
    [ServiceUnavailableError, 'SERVICE_UNAVAILABLE', 503],
  ];

  it.each(cases)('%s has code %s and status %i', (Klass, code, status) => {
    const err = new Klass();
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(code);
    expect(err.statusCode).toBe(status);
  });

  it('ValidationError carries field-level details', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const err = new ValidationError('Validation failed', details);
    expect(err.details).toEqual(details);
    expect(err.meta.details).toEqual(details);
  });
});

describe('toAppError', () => {
  it('returns AppError instances unchanged', () => {
    const original = new NotFoundError('Spot not found');
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it('maps legacy NOT_FOUND errors correctly', () => {
    const legacy = new Error('NOT_FOUND');
    legacy.code = 'NOT_FOUND';
    const result = toAppError(legacy);
    expect(result).toBeInstanceOf(AppError);
    expect(result.statusCode).toBe(404);
    expect(result.message).toBe('Resource not found');
  });

  it('maps CheckinError NOT_FOUND to 404', () => {
    const err = new Error('NOT_FOUND');
    err.code = 'NOT_FOUND';
    const result = toAppError(err);
    expect(result.statusCode).toBe(404);
  });

  it('maps legacy INVALID_CREDENTIALS to 401', () => {
    const err = new Error('INVALID_CREDENTIALS');
    const result = toAppError(err);
    expect(result.statusCode).toBe(401);
    expect(result.code).toBe('INVALID_CREDENTIALS');
  });

  it('maps legacy CAPACITY_FULL to 409', () => {
    const err = new Error('CAPACITY_FULL');
    err.code = 'CAPACITY_FULL';
    const result = toAppError(err);
    expect(result.statusCode).toBe(409);
    expect(result.message).toContain('fully booked');
  });

  it('defaults unmapped errors to 500 InternalError', () => {
    const err = new Error('SOME_RANDOM_ERROR');
    const result = toAppError(err);
    expect(result.statusCode).toBe(500);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.meta.originalMessage).toBe('SOME_RANDOM_ERROR');
  });

  it('preserves original message in meta', () => {
    const err = new Error('SPOT_UNAVAILABLE');
    err.code = 'SPOT_UNAVAILABLE';
    const result = toAppError(err);
    expect(result.meta.originalMessage).toBe('SPOT_UNAVAILABLE');
  });
});
