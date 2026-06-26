/**
 * Tests for bot session utilities.
 *
 * @module bot/utils/session.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Flow, ListingStep, PaymentMethod, getFlowSession, setFlowSession, clearFlowSession, isInFlow, isAtStep } from './session.js';

describe('Flow constants', () => {
  it('defines all expected flow names', () => {
    expect(Flow.LIST_SPOT).toBe('list_spot');
    expect(Flow.EDIT_PRICE).toBe('edit_price');
    expect(Flow.BOOKING_COMPLETE).toBe('booking_complete');
    expect(Flow.PAYMENT).toBe('payment');
    expect(Flow.RATING).toBe('rating');
  });

  it('has unique values for each flow', () => {
    const values = Object.values(Flow);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('ListingStep constants', () => {
  it('defines all expected listing steps', () => {
    expect(ListingStep.LOCATION).toBe('location');
    expect(ListingStep.ADDRESS).toBe('address');
    expect(ListingStep.PRICE).toBe('price');
    expect(ListingStep.CAPACITY).toBe('capacity');
    expect(ListingStep.AMENITIES).toBe('amenities');
    expect(ListingStep.PHOTO).toBe('photo');
  });

  it('covers the full wizard order', () => {
    const steps = Object.values(ListingStep);
    expect(steps).toEqual([
      'location', 'address', 'price', 'capacity', 'amenities', 'photo',
    ]);
  });
});

describe('PaymentMethod constants', () => {
  it('defines both payment methods', () => {
    expect(PaymentMethod.CHAPA).toBe('chapa');
    expect(PaymentMethod.MANUAL).toBe('manual');
  });
});

describe('session helpers', () => {
  const userId = 12345;

  beforeEach(() => {
    clearFlowSession(userId);
  });

  describe('setFlowSession / getFlowSession', () => {
    it('stores and retrieves session data', () => {
      const data = { flow: Flow.LIST_SPOT, step: ListingStep.LOCATION, draft: {} };
      setFlowSession(userId, data);

      const retrieved = getFlowSession(userId);
      expect(retrieved).toEqual(data);
    });

    it('returns null for unknown users', () => {
      expect(getFlowSession(99999)).toBeNull();
    });

    it('overwrites existing session data', () => {
      setFlowSession(userId, { flow: Flow.LIST_SPOT });
      setFlowSession(userId, { flow: Flow.PAYMENT, bookingId: 42 });

      const retrieved = getFlowSession(userId);
      expect(retrieved.flow).toBe('payment');
      expect(retrieved.bookingId).toBe(42);
    });
  });

  describe('clearFlowSession', () => {
    it('removes session data for a user', () => {
      setFlowSession(userId, { flow: Flow.LIST_SPOT });
      clearFlowSession(userId);

      expect(getFlowSession(userId)).toBeNull();
    });

    it('is idempotent (clearing already-cleared session does not throw)', () => {
      expect(() => clearFlowSession(99999)).not.toThrow();
    });
  });

  describe('isInFlow', () => {
    it('returns true when session flow matches', () => {
      const session = { flow: Flow.PAYMENT, bookingId: 42 };
      expect(isInFlow(session, Flow.PAYMENT)).toBe(true);
    });

    it('returns false when session flow differs', () => {
      const session = { flow: Flow.PAYMENT };
      expect(isInFlow(session, Flow.LIST_SPOT)).toBe(false);
    });

    it('returns false for null session', () => {
      expect(isInFlow(null, Flow.LIST_SPOT)).toBe(false);
    });

    it('returns false for undefined session', () => {
      expect(isInFlow(undefined, Flow.LIST_SPOT)).toBe(false);
    });
  });

  describe('isAtStep', () => {
    it('returns true when session step matches', () => {
      const session = { flow: Flow.LIST_SPOT, step: ListingStep.LOCATION };
      expect(isAtStep(session, ListingStep.LOCATION)).toBe(true);
    });

    it('returns false when session step differs', () => {
      const session = { flow: Flow.LIST_SPOT, step: ListingStep.LOCATION };
      expect(isAtStep(session, ListingStep.PRICE)).toBe(false);
    });

    it('returns false for null session', () => {
      expect(isAtStep(null, ListingStep.LOCATION)).toBe(false);
    });

    it('returns false when session has no step', () => {
      expect(isAtStep({ flow: Flow.PAYMENT }, ListingStep.LOCATION)).toBe(false);
    });
  });
});
