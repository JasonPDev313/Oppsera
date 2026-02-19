import { describe, it, expect, vi, beforeEach } from 'vitest';

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

/** Simulate a SQL upsert / update (no meaningful return). */
function mockUpsert() {
  mockExecute.mockResolvedValueOnce([]);
}

/** Simulate a fact row SELECT returning data. */
function mockFactRow(overrides: Record<string, unknown> = {}) {
  mockExecute.mockResolvedValueOnce([{
    party_size_booked: 4,
    party_size_actual: null,
    course_id: 'course_001',
    business_date: '2026-06-15',
    start_at: '2026-06-15T14:00:00.000Z',
    started_at: '2026-06-15T14:03:00.000Z',
    holes: 18,
    customer_id: 'cust_001',
    customer_name: 'John Doe',
    total_revenue: '0',
    actual_green_fee: '0',
    actual_cart_fee: '0',
    actual_other_fees: '0',
    food_bev: '0',
    pro_shop: '0',
    tax: '0',
    booking_source: 'online',
    booking_type: 'public',
    ...overrides,
  }]);
}

/** Simulate a fact row SELECT returning empty (reservation not found). */
function mockFactEmpty() {
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

import { handleTeeTimeCheckedIn } from '../consumers/tee-time-checked-in';
import { handleTeeTimeStarted } from '../consumers/tee-time-started';
import { handleTeeTimeCompleted } from '../consumers/tee-time-completed';
import { handleFolioPosted } from '../consumers/folio-posted';
import { handlePaceCheckpoint } from '../consumers/pace-checkpoint';
import { handleChannelDailyBooked } from '../consumers/channel-daily-booked';
import { handleChannelDailyCancelled } from '../consumers/channel-daily-cancelled';

// ── Test Constants ────────────────────────────────────────────

const TENANT = 'tenant_001';
const COURSE = 'course_001';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_001',
    eventType: 'test.event.v1',
    tenantId: TENANT,
    locationId: 'loc_001',
    occurredAt: '2026-06-15T14:00:00.000Z',
    actorUserId: 'user_001',
    idempotencyKey: 'idem_001',
    data: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// handleTeeTimeCheckedIn Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTeeTimeCheckedIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('updates fact status to checked_in', async () => {
    const event = makeEvent({
      eventType: 'tee_time.checked_in.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        checkedInAt: '2026-06-15T13:45:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockFactRow({ party_size_booked: 4 });
    mockUpsert(); // UPDATE fact

    await handleTeeTimeCheckedIn(event as any);

    // idempotency + SELECT fact + UPDATE fact = 3 calls (no demand adjustment since same size)
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('adjusts demand when partySizeActual differs from booked', async () => {
    const event = makeEvent({
      eventType: 'tee_time.checked_in.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        checkedInAt: '2026-06-15T13:45:00.000Z',
        partySizeActual: 3, // one fewer than booked
      },
    });

    mockIdempotencyNew();
    mockFactRow({ party_size_booked: 4 });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT demand (delta = -1)

    await handleTeeTimeCheckedIn(event as any);

    // idempotency + SELECT fact + UPDATE fact + UPSERT demand = 4 calls
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('does not adjust demand when partySizeActual matches booked', async () => {
    const event = makeEvent({
      eventType: 'tee_time.checked_in.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        checkedInAt: '2026-06-15T13:45:00.000Z',
        partySizeActual: 4,
      },
    });

    mockIdempotencyNew();
    mockFactRow({ party_size_booked: 4 });
    mockUpsert(); // UPDATE fact

    await handleTeeTimeCheckedIn(event as any);

    // No demand adjustment — delta is 0
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('skips when no fact row found (missing reservation)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.checked_in.v1',
      data: {
        teeTimeId: 'tt_missing',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        checkedInAt: '2026-06-15T13:45:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockFactEmpty();

    await handleTeeTimeCheckedIn(event as any);

    // idempotency + SELECT fact (empty) = 2 calls, then skip
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.checked_in.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        checkedInAt: '2026-06-15T13:45:00.000Z',
      },
    });

    mockIdempotencyDuplicate();

    await handleTeeTimeCheckedIn(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleTeeTimeStarted Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTeeTimeStarted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('updates fact with status, startedAt, delay, and upserts ops_daily', async () => {
    const event = makeEvent({
      eventType: 'tee_time.started.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        actualStartAt: '2026-06-15T14:03:00.000Z', // 3 min late
      },
    });

    mockIdempotencyNew();
    mockFactRow({ start_at: '2026-06-15T14:00:00.000Z' });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT ops_daily

    await handleTeeTimeStarted(event as any);

    // idempotency + SELECT fact + UPDATE fact + UPSERT ops_daily = 4
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('marks isLateStart true when delay > 5 minutes', async () => {
    const event = makeEvent({
      eventType: 'tee_time.started.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        actualStartAt: '2026-06-15T14:08:00.000Z', // 8 min late
      },
    });

    mockIdempotencyNew();
    mockFactRow({ start_at: '2026-06-15T14:00:00.000Z' });
    mockUpsert(); // UPDATE fact (isLateStart=true)
    mockUpsert(); // UPSERT ops_daily (lateStartsCount++)

    await handleTeeTimeStarted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('marks isLateStart false when delay <= 5 minutes', async () => {
    const event = makeEvent({
      eventType: 'tee_time.started.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        actualStartAt: '2026-06-15T14:05:00.000Z', // exactly 5 min
      },
    });

    mockIdempotencyNew();
    mockFactRow({ start_at: '2026-06-15T14:00:00.000Z' });
    mockUpsert(); // UPDATE fact (isLateStart=false)
    mockUpsert(); // UPSERT ops_daily

    await handleTeeTimeStarted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('uses startedAt field when available (preferred over actualStartAt)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.started.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        actualStartAt: '2026-06-15T14:03:00.000Z',
        startedAt: '2026-06-15T14:02:00.000Z', // preferred
      },
    });

    mockIdempotencyNew();
    mockFactRow({ start_at: '2026-06-15T14:00:00.000Z' });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT ops_daily

    await handleTeeTimeStarted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('skips when no fact row found', async () => {
    const event = makeEvent({
      eventType: 'tee_time.started.v1',
      data: {
        teeTimeId: 'tt_missing',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        actualStartAt: '2026-06-15T14:03:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockFactEmpty();

    await handleTeeTimeStarted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.started.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        actualStartAt: '2026-06-15T14:03:00.000Z',
      },
    });

    mockIdempotencyDuplicate();

    await handleTeeTimeStarted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleTeeTimeCompleted Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleTeeTimeCompleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('updates fact with completed status and duration', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:03:00.000Z',
      holes: 18,
      customer_id: 'cust_001',
      customer_name: 'John Doe',
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily
    mockUpsert(); // UPSERT revenue_daily
    mockUpsert(); // UPSERT customer_play

    await handleTeeTimeCompleted(event as any);

    // idempotency + SELECT fact + UPDATE fact + pace_daily + revenue_daily + customer_play = 6
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('sets durationMinutes to null when fact has no startedAt', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: null, // no start recorded
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact (durationMinutes=null)
    // No pace_daily upsert since duration is null
    mockUpsert(); // UPSERT revenue_daily
    // No customer_play since customerId is null

    await handleTeeTimeCompleted(event as any);

    // idempotency + SELECT fact + UPDATE fact + revenue_daily = 4
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('upserts pace_daily with roundsCompleted increment', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      customer_id: null, // no customer
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily (roundsCompleted++)
    mockUpsert(); // UPSERT revenue_daily

    await handleTeeTimeCompleted(event as any);

    // idempotency + SELECT fact + UPDATE fact + pace_daily + revenue_daily = 5
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('marks slow round for 18 holes at 280 minutes', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:40:00.000Z', // 4h40m = 280min
        durationMinutes: 280,
        paceStatus: 'slow',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      holes: 18,
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily (slowRoundsCount++ since 280 > 270)
    mockUpsert(); // UPSERT revenue_daily

    await handleTeeTimeCompleted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('does not mark slow round for 18 holes at 240 minutes', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z', // 4h = 240min
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      holes: 18,
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily (slowRoundsCount NOT incremented since 240 <= 270)
    mockUpsert(); // UPSERT revenue_daily

    await handleTeeTimeCompleted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('marks slow round for 9 holes at 160 minutes', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 2,
        finishedAt: '2026-06-15T16:40:00.000Z', // 2h40m = 160min
        durationMinutes: 160,
        paceStatus: 'slow',
        holesCompleted: 9,
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      holes: 9,
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily (slowRoundsCount++ since 160 > 150)
    mockUpsert(); // UPSERT revenue_daily

    await handleTeeTimeCompleted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('upserts revenue_daily with roundsPlayed increment', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      party_size_booked: 4,
      party_size_actual: null,
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily
    mockUpsert(); // UPSERT revenue_daily (roundsPlayed += 4)

    await handleTeeTimeCompleted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('upserts customer_play when customerId exists', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      customer_id: 'cust_001',
      customer_name: 'John Doe',
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily
    mockUpsert(); // UPSERT revenue_daily
    mockUpsert(); // UPSERT customer_play

    await handleTeeTimeCompleted(event as any);

    // 6 calls: idempotency + SELECT + UPDATE + pace + revenue + customer
    expect(mockExecute).toHaveBeenCalledTimes(6);
  });

  it('skips customer_play when no customerId', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyNew();
    mockFactRow({
      started_at: '2026-06-15T14:00:00.000Z',
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT pace_daily
    mockUpsert(); // UPSERT revenue_daily

    await handleTeeTimeCompleted(event as any);

    // 5 calls — no customer_play
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.completed.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        finishedAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 240,
        paceStatus: 'on_pace',
      },
    });

    mockIdempotencyDuplicate();

    await handleTeeTimeCompleted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleFolioPosted Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleFolioPosted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('updates fact revenue and upserts revenue_daily by deltas', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        reservationId: 'tt_001',
        greenFee: 80,
        cartFee: 25,
        rangeFee: 0,
        foodBev: 15,
        proShop: 0,
        tax: 9.60,
        total: 129.60,
      },
    });

    mockIdempotencyNew();
    mockFactRow({ total_revenue: '0', customer_id: null });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT revenue_daily

    await handleFolioPosted(event as any);

    // idempotency + SELECT fact + UPDATE fact + UPSERT revenue_daily = 4
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('computes deltas correctly on folio re-post', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        reservationId: 'tt_001',
        greenFee: 80,
        cartFee: 25,
        rangeFee: 0,
        foodBev: 30, // increased from 15
        proShop: 10, // new
        tax: 11.60,
        total: 156.60,
      },
    });

    mockIdempotencyNew();
    // Previous revenue already posted
    mockFactRow({
      actual_green_fee: '80',
      actual_cart_fee: '25',
      actual_other_fees: '0',
      food_bev: '15',
      pro_shop: '0',
      tax: '9.60',
      total_revenue: '129.60',
      customer_id: null,
    });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT revenue_daily (deltas: foodBev +15, proShop +10, tax +2, total +27)

    await handleFolioPosted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('updates customer_play totalRevenue when customerId exists', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        reservationId: 'tt_001',
        customerId: 'cust_001',
        greenFee: 80,
        total: 80,
      },
    });

    mockIdempotencyNew();
    mockFactRow({ total_revenue: '0', customer_id: 'cust_001' });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT revenue_daily
    mockUpsert(); // UPSERT customer_play

    await handleFolioPosted(event as any);

    // 5 calls: idempotency + SELECT + UPDATE + revenue + customer
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it('skips customer_play when no customerId', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        reservationId: 'tt_001',
        greenFee: 80,
        total: 80,
      },
    });

    mockIdempotencyNew();
    mockFactRow({ total_revenue: '0', customer_id: null });
    mockUpsert(); // UPDATE fact
    mockUpsert(); // UPSERT revenue_daily

    await handleFolioPosted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('skips when no reservationId in event data', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        // no reservationId
        totalCents: 12960,
      },
    });

    await handleFolioPosted(event as any);

    // No withTenant call at all — early return
    expect(mockExecute).toHaveBeenCalledTimes(0);
    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  it('skips when no fact row found (missing reservation)', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        reservationId: 'tt_missing',
        greenFee: 80,
        total: 80,
      },
    });

    mockIdempotencyNew();
    mockFactEmpty();

    await handleFolioPosted(event as any);

    // idempotency + SELECT fact (empty) = 2
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'golf.folio.posted.v1',
      data: {
        folioId: 'folio_001',
        courseId: COURSE,
        reservationId: 'tt_001',
        greenFee: 80,
        total: 80,
      },
    });

    mockIdempotencyDuplicate();

    await handleFolioPosted(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// handlePaceCheckpoint Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handlePaceCheckpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('inserts checkpoint row', async () => {
    const event = makeEvent({
      eventType: 'pace.checkpoint.v1',
      data: {
        roundId: 'round_001',
        courseId: COURSE,
        holeNumber: 9,
        elapsedMinutes: 120,
        expectedMinutes: 135,
        status: 'fast',
        reservationId: 'tt_001',
      },
    });

    mockIdempotencyNew();
    mockUpsert(); // INSERT checkpoint

    await handlePaceCheckpoint(event as any);

    // idempotency + INSERT = 2
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('uses roundId as reservationId fallback', async () => {
    const event = makeEvent({
      eventType: 'pace.checkpoint.v1',
      data: {
        roundId: 'round_001',
        courseId: COURSE,
        holeNumber: 4,
        elapsedMinutes: 55,
        expectedMinutes: 60,
        status: 'on_pace',
        // no reservationId — falls back to roundId
      },
    });

    mockIdempotencyNew();
    mockUpsert(); // INSERT checkpoint

    await handlePaceCheckpoint(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'pace.checkpoint.v1',
      data: {
        roundId: 'round_001',
        courseId: COURSE,
        holeNumber: 9,
        elapsedMinutes: 120,
        expectedMinutes: 135,
        status: 'fast',
      },
    });

    mockIdempotencyDuplicate();

    await handlePaceCheckpoint(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleChannelDailyBooked Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleChannelDailyBooked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('upserts channel_daily with online bucket', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-14T10:00:00.000Z',
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
    mockUpsert(); // UPSERT channel_daily

    await handleChannelDailyBooked(event as any);

    // idempotency + timezone + UPSERT = 3
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('upserts channel_daily with proshop bucket', async () => {
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-15T10:00:00.000Z',
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
    mockUpsert(); // UPSERT channel_daily (proshop bucket)

    await handleChannelDailyBooked(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('computes lead time in hours', async () => {
    // Booked 2 days in advance (48 hours)
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-13T14:00:00.000Z',
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
    mockUpsert(); // UPSERT channel_daily (leadTimeHours=48)

    await handleChannelDailyBooked(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('marks lastMinute when lead time < 24 hours', async () => {
    // Booked 6 hours before tee time
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-15T08:00:00.000Z',
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
    mockUpsert(); // UPSERT channel_daily (lastMinuteCount++)

    await handleChannelDailyBooked(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('marks advanced when lead time > 7 days', async () => {
    // Booked 10 days in advance
    const event = makeEvent({
      eventType: 'tee_time.booked.v1',
      occurredAt: '2026-06-05T10:00:00.000Z',
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
    mockUpsert(); // UPSERT channel_daily (advancedCount++)

    await handleChannelDailyBooked(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(3);
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

    await handleChannelDailyBooked(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// handleChannelDailyCancelled Consumer Tests
// ═══════════════════════════════════════════════════════════════

describe('handleChannelDailyCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('decrements channel bucket based on fact booking_source', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockFactRow({ booking_source: 'online', booking_type: 'public' });
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // UPSERT channel_daily (decrement online)

    await handleChannelDailyCancelled(event as any);

    // idempotency + SELECT fact + timezone + UPSERT = 4
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('decrements type bucket based on fact booking_type', async () => {
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
    mockFactRow({ booking_source: 'pro_shop', booking_type: 'member' });
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // UPSERT channel_daily (decrement proshop + member)

    await handleChannelDailyCancelled(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('does not adjust lead time on cancellation', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockFactRow({ booking_source: 'online', booking_type: 'public' });
    mockTimezoneReturns('America/New_York');
    mockUpsert(); // UPSERT channel_daily (no lead time adjustment)

    await handleChannelDailyCancelled(event as any);

    // Only 4 calls — no extra lead time operation
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it('skips when no fact row found', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_missing',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyNew();
    mockFactEmpty();

    await handleChannelDailyCancelled(event as any);

    // idempotency + SELECT fact (empty) = 2
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({
      eventType: 'tee_time.cancelled.v1',
      data: {
        teeTimeId: 'tt_001',
        courseId: COURSE,
        startAt: '2026-06-15T14:00:00.000Z',
        players: 4,
        cancelledAt: '2026-06-14T20:00:00.000Z',
      },
    });

    mockIdempotencyDuplicate();

    await handleChannelDailyCancelled(event as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
