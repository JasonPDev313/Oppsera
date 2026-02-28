import { describe, it, expect } from 'vitest';
import {
  hostAddToWaitlistSchema,
  hostUpdateWaitlistEntrySchema,
  hostSeatFromWaitlistSchema,
  hostNotifyWaitlistSchema,
  hostRemoveFromWaitlistSchema,
  validateWaitlistTransition,
  WAITLIST_TRANSITIONS,
  HOST_WAITLIST_STATUSES,
  recordTableTurnSchema,
  sendGuestNotificationSchema,
  hostListReservationsFilterSchema,
  hostGetUpcomingReservationsSchema,
  hostListWaitlistFilterSchema,
  hostGetDashboardMetricsSchema,
  hostGetTableTurnStatsSchema,
  hostGetPreShiftReportSchema,
} from '../validation-host';
import { HOST_EVENTS } from '../events/host-events';

// ── Waitlist State Machine Tests ────────────────────────────────

describe('Waitlist State Machine', () => {
  it('waiting allows transition to notified', () => {
    expect(validateWaitlistTransition('waiting', 'notified')).toBe(true);
  });

  it('waiting allows transition to seated', () => {
    expect(validateWaitlistTransition('waiting', 'seated')).toBe(true);
  });

  it('waiting allows transition to canceled', () => {
    expect(validateWaitlistTransition('waiting', 'canceled')).toBe(true);
  });

  it('waiting allows transition to left', () => {
    expect(validateWaitlistTransition('waiting', 'left')).toBe(true);
  });

  it('waiting allows transition to no_show', () => {
    expect(validateWaitlistTransition('waiting', 'no_show')).toBe(true);
  });

  it('notified allows transition to seated', () => {
    expect(validateWaitlistTransition('notified', 'seated')).toBe(true);
  });

  it('notified allows transition to canceled', () => {
    expect(validateWaitlistTransition('notified', 'canceled')).toBe(true);
  });

  it('notified allows transition to left', () => {
    expect(validateWaitlistTransition('notified', 'left')).toBe(true);
  });

  it('seated is a terminal state', () => {
    for (const status of HOST_WAITLIST_STATUSES) {
      expect(validateWaitlistTransition('seated', status)).toBe(false);
    }
  });

  it('no_show is a terminal state', () => {
    for (const status of HOST_WAITLIST_STATUSES) {
      expect(validateWaitlistTransition('no_show', status)).toBe(false);
    }
  });

  it('canceled is a terminal state', () => {
    for (const status of HOST_WAITLIST_STATUSES) {
      expect(validateWaitlistTransition('canceled', status)).toBe(false);
    }
  });

  it('left is a terminal state', () => {
    for (const status of HOST_WAITLIST_STATUSES) {
      expect(validateWaitlistTransition('left', status)).toBe(false);
    }
  });

  it('unknown source status returns false', () => {
    expect(validateWaitlistTransition('unknown', 'seated')).toBe(false);
  });

  it('all statuses have transition entries', () => {
    for (const status of HOST_WAITLIST_STATUSES) {
      expect(WAITLIST_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(WAITLIST_TRANSITIONS[status])).toBe(true);
    }
  });
});

// ── Add to Waitlist Schema Tests ────────────────────────────────

