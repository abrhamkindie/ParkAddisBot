import { describe, it, expect } from 'vitest';
import * as schemas from './schemas.js';

describe('login schema', () => {
  it('accepts valid email and password', () => {
    const result = schemas.login.safeParse({ email: 'admin@test.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = schemas.login.safeParse({ password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = schemas.login.safeParse({ email: 'not-an-email', password: 'secret' });
    expect(result.success).toBe(false);
  });
});

describe('register schema', () => {
  it('accepts valid registration', () => {
    const result = schemas.register.safeParse({
      email: 'admin@test.com',
      password: 'abcdef',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = schemas.register.safeParse({
      email: 'admin@test.com',
      password: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional name and role', () => {
    const result = schemas.register.safeParse({
      email: 'admin@test.com',
      password: 'abcdef',
      name: 'Admin',
      role: 'superadmin',
    });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Admin');
    expect(result.data.role).toBe('superadmin');
  });
});

describe('nearbySpots schema', () => {
  it('accepts valid lat/lng', () => {
    const result = schemas.nearbySpots.safeParse({ lat: '9.0', lng: '38.7' });
    expect(result.success).toBe(true);
    expect(result.data.lat).toBe(9.0);
    expect(result.data.lng).toBe(38.7);
  });

  it('rejects out-of-range lat', () => {
    const result = schemas.nearbySpots.safeParse({ lat: '95', lng: '0' });
    expect(result.success).toBe(false);
  });

  it('radius is optional', () => {
    const result = schemas.nearbySpots.safeParse({ lat: '9.0', lng: '38.7' });
    expect(result.success).toBe(true);
    expect(result.data.radius).toBeUndefined();
  });

  it('coerces radius to number', () => {
    const result = schemas.nearbySpots.safeParse({ lat: '9.0', lng: '38.7', radius: '5000' });
    expect(result.success).toBe(true);
    expect(result.data.radius).toBe(5000);
  });
});

describe('idParam schema', () => {
  it('accepts numeric id', () => {
    const result = schemas.idParam.safeParse({ id: '123' });
    expect(result.success).toBe(true);
    expect(result.data.id).toBe(123);
  });

  it('rejects non-numeric id', () => {
    const result = schemas.idParam.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects zero or negative', () => {
    expect(schemas.idParam.safeParse({ id: '0' }).success).toBe(false);
    expect(schemas.idParam.safeParse({ id: '-5' }).success).toBe(false);
  });
});

describe('pagination', () => {
  it('defaults limit to 20 and offset to 0', () => {
    const schema = schemas.spotListQuery;
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(20);
    expect(result.data.offset).toBe(0);
  });

  it('accepts custom limit/offset', () => {
    const result = schemas.spotListQuery.safeParse({ limit: '50', offset: '10' });
    expect(result.data.limit).toBe(50);
    expect(result.data.offset).toBe(10);
  });

  it('rejects limit > 100', () => {
    const result = schemas.spotListQuery.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});

describe('updateSpotPriceBody', () => {
  it('accepts valid price', () => {
    const result = schemas.updateSpotPriceBody.safeParse({ price: '40.50' });
    expect(result.success).toBe(true);
    expect(result.data.price).toBe(40.5);
  });

  it('rejects zero price', () => {
    const result = schemas.updateSpotPriceBody.safeParse({ price: '0' });
    expect(result.success).toBe(false);
  });
});

describe('createPayoutBody', () => {
  it('accepts valid payout data', () => {
    const result = schemas.createPayoutBody.safeParse({
      hostId: '5',
      amount: '1000',
      note: 'Monthly payout',
    });
    expect(result.success).toBe(true);
    expect(result.data.hostId).toBe(5);
    expect(result.data.amount).toBe(1000);
    expect(result.data.note).toBe('Monthly payout');
  });

  it('rejects missing hostId', () => {
    const result = schemas.createPayoutBody.safeParse({ amount: '1000' });
    expect(result.success).toBe(false);
  });
});

describe('setUserRoleBody', () => {
  it('accepts valid roles', () => {
    for (const role of ['driver', 'host', 'admin']) {
      const result = schemas.setUserRoleBody.safeParse({ role });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid role', () => {
    const result = schemas.setUserRoleBody.safeParse({ role: 'superadmin' });
    expect(result.success).toBe(false);
  });
});

describe('resolveDisputeBody', () => {
  it('requires non-empty resolution', () => {
    const result = schemas.resolveDisputeBody.safeParse({ resolution: '' });
    expect(result.success).toBe(false);
  });
});
