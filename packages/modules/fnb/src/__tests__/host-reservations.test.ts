import { describe, it, expect } from 'vitest';
import {
  hostCreateReservationSchema,
  hostUpdateReservationSchema,
  seatReservationSchema,
  cancelReservationV2Schema,
  confirmReservationSchema,
  completeReservationSchema,
  markNoShowSchema,
  checkInReservationV2Schema,
  validateReservationTransition,
  RESERVATION_TRANSITIONS,
  HOST_RESERVATION_STATUSES,
} from '../validation-host';

// ── State Machine Tests ─────────────────────────────────────────

describe('Reservation State Machine', () => {
  it('booked allows transition to confirmed', () => {
    expect(validateReservationTransition('booked', 'confirmed')).toBe(true);
  });

  it('booked allows transition to checked_in', () => {
    expect(validateReservationTransition('booked', 'checked_in')).toBe(true);
  });

  it('booked allows transition to canceled', () => {
    expect(validateReservationTransition('booked', 'canceled')).toBe(true);
  });

  it('booked allows transition to no_show', () => {
    expect(validateReservationTransition('booked', 'no_show')).toBe(true);
  });

  it('booked does NOT allow transition to seated', () => {
    expect(validateReservationTransition('booked', 'seated')).toBe(false);
  });

  it('confirmed allows transition to checked_in', () => {
    expect(validateReservationTransition('confirmed', 'checked_in')).toBe(true);
  });

  it('confirmed does NOT allow transition to seated', () => {
    expect(validateReservationTransition('confirmed', 'seated')).toBe(false);
  });

  it('checked_in allows transition to seated', () => {
    expect(validateReservationTransition('checked_in', 'seated')).toBe(true);
  });

  it('checked_in allows transition to partially_seated', () => {
    expect(validateReservationTransition('checked_in', 'partially_seated')).toBe(true);
  });

  it('partially_seated allows transition to seated', () => {
    expect(validateReservationTransition('partially_seated', 'seated')).toBe(true);
  });

  it('partially_seated allows transition to canceled', () => {
    expect(validateReservationTransition('partially_seated', 'canceled')).toBe(true);
  });

  it('partially_seated does NOT allow transition to completed', () => {
    expect(validateReservationTransition('partially_seated', 'completed')).toBe(false);
  });

  it('seated allows transition to completed only', () => {
    expect(validateReservationTransition('seated', 'completed')).toBe(true);
    expect(validateReservationTransition('seated', 'canceled')).toBe(false);
    expect(validateReservationTransition('seated', 'no_show')).toBe(false);
  });

  it('completed is a terminal state', () => {
    for (const status of HOST_RESERVATION_STATUSES) {
      expect(validateReservationTransition('completed', status)).toBe(false);
    }
  });

  it('no_show allows re-booking', () => {
    expect(validateReservationTransition('no_show', 'booked')).toBe(true);
    expect(validateReservationTransition('no_show', 'confirmed')).toBe(false);
  });

  it('canceled allows re-booking', () => {
    expect(validateReservationTransition('canceled', 'booked')).toBe(true);
    expect(validateReservationTransition('canceled', 'confirmed')).toBe(false);
  });

  it('unknown source status returns false', () => {
    expect(validateReservationTransition('unknown', 'booked')).toBe(false);
  });

  it('all statuses have transition entries', () => {
    for (const status of HOST_RESERVATION_STATUSES) {
      expect(RESERVATION_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(RESERVATION_TRANSITIONS[status])).toBe(true);
    }
  });
});

// ── Create Reservation Schema Tests ─────────────────────────────

