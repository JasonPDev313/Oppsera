import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════
// Conflict Detector Tests
// ══════════════════════════════════════════════════════════════════
//
// detectConflicts runs 5 parallel DB checks inside withTenant:
//   1. Provider availability (working hours)
//   2. Provider time-off (approved leave)
//   3. Provider existing appointments (overlapping active bookings)
//   4. Resource availability (overlapping resource bookings)
//   5. Customer overlap (customer already booked at this time)
//
// We mock withTenant to inject a fake tx with select/execute chains
// that return controlled data sets. The conflict detector builds
// Drizzle queries via chained methods (.select → .from → .where → .limit)
// and we intercept those to return the desired rows.
// ══════════════════════════════════════════════════════════════════

// ── Hoisted mocks ─────────────────────────────────────────────────

/**
 * queryLog accumulates ordered descriptions of each DB call made by
 * the conflict detector. Tests inspect this to verify the right
 * number of queries ran and in which order. We push entries inside
 * mock chain builders so every test can assert query patterns.
 */
const { mockWithTenant, queryResults, queryLog } = vi.hoisted(() => {
  /** Mutable array – tests push results here; each select() call shifts one off. */
  const queryResults: unknown[][] = [];

  /** Ordered log of select() calls for assertion. */
  const queryLog: string[] = [];

  /**
   * Builds a chainable Drizzle-like select object that resolves
   * to the next entry from queryResults. Calling `.where()` is the
   * typical terminal step before the implicit await.
   */
  function makeSelectChain(): Record<string, ReturnType<typeof vi.fn>> {
    const result = queryResults.shift() ?? [];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    // Drizzle queries are thenable — the runtime does `await tx.select(…).from(…).where(…)`
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    (chain as any)[Symbol.iterator] = vi.fn(function* () { yield* (result as unknown[]); });
    return chain;
  }

  const mockWithTenant = vi.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => {
          queryLog.push('select');
          return makeSelectChain();
        }),
        execute: vi.fn().mockResolvedValue([]),
      };
      return fn(tx);
    },
  );

  return { mockWithTenant, queryResults, queryLog };
});

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  spaAppointments: {
    tenantId: 'spa_appointments.tenant_id',
    providerId: 'spa_appointments.provider_id',
    customerId: 'spa_appointments.customer_id',
    resourceId: 'spa_appointments.resource_id',
    status: 'spa_appointments.status',
    startAt: 'spa_appointments.start_at',
    endAt: 'spa_appointments.end_at',
    id: 'spa_appointments.id',
    appointmentNumber: 'spa_appointments.appointment_number',
  },
  spaProviderAvailability: {
    id: 'spa_provider_availability.id',
    tenantId: 'spa_provider_availability.tenant_id',
    providerId: 'spa_provider_availability.provider_id',
    dayOfWeek: 'spa_provider_availability.day_of_week',
    startTime: 'spa_provider_availability.start_time',
    endTime: 'spa_provider_availability.end_time',
    locationId: 'spa_provider_availability.location_id',
    effectiveFrom: 'spa_provider_availability.effective_from',
    effectiveUntil: 'spa_provider_availability.effective_until',
    isActive: 'spa_provider_availability.is_active',
  },
  spaProviderTimeOff: {
    id: 'spa_provider_time_off.id',
    tenantId: 'spa_provider_time_off.tenant_id',
    providerId: 'spa_provider_time_off.provider_id',
    startAt: 'spa_provider_time_off.start_at',
    endAt: 'spa_provider_time_off.end_at',
    reason: 'spa_provider_time_off.reason',
    isAllDay: 'spa_provider_time_off.is_all_day',
    status: 'spa_provider_time_off.status',
  },
  spaResources: {
    id: 'spa_resources.id',
    tenantId: 'spa_resources.tenant_id',
    name: 'spa_resources.name',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
  not: vi.fn((a: unknown) => ({ op: 'not', a })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ op: 'inArray', a, b })),
  lt: vi.fn((a: unknown, b: unknown) => ({ op: 'lt', a, b })),
  gt: vi.fn((a: unknown, b: unknown) => ({ op: 'gt', a, b })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings,
    values,
  })),
}));

