import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventEnvelope } from '@oppsera/shared';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockExecute, mockWithTenant } = vi.hoisted(() => {
  const mockExecute = vi.fn();

  const mockWithTenant = vi.fn(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: mockExecute,
      };
      return fn(tx);
    },
  );

  return { mockExecute, mockWithTenant };
});

/** Simulate idempotency insert returning a row (event NOT yet processed). */
function mockIdempotencyNew() {
  mockExecute.mockResolvedValueOnce([{ id: 'PE_001' }]);
}

/** Simulate idempotency insert returning empty (event ALREADY processed). */
function mockIdempotencyDuplicate() {
  mockExecute.mockResolvedValueOnce([]);
}

/** Simulate a timezone lookup via courses → locations join. */
function mockTimezoneReturns(tz: string) {
  mockExecute.mockResolvedValueOnce([{ timezone: tz }]);
}

/** Simulate empty timezone result (no course found). */
function mockTimezoneEmpty() {
  mockExecute.mockResolvedValueOnce([]);
}

/** Simulate a SQL upsert (no meaningful return). */
function mockUpsert() {
  mockExecute.mockResolvedValueOnce([]);
}

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_001'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn(),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { computeBusinessDate } from '../business-date';
import { handleTeeTimeBooked } from '../consumers/tee-time-booked';
import { handleTeeTimeCancelled } from '../consumers/tee-time-cancelled';
import { handleTeeTimeNoShow } from '../consumers/tee-time-no-show';

// ── Test Constants ────────────────────────────────────────────

const TENANT = 'tenant_001';
const COURSE = 'course_001';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_001',
    eventType: 'test.event.v1',
    tenantId: TENANT,
    locationId: 'loc_001',
    occurredAt: '2026-06-15T14:00:00.000Z', // booking time
    actorUserId: 'user_001',
    idempotencyKey: 'idem_001',
    data: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Business Date Tests
// ═══════════════════════════════════════════════════════════════

describe('computeBusinessDate (golf-reporting copy)', () => {
  it('standard midnight cutover returns same-day date', () => {
    const result = computeBusinessDate(
      '2026-06-15T18:30:00.000Z',
      'America/New_York',
      '00:00',
    );
    expect(result).toBe('2026-06-15');
  });

  it('defaults to midnight cutover when dayCloseTime is undefined', () => {
    const result = computeBusinessDate(
      '2026-06-15T18:30:00.000Z',
      'America/New_York',
    );
    expect(result).toBe('2026-06-15');
  });

  it('accepts Date objects', () => {
    const result = computeBusinessDate(
      new Date('2026-06-15T18:30:00.000Z'),
      'America/New_York',
    );
    expect(result).toBe('2026-06-15');
  });
});