describe('hostCreateReservationSchema', () => {
  const validInput = {
    guestName: 'John Smith',
    partySize: 4,
    reservationDate: '2026-03-15',
    reservationTime: '19:00',
    mealPeriod: 'dinner' as const,
  };

  it('validates minimal valid input', () => {
    const result = hostCreateReservationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guestName).toBe('John Smith');
      expect(result.data.source).toBe('host'); // default
      expect(result.data.tags).toEqual([]); // default
    }
  });

  it('validates full input with all optional fields', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      guestEmail: 'john@example.com',
      guestPhone: '+15551234567',
      customerId: 'cust-1',
      source: 'online',
      specialRequests: 'Window seat please',
      occasion: 'anniversary',
      tags: ['vip', 'regular'],
      seatingPreference: 'window',
      tableIds: ['table-1', 'table-2'],
      serverId: 'server-1',
      notes: 'Birthday cake at 8pm',
      clientRequestId: 'req-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty guest name', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      guestName: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects guest name over 200 chars', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      guestName: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects party size 0', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      partySize: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects party size over 99', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      partySize: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      reservationDate: '03-15-2026',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid time format', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      reservationTime: '7:00 PM',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone format', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      guestPhone: '555-1234',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid E.164-ish phone', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      guestPhone: '+15551234567',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      guestEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid meal period', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      mealPeriod: 'supper',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid source', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      source: 'app',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid occasion', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      occasion: 'funeral',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid seating preference', () => {
    const result = hostCreateReservationSchema.safeParse({
      ...validInput,
      seatingPreference: 'rooftop',
    });
    expect(result.success).toBe(false);
  });
});

// ── Update Reservation Schema Tests ─────────────────────────────

describe('hostUpdateReservationSchema', () => {
  it('validates empty update (no fields changed)', () => {
    const result = hostUpdateReservationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates partial update with party size', () => {
    const result = hostUpdateReservationSchema.safeParse({
      partySize: 6,
      expectedVersion: 1,
    });
    expect(result.success).toBe(true);
  });

  it('allows nullable fields to be set to null', () => {
    const result = hostUpdateReservationSchema.safeParse({
      guestEmail: null,
      guestPhone: null,
      specialRequests: null,
      occasion: null,
      seatingPreference: null,
      serverId: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid party size', () => {
    const result = hostUpdateReservationSchema.safeParse({
      partySize: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ── Seat Reservation Schema Tests ───────────────────────────────

describe('seatReservationSchema', () => {
  it('validates with table IDs', () => {
    const result = seatReservationSchema.safeParse({
      tableIds: ['table-1'],
    });
    expect(result.success).toBe(true);
  });

  it('validates with multiple tables and adjusted party size', () => {
    const result = seatReservationSchema.safeParse({
      tableIds: ['table-1', 'table-2'],
      adjustedPartySize: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty table IDs array', () => {
    const result = seatReservationSchema.safeParse({
      tableIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects adjusted party size 0', () => {
    const result = seatReservationSchema.safeParse({
      tableIds: ['table-1'],
      adjustedPartySize: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ── Other Action Schema Tests ───────────────────────────────────

describe('confirmReservationSchema', () => {
  it('defaults sendConfirmation to false', () => {
    const result = confirmReservationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sendConfirmation).toBe(false);
    }
  });

  it('accepts sendConfirmation true', () => {
    const result = confirmReservationSchema.safeParse({
      sendConfirmation: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('cancelReservationV2Schema', () => {
  it('validates with optional reason', () => {
    const result = cancelReservationV2Schema.safeParse({
      reason: 'Guest called to cancel',
    });
    expect(result.success).toBe(true);
  });

  it('validates without reason', () => {
    const result = cancelReservationV2Schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects reason over 500 chars', () => {
    const result = cancelReservationV2Schema.safeParse({
      reason: 'A'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('completeReservationSchema', () => {
  it('validates with clientRequestId', () => {
    const result = completeReservationSchema.safeParse({
      clientRequestId: 'req-123',
    });
    expect(result.success).toBe(true);
  });

  it('validates empty input', () => {
    const result = completeReservationSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('markNoShowSchema', () => {
  it('validates empty input', () => {
    const result = markNoShowSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('checkInReservationV2Schema', () => {
  it('validates with optional fields', () => {
    const result = checkInReservationV2Schema.safeParse({
      tableId: 'table-1',
      serverUserId: 'server-1',
    });
    expect(result.success).toBe(true);
  });

  it('validates empty input', () => {
    const result = checkInReservationV2Schema.safeParse({});
    expect(result.success).toBe(true);
  });
});