import { detectConflicts } from '../helpers/conflict-detector';
import type { ConflictCheckParams } from '../helpers/conflict-detector';

// ── Test Fixtures ─────────────────────────────────────────────────

const TENANT_ID = 'tenant_01';
const PROVIDER_ID = 'provider_01';
const CUSTOMER_ID = 'customer_01';
const LOCATION_ID = 'location_01';
const RESOURCE_ROOM_A = 'resource_room_a';
const RESOURCE_EQUIP_B = 'resource_equip_b';
const APPT_EXISTING = 'appt_existing_01';
const APPT_SELF = 'appt_self_01';

/** Helper: create a Date from an ISO string for readability. */
function d(iso: string): Date {
  return new Date(iso);
}

/** Build base ConflictCheckParams for a 1-hour appointment on a Wednesday. */
function baseParams(overrides: Partial<ConflictCheckParams> = {}): ConflictCheckParams {
  return {
    tenantId: TENANT_ID,
    providerId: PROVIDER_ID,
    // Wednesday 2026-03-04 10:00–11:00 UTC
    startTime: d('2026-03-04T10:00:00Z'),
    endTime: d('2026-03-04T11:00:00Z'),
    ...overrides,
  };
}

/**
 * Queue DB query results for the 5 parallel checks.
 *
 * detectConflicts runs 5 checks in parallel (via Promise.all):
 *   1. checkProviderAvailability — 1 select (availability slots)
 *      - if 0 effective slots found: 1 more select (any slots at all?)
 *   2. checkProviderTimeOff — 1 select
 *   3. checkProviderAppointments — 1 select
 *   4. checkResourceAvailability — per resource: 1 select (overlapping appts)
 *      - if overlapping: 1 more select (resource name lookup)
 *   5. checkCustomerOverlap — 1 select
 *
 * Because Promise.all runs them concurrently but tx.select() is
 * called sequentially inside each check, the mock results array
 * is consumed in the order the checks make their first select().
 *
 * For simplicity we push results in the documented order:
 *   [availability slots, timeOff, providerAppts, ...resourceChecks, customerOverlap]
 *
 * When availability has no effective slots, push a second result
 * for the "any slots at all?" follow-up query.
 */
function queueNoConflicts(opts?: {
  resourceIds?: string[];
  customerId?: boolean;
  availabilitySlots?: unknown[];
}) {
  const {
    resourceIds = [],
    customerId = false,
    availabilitySlots,
  } = opts ?? {};

  // 1. Provider availability — effective slots covering the appointment time
  queryResults.push(
    availabilitySlots ?? [
      {
        startTime: '08:00',
        endTime: '18:00',
        locationId: null,
        effectiveFrom: '2026-01-01',
        effectiveUntil: null,
      },
    ],
  );
  // 2. Provider time off — none
  queryResults.push([]);
  // 3. Provider existing appointments — none
  queryResults.push([]);
  // 4. Resource checks — per resource: overlapping appointments (none)
  for (const _rid of resourceIds) {
    queryResults.push([]);
  }
  // 5. Customer overlap (only queried if customerId provided) — none
  if (customerId) {
    queryResults.push([]);
  }
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  queryResults.length = 0;
  queryLog.length = 0;
});