describe('hostAddToWaitlistSchema', () => {
  const validInput = {
    guestName: 'Jane Doe',
    guestPhone: '+15559876543',
    partySize: 2,
  };

  it('validates minimal valid input', () => {
    const result = hostAddToWaitlistSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('host'); // default
    }
  });

  it('validates full input', () => {
    const result = hostAddToWaitlistSchema.safeParse({
      ...validInput,
      customerId: 'cust-1',
      seatingPreference: 'outdoor',
      specialRequests: 'High chair needed',
      source: 'qr_code',
      clientRequestId: 'req-456',
    });
    expect(result.success).toBe(true);
  });

  it('allows waitlist entry without phone (phone is optional)', () => {
    const result = hostAddToWaitlistSchema.safeParse({
      guestName: 'Jane Doe',
      partySize: 2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid phone format', () => {
    const result = hostAddToWaitlistSchema.safeParse({
      ...validInput,
      guestPhone: '555-1234',
    });
    expect(result.success).toBe(false);
  });

  it('rejects party size 0', () => {
    const result = hostAddToWaitlistSchema.safeParse({
      ...validInput,
      partySize: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid source', () => {
    const result = hostAddToWaitlistSchema.safeParse({
      ...validInput,
      source: 'phone',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid seating preference', () => {
    const result = hostAddToWaitlistSchema.safeParse({
      ...validInput,
      seatingPreference: 'rooftop',
    });
    expect(result.success).toBe(false);
  });
});

// ── Update Waitlist Entry Schema Tests ──────────────────────────

describe('hostUpdateWaitlistEntrySchema', () => {
  it('validates empty update', () => {
    const result = hostUpdateWaitlistEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates partial update', () => {
    const result = hostUpdateWaitlistEntrySchema.safeParse({
      partySize: 4,
      seatingPreference: 'booth',
    });
    expect(result.success).toBe(true);
  });

  it('allows nullable fields to be set to null', () => {
    const result = hostUpdateWaitlistEntrySchema.safeParse({
      seatingPreference: null,
      specialRequests: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });
});

// ── Seat from Waitlist Schema Tests ─────────────────────────────

describe('hostSeatFromWaitlistSchema', () => {
  it('validates with table IDs', () => {
    const result = hostSeatFromWaitlistSchema.safeParse({
      tableIds: ['table-1'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty table IDs array', () => {
    const result = hostSeatFromWaitlistSchema.safeParse({
      tableIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('validates with server user ID', () => {
    const result = hostSeatFromWaitlistSchema.safeParse({
      tableIds: ['table-1'],
      serverUserId: 'server-1',
    });
    expect(result.success).toBe(true);
  });
});

// ── Notify Waitlist Schema Tests ────────────────────────────────

describe('hostNotifyWaitlistSchema', () => {
  it('defaults method to manual', () => {
    const result = hostNotifyWaitlistSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('manual');
    }
  });

  it('accepts sms method', () => {
    const result = hostNotifyWaitlistSchema.safeParse({
      method: 'sms',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid method', () => {
    const result = hostNotifyWaitlistSchema.safeParse({
      method: 'email',
    });
    expect(result.success).toBe(false);
  });
});

// ── Remove from Waitlist Schema Tests ───────────────────────────

describe('hostRemoveFromWaitlistSchema', () => {
  it('defaults reason to canceled', () => {
    const result = hostRemoveFromWaitlistSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('canceled');
    }
  });

  it('accepts left reason', () => {
    const result = hostRemoveFromWaitlistSchema.safeParse({
      reason: 'left',
    });
    expect(result.success).toBe(true);
  });

  it('accepts no_show reason', () => {
    const result = hostRemoveFromWaitlistSchema.safeParse({
      reason: 'no_show',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid reason', () => {
    const result = hostRemoveFromWaitlistSchema.safeParse({
      reason: 'bored',
    });
    expect(result.success).toBe(false);
  });
});

// ── Turn Log & Notification Schema Tests ────────────────────────

describe('recordTableTurnSchema', () => {
  it('validates with table ID', () => {
    const result = recordTableTurnSchema.safeParse({
      tableId: 'table-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty table ID', () => {
    const result = recordTableTurnSchema.safeParse({
      tableId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('sendGuestNotificationSchema', () => {
  it('validates a full notification', () => {
    const result = sendGuestNotificationSchema.safeParse({
      referenceType: 'reservation',
      referenceId: 'res-1',
      notificationType: 'confirmation',
      channel: 'sms',
      recipientPhone: '+15551234567',
      messageBody: 'Your table is ready!',
    });
    expect(result.success).toBe(true);
  });

  it('validates email channel', () => {
    const result = sendGuestNotificationSchema.safeParse({
      referenceType: 'waitlist',
      referenceId: 'wl-1',
      notificationType: 'table_ready',
      channel: 'email',
      recipientEmail: 'guest@example.com',
      messageBody: 'Your table is ready!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid notification type', () => {
    const result = sendGuestNotificationSchema.safeParse({
      referenceType: 'reservation',
      referenceId: 'res-1',
      notificationType: 'invalid_type',
      channel: 'sms',
      messageBody: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty message body', () => {
    const result = sendGuestNotificationSchema.safeParse({
      referenceType: 'reservation',
      referenceId: 'res-1',
      notificationType: 'reminder',
      channel: 'sms',
      messageBody: '',
    });
    expect(result.success).toBe(false);
  });
});

// ── Query Filter Schema Tests ───────────────────────────────────

describe('hostListReservationsFilterSchema', () => {
  const validFilter = {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    date: '2026-03-15',
  };

  it('validates minimal filter', () => {
    const result = hostListReservationsFilterSchema.safeParse(validFilter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50); // default
    }
  });

  it('validates with all optional filters', () => {
    const result = hostListReservationsFilterSchema.safeParse({
      ...validFilter,
      mealPeriod: 'dinner',
      status: 'confirmed',
      search: 'Smith',
      cursor: 'cursor-abc',
      limit: 25,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = hostListReservationsFilterSchema.safeParse({
      ...validFilter,
      date: 'March 15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit over 100', () => {
    const result = hostListReservationsFilterSchema.safeParse({
      ...validFilter,
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});

describe('hostGetUpcomingReservationsSchema', () => {
  it('validates with defaults', () => {
    const result = hostGetUpcomingReservationsSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20); // default
    }
  });
});

describe('hostListWaitlistFilterSchema', () => {
  it('validates filter', () => {
    const result = hostListWaitlistFilterSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('hostGetDashboardMetricsSchema', () => {
  it('validates filter', () => {
    const result = hostGetDashboardMetricsSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('hostGetTableTurnStatsSchema', () => {
  it('validates with default days', () => {
    const result = hostGetTableTurnStatsSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(28); // default
    }
  });

  it('rejects days over 90', () => {
    const result = hostGetTableTurnStatsSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      days: 91,
    });
    expect(result.success).toBe(false);
  });
});

describe('hostGetPreShiftReportSchema', () => {
  it('validates filter', () => {
    const result = hostGetPreShiftReportSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      date: '2026-03-15',
      mealPeriod: 'dinner',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing meal period', () => {
    const result = hostGetPreShiftReportSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      date: '2026-03-15',
    });
    expect(result.success).toBe(false);
  });
});

// ── Host Event Naming Tests ─────────────────────────────────────

describe('HOST_EVENTS', () => {
  it('has correct event naming convention', () => {
    const eventNames = Object.values(HOST_EVENTS);
    for (const name of eventNames) {
      expect(name).toMatch(/^[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('all events are in the fnb domain', () => {
    const eventNames = Object.values(HOST_EVENTS);
    for (const name of eventNames) {
      expect(name.startsWith('fnb.')).toBe(true);
    }
  });

  it('has no duplicate event values', () => {
    const values = Object.values(HOST_EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('has exactly 9 event types', () => {
    expect(Object.keys(HOST_EVENTS)).toHaveLength(9);
  });
});
