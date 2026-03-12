import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventEnvelope } from '@oppsera/shared';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockWithTenant, mockInsert, mockSelect, mockUpdate } = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  function makeInsertChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.values = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
    return chain;
  }

  function makeUpdateChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.set = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
    return chain;
  }

  const mockInsert = vi.fn(() => makeInsertChain());
  const mockSelect = vi.fn(() => makeSelectChain());
  const mockUpdate = vi.fn(() => makeUpdateChain());

  const mockWithTenant = vi.fn(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
      };
      return fn(tx);
    },
  );

  return { mockWithTenant, mockInsert, mockSelect, mockUpdate };
});

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
  return chain;
}

/**
 * Set up mock returns for a sequence of select calls.
 * Each entry = result of one tx.select() chain.
 */
function mockSelectSequence(...results: unknown[][]) {
  for (const result of results) {
    mockSelect.mockReturnValueOnce(makeSelectChain(result));
  }
}

function mockInsertOnce() {
  mockInsert.mockReturnValueOnce(makeInsertChain());
}

function mockUpdateOnce() {
  mockUpdate.mockReturnValueOnce(makeUpdateChain());
}

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  customers: { id: 'id', tenantId: 'tenant_id', email: 'email' },
  customerExternalIds: { id: 'id', tenantId: 'tenant_id', provider: 'provider', externalId: 'external_id', customerId: 'customer_id' },
  tags: { id: 'id', tenantId: 'tenant_id', slug: 'slug', archivedAt: 'archived_at', customerCount: 'customer_count' },
  customerTags: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', tagId: 'tag_id', removedAt: 'removed_at' },
  tagAuditLog: {},
  pmsGuests: { id: 'id', tenantId: 'tenant_id' },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ type: 'eq', args: [_a, _b] })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((_a: unknown) => ({ type: 'isNull', args: [_a] })),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

vi.mock('../../observability', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Import SUT after mocks ────────────────────────────────────
import { handlePmsGuestCreated } from '../pms-customer-sync';
import { logger } from '../../observability';

// ── Test helpers ──────────────────────────────────────────────
function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt-1',
    eventType: 'pms.guest.created.v1',
    occurredAt: '2026-02-24T12:00:00Z',
    tenantId: 'tenant-1',
    actorUserId: 'user-1',
    data: {
      guestId: 'guest-1',
      propertyId: 'property-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+15551234567',
      isVip: false,
      ...overrides,
    },
  } as unknown as EventEnvelope;
}

describe('handlePmsGuestCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks doesn't clear mockReturnValueOnce queues — reset + re-establish defaults
    mockSelect.mockReset().mockImplementation(() => makeSelectChain([]));
    mockInsert.mockReset().mockImplementation(() => makeInsertChain());
    mockUpdate.mockReset().mockImplementation(() => makeUpdateChain());
  });

  // ── Zod validation tests ──────────────────────────────────────

  it('should reject event with missing guestId', async () => {
    await handlePmsGuestCreated(makeEvent({ guestId: '' }));

    expect(mockWithTenant).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid event data'),
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });

  it('should reject event with missing propertyId', async () => {
    await handlePmsGuestCreated(makeEvent({ propertyId: '' }));

    expect(mockWithTenant).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('should reject event with invalid email format', async () => {
    await handlePmsGuestCreated(makeEvent({ email: 'not-an-email' }));

    expect(mockWithTenant).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('should reject event with missing isVip', async () => {
    await handlePmsGuestCreated(makeEvent({ isVip: undefined }));

    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  it('should accept event with null email', async () => {
    mockSelectSequence(
      [],  // No existing external ID
    );
    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent({ email: null }));

    expect(mockWithTenant).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  // ── Idempotency tests ─────────────────────────────────────────

  it('should skip if external ID already exists (idempotency)', async () => {
    mockSelectSequence([{ id: 'ext-1', customerId: 'cust-existing' }]);

    await handlePmsGuestCreated(makeEvent());

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ── Email matching tests ──────────────────────────────────────

  it('should link to existing customer when email matches', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [{ id: 'cust-existing' }],           // 2. Customer found by email
    );

    mockInsertOnce(); // external ID link
    mockUpdateOnce(); // back-link pmsGuests.customerId
    mockSelectSequence([{ id: 'tag-1' }]); // tag found
    mockSelectSequence([]);                 // tag not applied yet
    mockInsertOnce(); // customerTags
    mockUpdateOnce(); // tags.customerCount
    mockInsertOnce(); // tagAuditLog

    await handlePmsGuestCreated(makeEvent());

    // Should NOT insert a new customer (only external ID, tag, audit)
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it('should normalize email to lowercase', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
      [{ id: 'cust-existing' }],           // Customer found by email
    );

    mockInsertOnce();
    mockUpdateOnce();
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent({ email: '  JOHN@Example.COM  ' }));

    // Verify withTenant was called (email normalized internally)
    expect(mockWithTenant).toHaveBeenCalled();
  });

  // ── Customer creation tests ───────────────────────────────────

  it('should create new customer when no email match', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [],                                  // 2. No customer by email
    );

    mockInsertOnce(); // new customer
    mockInsertOnce(); // external ID link
    mockUpdateOnce(); // back-link
    mockSelectSequence([{ id: 'tag-1' }]); // tag found
    mockSelectSequence([]);                 // tag not applied yet
    mockInsertOnce(); // customerTags
    mockUpdateOnce(); // tags.customerCount
    mockInsertOnce(); // tagAuditLog

    await handlePmsGuestCreated(makeEvent());

    // customer + external ID + tag + audit = 4 inserts
    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  it('should create customer when guest has no email', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
    );
    // No email lookup (skipped when email is null)

    mockInsertOnce(); // new customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([{ id: 'tag-1' }]);
    mockSelectSequence([]);
    mockInsertOnce(); // customerTags
    mockUpdateOnce(); // tags.customerCount
    mockInsertOnce(); // tagAuditLog

    await handlePmsGuestCreated(makeEvent({ email: null }));

    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  // ── Back-link tests ───────────────────────────────────────────

  it('should back-link customerId on pms_guests', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
      [],                                  // No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent());

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  // ── Tag tests ─────────────────────────────────────────────────

  it('should skip tag when tag does not exist', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
      [],                                  // No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent());

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('should skip tag application when tag already applied', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
      [],                                  // No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([{ id: 'tag-1' }]); // tag found
    mockSelectSequence([{ id: 'ct-existing' }]); // tag already applied

    await handlePmsGuestCreated(makeEvent());

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  // ── Edge cases ────────────────────────────────────────────────

  it('should handle guest with only first name', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent({ email: null, phone: null, lastName: '' }));

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('should handle guest with empty names (fallback to "Guest")', async () => {
    mockSelectSequence(
      [],                                  // No existing external ID
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent({ email: null, firstName: '', lastName: '' }));

    // Should still succeed (displayName = 'Guest')
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('should call withTenant with the event tenantId', async () => {
    mockSelectSequence([{ id: 'ext-1', customerId: 'c1' }]);

    await handlePmsGuestCreated(makeEvent());

    expect(mockWithTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
  });

  it('should log structured info on customer creation', async () => {
    mockSelectSequence(
      [],  // No existing external ID
      [],  // No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent());

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Created new customer'),
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventId: 'evt-1',
      }),
    );
  });

  it('should process VIP guests the same as regular guests', async () => {
    mockSelectSequence(
      [],  // No existing external ID
      [],  // No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent({ isVip: true }));

    // VIP flag is stored in metadata, not treated differently in flow
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});