// ══════════════════════════════════════════════════════════════════
// 1. detectConflicts — No Conflicts
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — no conflicts', () => {
  it('returns no conflicts when no overlapping appointments exist', async () => {
    queueNoConflicts();
    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it('returns no conflicts when provider has no availability configured (treated as unrestricted)', async () => {
    // First query returns 0 effective slots
    queryResults.push([]);
    // Follow-up query: does the provider have ANY availability? No -> unrestricted
    queryResults.push([]);
    // Time off — none
    queryResults.push([]);
    // Provider appointments — none
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
  });

  it('returns no conflicts with resourceIds when resources are free', async () => {
    queueNoConflicts({ resourceIds: [RESOURCE_ROOM_A], customerId: false });
    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('returns no conflicts with customerId when customer has no overlap', async () => {
    queueNoConflicts({ customerId: true });
    const result = await detectConflicts(
      baseParams({ customerId: CUSTOMER_ID }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('returns no conflicts with both resourceIds and customerId', async () => {
    queueNoConflicts({ resourceIds: [RESOURCE_ROOM_A, RESOURCE_EQUIP_B], customerId: true });
    const result = await detectConflicts(
      baseParams({
        resourceIds: [RESOURCE_ROOM_A, RESOURCE_EQUIP_B],
        customerId: CUSTOMER_ID,
      }),
    );
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Provider Appointment Conflicts (provider_busy)
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — provider double-booking', () => {
  it('detects exact time overlap', async () => {
    // 1. availability
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    // 2. time off — none
    queryResults.push([]);
    // 3. provider appointments — existing appointment at same time
    queryResults.push([
      {
        id: APPT_EXISTING,
        appointmentNumber: 'SPA-001',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.type).toBe('provider_busy');
    expect(result.conflicts[0]!.conflictingAppointmentId).toBe(APPT_EXISTING);
  });

  it('detects partial overlap — new appointment starts during existing one', async () => {
    // Existing: 09:30–10:30, New: 10:00–11:00 (overlap 09:30 < 11:00 && 10:30 > 10:00)
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_partial_1',
        appointmentNumber: 'SPA-002',
        startAt: d('2026-03-04T09:30:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
        status: 'scheduled',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts.some((c) => c.type === 'provider_busy')).toBe(true);
    expect(result.conflicts[0]!.conflictingAppointmentId).toBe('appt_partial_1');
  });

  it('detects partial overlap — new appointment ends during existing one', async () => {
    // Existing: 10:30–11:30, New: 10:00–11:00 (overlap 10:30 < 11:00 && 11:30 > 10:00)
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_partial_2',
        appointmentNumber: 'SPA-003',
        startAt: d('2026-03-04T10:30:00Z'),
        endAt: d('2026-03-04T11:30:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('provider_busy');
  });

  it('detects full enclosure — existing appointment fully inside new time range', async () => {
    // Existing: 10:15–10:45 inside New: 10:00–11:00
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_inside',
        appointmentNumber: 'SPA-004',
        startAt: d('2026-03-04T10:15:00Z'),
        endAt: d('2026-03-04T10:45:00Z'),
        status: 'in_service',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.conflictingAppointmentId).toBe('appt_inside');
  });

  it('detects full-day overlap — 8hr appointment blocking all slots', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_full_day',
        appointmentNumber: 'SPA-005',
        startAt: d('2026-03-04T08:00:00Z'),
        endAt: d('2026-03-04T16:00:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('provider_busy');
  });

  it('detects 1-minute overlap edge case', async () => {
    // Existing ends at 10:01, New starts at 10:00 (1 min overlap)
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_1min',
        appointmentNumber: 'SPA-006',
        startAt: d('2026-03-04T09:00:00Z'),
        endAt: d('2026-03-04T10:01:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('provider_busy');
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. Adjacent Appointments (No Conflict)
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — adjacent boundaries (no overlap)', () => {
  it('no conflict when existing appointment ends exactly when new one starts', async () => {
    // Existing: 09:00–10:00, New: 10:00–11:00 (touching boundary, NOT overlapping)
    // The overlap check is: existing.startAt < endTime AND existing.endAt > startTime
    // 10:00 > 10:00 is FALSE -> no overlap
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]); // no overlapping results because DB uses strict < / >

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
  });

  it('no conflict when new appointment ends exactly when existing one starts', async () => {
    // Existing: 11:00–12:00, New: 10:00–11:00
    // existing.startAt < endTime? 11:00 < 11:00 is FALSE -> no overlap
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
  });

  it('same provider, non-overlapping times — no conflict', async () => {
    // Existing: 14:00–15:00, New: 10:00–11:00
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. Resource Conflicts (resource_busy)
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — resource conflicts', () => {
  it('detects resource conflict — same room overlapping time', async () => {
    // 1. availability
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    // 2. time off
    queryResults.push([]);
    // 3. provider appointments
    queryResults.push([]);
    // 4. resource check — room A has overlapping appointment
    queryResults.push([
      {
        id: 'appt_room_conflict',
        appointmentNumber: 'SPA-010',
        startAt: d('2026-03-04T09:30:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
      },
    ]);
    // 4b. resource name lookup
    queryResults.push([{ name: 'Relaxation Room A' }]);

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    expect(result.hasConflicts).toBe(true);
    const rConflict = result.conflicts.find((c) => c.type === 'resource_busy');
    expect(rConflict).toBeDefined();
    expect(rConflict!.conflictingAppointmentId).toBe('appt_room_conflict');
    expect(rConflict!.conflictingResourceId).toBe(RESOURCE_ROOM_A);
    expect(rConflict!.description).toContain('Relaxation Room A');
  });

  it('flags only the conflicting resource when multiple resources are checked', async () => {
    // 1. availability
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    // 2. time off
    queryResults.push([]);
    // 3. provider appointments
    queryResults.push([]);
    // 4a. Resource A — conflict
    queryResults.push([
      {
        id: 'appt_res_a_busy',
        appointmentNumber: 'SPA-011',
        startAt: d('2026-03-04T09:00:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
      },
    ]);
    queryResults.push([{ name: 'Room A' }]);
    // 4b. Resource B — free
    queryResults.push([]);

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A, RESOURCE_EQUIP_B] }),
    );
    expect(result.hasConflicts).toBe(true);
    const resourceConflicts = result.conflicts.filter((c) => c.type === 'resource_busy');
    expect(resourceConflicts).toHaveLength(1);
    expect(resourceConflicts[0]!.conflictingResourceId).toBe(RESOURCE_ROOM_A);
  });

  it('same resource, non-overlapping times — no conflict', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    // resource check returns empty (no overlap)
    queryResults.push([]);

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('resource name falls back to ID when resource row not found', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    // resource has overlapping appointment
    queryResults.push([
      {
        id: 'appt_res_unknown',
        appointmentNumber: 'SPA-099',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T10:45:00Z'),
      },
    ]);
    // resource name lookup returns empty
    queryResults.push([]);

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    expect(result.hasConflicts).toBe(true);
    // Description should contain the resource ID as fallback
    expect(result.conflicts[0]!.description).toContain(RESOURCE_ROOM_A);
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. Customer Overlap (customer_overlap)
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — customer double-booking', () => {
  it('detects customer overlap — customer already booked at this time', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    // customer overlap
    queryResults.push([
      {
        id: 'appt_customer_overlap',
        appointmentNumber: 'SPA-020',
        startAt: d('2026-03-04T09:30:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
      },
    ]);

    const result = await detectConflicts(
      baseParams({ customerId: CUSTOMER_ID }),
    );
    expect(result.hasConflicts).toBe(true);
    const cConflict = result.conflicts.find((c) => c.type === 'customer_overlap');
    expect(cConflict).toBeDefined();
    expect(cConflict!.conflictingAppointmentId).toBe('appt_customer_overlap');
    expect(cConflict!.description).toContain('SPA-020');
  });

  it('skips customer overlap check when customerId is not provided', async () => {
    queueNoConflicts({ customerId: false });
    const result = await detectConflicts(baseParams()); // no customerId
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. Provider Availability (outside_availability)
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — provider availability', () => {
  it('detects outside_availability when appointment is outside working hours', async () => {
    // Provider available 08:00–12:00, appointment 14:00–15:00
    queryResults.push([
      { startTime: '08:00', endTime: '12:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(
      baseParams({
        startTime: d('2026-03-04T14:00:00Z'),
        endTime: d('2026-03-04T15:00:00Z'),
      }),
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts.some((c) => c.type === 'outside_availability')).toBe(true);
  });

  it('detects outside_availability when provider has availability for other days but not this day', async () => {
    // Promise.all runs all 5 checks concurrently. Each check's first
    // tx.select() call shifts synchronously before any microtask runs.
    // So the queue order is:
    //   1. availability initial query (shifts first)
    //   2. time-off query (shifts second)
    //   3. provider-appts query (shifts third)
    //   4. availability follow-up "any slots?" (shifts after microtask)
    queryResults.push([]);                         // 1. avail: no effective slots for this day
    queryResults.push([]);                         // 2. time-off: none
    queryResults.push([]);                         // 3. provider-appts: none
    queryResults.push([{ id: 'avail_other_day' }]);// 4. avail follow-up: has OTHER day availability

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('outside_availability');
    expect(result.conflicts[0]!.description).toContain('Wednesday');
  });

  it('no conflict when appointment falls within availability window', async () => {
    queryResults.push([
      { startTime: '09:00', endTime: '17:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
  });

  it('filters availability by effectiveFrom/effectiveUntil dates', async () => {
    // Slot effective from 2026-04-01 — appointment on 2026-03-04 is before this.
    // JS-side filter removes this slot, triggering a follow-up query.
    // Queue order: avail initial, time-off, provider-appts, avail follow-up
    queryResults.push([
      {
        startTime: '08:00',
        endTime: '18:00',
        locationId: null,
        effectiveFrom: '2026-04-01',
        effectiveUntil: null,
      },
    ]);
    queryResults.push([]);                     // time-off: none
    queryResults.push([]);                     // provider-appts: none
    queryResults.push([{ id: 'future_slot' }]);// avail follow-up: has configured availability

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('outside_availability');
  });

  it('filters out expired availability slots', async () => {
    // Slot effective until 2026-02-28 — appointment on 2026-03-04 is after expiry.
    // JS-side filter removes this slot, triggering a follow-up query.
    // Queue order: avail initial, time-off, provider-appts, avail follow-up
    queryResults.push([
      {
        startTime: '08:00',
        endTime: '18:00',
        locationId: null,
        effectiveFrom: '2026-01-01',
        effectiveUntil: '2026-02-28',
      },
    ]);
    queryResults.push([]);                      // time-off: none
    queryResults.push([]);                      // provider-appts: none
    queryResults.push([{ id: 'expired_slot' }]);// avail follow-up: has configured availability

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('outside_availability');
  });

  it('filters availability by locationId when provided', async () => {
    // Slot for a different location — JS-side filter removes it.
    // Queue order: avail initial, time-off, provider-appts, avail follow-up
    queryResults.push([
      {
        startTime: '08:00',
        endTime: '18:00',
        locationId: 'other_location',
        effectiveFrom: '2026-01-01',
        effectiveUntil: null,
      },
    ]);
    queryResults.push([]);                         // time-off: none
    queryResults.push([]);                         // provider-appts: none
    queryResults.push([{ id: 'other_loc_slot' }]); // avail follow-up: has configured availability

    const result = await detectConflicts(baseParams({ locationId: LOCATION_ID }));
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.type).toBe('outside_availability');
  });

  it('accepts unscoped (null locationId) availability slots for any location', async () => {
    // Slot with no locationId — matches any location
    queryResults.push([
      {
        startTime: '08:00',
        endTime: '18:00',
        locationId: null,
        effectiveFrom: '2026-01-01',
        effectiveUntil: null,
      },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams({ locationId: LOCATION_ID }));
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 7. Provider Time Off (provider_time_off)
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — provider time-off', () => {
  it('detects approved time-off overlapping the appointment', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    // Time off — approved, overlapping
    queryResults.push([
      {
        id: 'pto_01',
        startAt: d('2026-03-04T09:00:00Z'),
        endAt: d('2026-03-04T12:00:00Z'),
        reason: 'Dentist appointment',
        isAllDay: false,
      },
    ]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    const ptoConflict = result.conflicts.find((c) => c.type === 'provider_time_off');
    expect(ptoConflict).toBeDefined();
    expect(ptoConflict!.description).toContain('Dentist appointment');
  });

  it('detects all-day time-off', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([
      {
        id: 'pto_allday',
        startAt: d('2026-03-04T00:00:00Z'),
        endAt: d('2026-03-04T23:59:59Z'),
        reason: 'Personal day',
        isAllDay: true,
      },
    ]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.description).toContain('all-day time off');
    expect(result.conflicts[0]!.description).toContain('Personal day');
  });

  it('omits reason from description when none provided', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([
      {
        id: 'pto_no_reason',
        startAt: d('2026-03-04T09:00:00Z'),
        endAt: d('2026-03-04T12:00:00Z'),
        reason: null,
        isAllDay: false,
      },
    ]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.description).not.toContain('(');
  });
});

// ══════════════════════════════════════════════════════════════════
// 8. Exclude Self from Conflict Detection
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — excludeAppointmentId', () => {
  it('excludes the current appointment from self-conflict for reschedule', async () => {
    // No conflicts returned because the only overlapping appointment IS the excluded one
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]); // DB query already excludes APPT_SELF via sql condition

    const result = await detectConflicts(
      baseParams({ excludeAppointmentId: APPT_SELF }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('still detects OTHER overlapping appointments when excludeAppointmentId is set', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    // Another appointment overlaps (not the excluded one)
    queryResults.push([
      {
        id: 'appt_other',
        appointmentNumber: 'SPA-030',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(
      baseParams({ excludeAppointmentId: APPT_SELF }),
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]!.conflictingAppointmentId).toBe('appt_other');
  });

  it('excludeAppointmentId applies to resource checks too', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    // Resource check returns no conflicts (excluded appointment filtered out by DB)
    queryResults.push([]);

    const result = await detectConflicts(
      baseParams({
        excludeAppointmentId: APPT_SELF,
        resourceIds: [RESOURCE_ROOM_A],
      }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('excludeAppointmentId applies to customer overlap checks', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    // Customer overlap — none (excluded appointment filtered out by DB)
    queryResults.push([]);

    const result = await detectConflicts(
      baseParams({
        excludeAppointmentId: APPT_SELF,
        customerId: CUSTOMER_ID,
      }),
    );
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 9. Cancelled/No-Show Excluded from Conflicts
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — excluded statuses', () => {
  it('cancelled appointments do not create provider conflicts (DB filters via CONFLICT_EXCLUDED_STATUSES)', async () => {
    // The DB query includes NOT IN ('canceled', 'no_show', 'checked_out')
    // so cancelled appointments are never returned. We simulate this by
    // returning empty from provider appointment check.
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]); // DB already filtered out cancelled

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
  });

  it('no-show appointments do not create resource conflicts', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    queryResults.push([]); // DB already filtered out no_show

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('checked_out appointments do not create customer overlap conflicts', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    queryResults.push([]); // DB already filtered out checked_out

    const result = await detectConflicts(
      baseParams({ customerId: CUSTOMER_ID }),
    );
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 10. Multiple Conflict Types Simultaneously
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — multiple conflict types', () => {
  it('reports provider_busy, resource_busy, and customer_overlap together', async () => {
    // Promise.all runs all 5 checks concurrently. Each check's first
    // tx.select() shifts synchronously. The resource name lookup
    // (second query) shifts AFTER the microtask, so it comes after
    // the customer overlap's initial query shift.
    //
    // Queue order:
    //   1. availability initial
    //   2. time-off initial
    //   3. provider-appts initial
    //   4. resource overlap initial (1st query)
    //   5. customer overlap initial
    //   6. resource name lookup (2nd query, after microtask)
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    // 2. time off — conflict
    queryResults.push([
      {
        id: 'pto_multi',
        startAt: d('2026-03-04T08:00:00Z'),
        endAt: d('2026-03-04T12:00:00Z'),
        reason: 'Vacation',
        isAllDay: false,
      },
    ]);
    // 3. provider appointment — conflict
    queryResults.push([
      {
        id: 'appt_multi_provider',
        appointmentNumber: 'SPA-040',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'scheduled',
      },
    ]);
    // 4. resource overlap (initial query)
    queryResults.push([
      {
        id: 'appt_multi_resource',
        appointmentNumber: 'SPA-041',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
      },
    ]);
    // 5. customer — conflict (shifts before resource name lookup)
    queryResults.push([
      {
        id: 'appt_multi_customer',
        appointmentNumber: 'SPA-042',
        startAt: d('2026-03-04T10:15:00Z'),
        endAt: d('2026-03-04T11:15:00Z'),
      },
    ]);
    // 6. resource name lookup (shifts after microtask)
    queryResults.push([{ name: 'Steam Room' }]);

    const result = await detectConflicts(
      baseParams({
        customerId: CUSTOMER_ID,
        resourceIds: [RESOURCE_ROOM_A],
      }),
    );

    expect(result.hasConflicts).toBe(true);
    const types = result.conflicts.map((c) => c.type);
    expect(types).toContain('provider_time_off');
    expect(types).toContain('provider_busy');
    expect(types).toContain('resource_busy');
    expect(types).toContain('customer_overlap');
  });
});

// ══════════════════════════════════════════════════════════════════
// 11. Multiple Providers — Only Conflicting One Flagged
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — provider scoping', () => {
  it('only detects conflicts for the requested provider, not other providers', async () => {
    // The function only queries for PROVIDER_ID appointments.
    // Even if PROVIDER_B has appointments, they won't appear because
    // the query uses eq(spaAppointments.providerId, providerId)
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]); // no conflicts for PROVIDER_ID

    const result = await detectConflicts(baseParams({ providerId: PROVIDER_ID }));
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 12. ConflictResult Shape Validation
// ══════════════════════════════════════════════════════════════════

describe('ConflictResult shape', () => {
  it('hasConflicts is false and conflicts array is empty when no conflicts', async () => {
    queueNoConflicts();
    const result = await detectConflicts(baseParams());
    expect(result).toEqual({ hasConflicts: false, conflicts: [] });
  });

  it('hasConflicts flag matches conflicts array length > 0', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_shape',
        appointmentNumber: 'SPA-050',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.hasConflicts).toBe(result.conflicts.length > 0);
  });

  it('each ConflictDetail has required fields: type and description', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_fields',
        appointmentNumber: 'SPA-051',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'scheduled',
      },
    ]);

    const result = await detectConflicts(baseParams());
    for (const conflict of result.conflicts) {
      expect(conflict.type).toBeDefined();
      expect(typeof conflict.type).toBe('string');
      expect(conflict.description).toBeDefined();
      expect(typeof conflict.description).toBe('string');
      expect(conflict.description.length).toBeGreaterThan(0);
    }
  });

  it('provider_busy conflict includes conflictingAppointmentId', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_detail_id',
        appointmentNumber: 'SPA-052',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'confirmed',
      },
    ]);

    const result = await detectConflicts(baseParams());
    const provConflict = result.conflicts.find((c) => c.type === 'provider_busy');
    expect(provConflict!.conflictingAppointmentId).toBe('appt_detail_id');
  });

  it('resource_busy conflict includes conflictingResourceId', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_res_detail',
        appointmentNumber: 'SPA-053',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
      },
    ]);
    queryResults.push([{ name: 'Hot Stone Room' }]);

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    const resConflict = result.conflicts.find((c) => c.type === 'resource_busy');
    expect(resConflict!.conflictingResourceId).toBe(RESOURCE_ROOM_A);
    expect(resConflict!.conflictingAppointmentId).toBe('appt_res_detail');
  });

  it('outside_availability conflict has no conflictingAppointmentId', async () => {
    queryResults.push([
      { startTime: '14:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    const avConflict = result.conflicts.find((c) => c.type === 'outside_availability');
    expect(avConflict).toBeDefined();
    expect(avConflict!.conflictingAppointmentId).toBeUndefined();
  });

  it('provider_time_off conflict has no conflictingAppointmentId', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([
      {
        id: 'pto_shape',
        startAt: d('2026-03-04T08:00:00Z'),
        endAt: d('2026-03-04T12:00:00Z'),
        reason: null,
        isAllDay: false,
      },
    ]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    const ptoConflict = result.conflicts.find((c) => c.type === 'provider_time_off');
    expect(ptoConflict).toBeDefined();
    expect(ptoConflict!.conflictingAppointmentId).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// 13. Edge Cases — Empty Inputs
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — empty/missing input edge cases', () => {
  it('empty existing appointments array produces no conflicts', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  it('empty resourceIds array skips resource check entirely', async () => {
    queueNoConflicts({ resourceIds: [] });
    const result = await detectConflicts(
      baseParams({ resourceIds: [] }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('undefined resourceIds skips resource check entirely', async () => {
    queueNoConflicts();
    const result = await detectConflicts(
      baseParams({ resourceIds: undefined }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it('undefined customerId skips customer overlap check entirely', async () => {
    queueNoConflicts();
    const result = await detectConflicts(
      baseParams({ customerId: undefined }),
    );
    expect(result.hasConflicts).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 14. Description Content Validation
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — description content', () => {
  it('provider_busy description includes appointment number and status', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_desc',
        appointmentNumber: 'SPA-060',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
        status: 'in_service',
      },
    ]);

    const result = await detectConflicts(baseParams());
    expect(result.conflicts[0]!.description).toContain('SPA-060');
    expect(result.conflicts[0]!.description).toContain('in_service');
  });

  it('customer_overlap description includes appointment number', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_cust_desc',
        appointmentNumber: 'SPA-061',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T11:00:00Z'),
      },
    ]);

    const result = await detectConflicts(
      baseParams({ customerId: CUSTOMER_ID }),
    );
    expect(result.conflicts[0]!.description).toContain('SPA-061');
    expect(result.conflicts[0]!.description).toContain('Customer already has appointment');
  });

  it('resource_busy description includes resource name and appointment number', async () => {
    queryResults.push([
      { startTime: '08:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);
    queryResults.push([
      {
        id: 'appt_res_desc',
        appointmentNumber: 'SPA-062',
        startAt: d('2026-03-04T10:00:00Z'),
        endAt: d('2026-03-04T10:30:00Z'),
      },
    ]);
    queryResults.push([{ name: 'Couples Suite' }]);

    const result = await detectConflicts(
      baseParams({ resourceIds: [RESOURCE_ROOM_A] }),
    );
    expect(result.conflicts[0]!.description).toContain('Couples Suite');
    expect(result.conflicts[0]!.description).toContain('SPA-062');
  });

  it('outside_availability description includes day name and time range', async () => {
    queryResults.push([
      { startTime: '14:00', endTime: '18:00', locationId: null, effectiveFrom: '2026-01-01', effectiveUntil: null },
    ]);
    queryResults.push([]);
    queryResults.push([]);

    const result = await detectConflicts(baseParams());
    const desc = result.conflicts[0]!.description;
    expect(desc).toContain('10:00');
    expect(desc).toContain('11:00');
    expect(desc).toContain('Wednesday');
  });
});

// ══════════════════════════════════════════════════════════════════
// 15. withTenant Integration
// ══════════════════════════════════════════════════════════════════

describe('detectConflicts — withTenant integration', () => {
  it('calls withTenant with the correct tenantId', async () => {
    queueNoConflicts();
    await detectConflicts(baseParams());
    expect(mockWithTenant).toHaveBeenCalledTimes(1);
    expect(mockWithTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
  });

  it('runs all checks within a single withTenant call', async () => {
    queueNoConflicts({ resourceIds: [RESOURCE_ROOM_A], customerId: true });
    await detectConflicts(
      baseParams({
        resourceIds: [RESOURCE_ROOM_A],
        customerId: CUSTOMER_ID,
      }),
    );
    // Only one withTenant call, regardless of how many checks
    expect(mockWithTenant).toHaveBeenCalledTimes(1);
  });
});