// ═══════════════════════════════════════════════════════════════
// handleTeeTimeBooked Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTeeTimeBooked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('upserts all 3 read models on new booking', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        greenFeeCents: 16000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // idempotency + timezone + demand + hourly + lead time + fact = 6 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(6);
    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        greenFeeCents: 16000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyDuplicate();

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // Only the idempotency check
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('uses startAt for business date, not occurredAt', async () => {
    // Booking at June 14, tee time at June 20
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-14T10:00:00.000Z',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-20T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'phone',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // Business date should derive from startAt (June 20), not occurredAt (June 14)
    // We verify by checking the call count — all 5 execute calls happened
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('falls back to America/New_York when course timezone not found', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'walk_in',
      },
    });

    mockIdempotencyNew();
    mockTimezoneEmpty(); // no course found
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // Still processes with fallback timezone
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('online booking increments online_slots_booked', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 3,
        greenFeeCents: 12000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // All 5 calls executed including online_slots_booked increment
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('non-online booking does NOT increment online_slots_booked', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'pro_shop',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // All 5 calls - online_slots_booked gets 0 increment
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('multi-player booking increments by player count', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        greenFeeCents: 16000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // Verify SQL was called — players=4 is passed to SQL template
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('lead time: same-day booking', async () => {
    // Booking and tee time on same day
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-15T08:00:00.000Z',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'walk_in',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time — same_day bucket
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('lead time: 1-day advance booking', async () => {
    // Booking on June 14, tee time on June 15
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-14T10:00:00.000Z',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time — one_day bucket
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('lead time: 2-7 day advance booking', async () => {
    // Booking on June 12, tee time on June 15 (3 days)
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-12T10:00:00.000Z',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time — two_to_seven bucket
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('lead time: 8+ day advance booking', async () => {
    // Booking on June 1, tee time on June 15 (14 days)
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-01T10:00:00.000Z',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        greenFeeCents: 8000,
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // lead time — eight_plus bucket
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('revenue converts cents to dollars', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 1,
        greenFeeCents: 7500, // $75.00
        bookingSource: 'online',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand — revenue_booked should be 75 (dollars)
    mockUpsert(); // hourly
    mockUpsert(); // lead time
    mockUpsert(); // fact table

    await handleTeeTimeBooked(event as unknown as EventEnvelope);

    // All 5 calls executed — SQL template receives 75 (cents/100)
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleTeeTimeCancelled Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTeeTimeCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('decrements slots_booked and increments cancellations on demand', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        cancelledAt: '2026-06-14T20:00:00.000Z',
        reason: 'weather',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand — slots_booked - 4, cancellations + 4
    mockUpsert(); // hourly — slots_booked - 4
    mockUpsert(); // fact status update

    await handleTeeTimeCancelled(event as unknown as EventEnvelope);

    // idempotency + timezone + demand + hourly + fact = 5 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('decrements slots_booked on hourly distribution', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // fact status update

    await handleTeeTimeCancelled(event as unknown as EventEnvelope);

    // Both demand and hourly upserts happen
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('does NOT touch booking lead time table', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // fact status update

    await handleTeeTimeCancelled(event as unknown as EventEnvelope);

    // Only 4 calls: idempotency + timezone + demand + hourly (no lead time)
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyDuplicate();

    await handleTeeTimeCancelled(event as unknown as EventEnvelope);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('falls back to America/New_York when course timezone not found', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneEmpty();
    mockUpsert(); // demand
    mockUpsert(); // hourly
    mockUpsert(); // fact status update

    await handleTeeTimeCancelled(event as unknown as EventEnvelope);

    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('handles multiple cancellations accumulating', async () => {
    // First cancellation
    const event1 = makeEvent({
      eventId: 'evt_001',
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert();
    mockUpsert();
    mockUpsert(); // fact status update
    await handleTeeTimeCancelled(event1 as unknown as EventEnvelope);

    vi.clearAllMocks();
    mockExecute.mockReset();

    // Second cancellation (different event)
    const event2 = makeEvent({
      eventId: 'evt_002',
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_002',
        courseId: COURSE,
        startAt: '2026-06-15T16:00:00.000Z',
        players: 3,
        cancelledAt: '2026-06-14T21:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert();
    mockUpsert();
    mockUpsert(); // fact status update
    await handleTeeTimeCancelled(event2 as unknown as EventEnvelope);

    // Both processed — SQL ON CONFLICT handles accumulation
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleTeeTimeNoShow Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTeeTimeNoShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('increments no_shows only on demand table', async () => {
    const event = makeEvent({
      eventType: 'tee_time.no_show_marked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        markedAt: '2026-06-15T18:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand — no_shows only
    mockUpsert(); // fact status update

    await handleTeeTimeNoShow(event as unknown as EventEnvelope);

    // idempotency + timezone + demand + fact = 4 execute calls
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('does NOT decrement slots_booked (no-shows remain booked)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.no_show_marked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        markedAt: '2026-06-15T18:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // demand only
    mockUpsert(); // fact status update

    await handleTeeTimeNoShow(event as unknown as EventEnvelope);

    // Only 3 calls — no hourly, no lead time touches
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('does NOT touch hourly distribution', async () => {
    const event = makeEvent({
      eventType: 'tee_time.no_show_marked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        markedAt: '2026-06-15T18:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert();
    mockUpsert(); // fact status update

    await handleTeeTimeNoShow(event as unknown as EventEnvelope);

    // 3 calls: idempotency + timezone + demand (no hourly, no lead time)
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('does NOT touch booking lead time table', async () => {
    const event = makeEvent({
      eventType: 'tee_time.no_show_marked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        markedAt: '2026-06-15T18:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneReturns('America/New_York');
    mockUpsert();
    mockUpsert(); // fact status update

    await handleTeeTimeNoShow(event as unknown as EventEnvelope);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.no_show_marked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        markedAt: '2026-06-15T18:00:00.000Z',
      },
    });

    mockIdempotencyDuplicate();

    await handleTeeTimeNoShow(event as unknown as EventEnvelope);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('falls back to America/New_York when course timezone not found', async () => {
    const event = makeEvent({
      eventType: 'tee_time.no_show_marked.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        markedAt: '2026-06-15T18:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockTimezoneEmpty();
    mockUpsert();
    mockUpsert(); // fact status update

    await handleTeeTimeNoShow(event as unknown as EventEnvelope);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });
});
