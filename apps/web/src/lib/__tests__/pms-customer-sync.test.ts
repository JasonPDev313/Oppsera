import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// ── Import SUT after mocks ────────────────────────────────────
import { handlePmsGuestCreated } from '../pms-customer-sync';

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
  } as any;
}

describe('handlePmsGuestCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip if external ID already exists (idempotency)', async () => {
    // External ID lookup returns existing link
    mockSelectSequence([{ id: 'ext-1', customerId: 'cust-existing' }]);

    await handlePmsGuestCreated(makeEvent());

    // Should not insert anything
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should link to existing customer when email matches', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [{ id: 'cust-existing' }],           // 2. Customer found by email
    );

    // insert: external ID link
    mockInsertOnce();
    // update: back-link pmsGuests.customerId
    mockUpdateOnce();
    // select: tag lookup
    mockSelectSequence([{ id: 'tag-1' }]);
    // select: check tag not already applied
    mockSelectSequence([]);
    // insert: customerTags
    mockInsertOnce();
    // update: tags.customerCount
    mockUpdateOnce();
    // insert: tagAuditLog
    mockInsertOnce();

    await handlePmsGuestCreated(makeEvent());

    // Should NOT insert a new customer (only external ID, tag, audit)
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it('should create new customer when no email match', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [],                                  // 2. No customer by email
    );

    // insert: new customer
    mockInsertOnce();
    // insert: external ID link
    mockInsertOnce();
    // update: back-link pmsGuests.customerId
    mockUpdateOnce();
    // select: tag lookup
    mockSelectSequence([{ id: 'tag-1' }]);
    // select: check tag not already applied
    mockSelectSequence([]);
    // insert: customerTags
    mockInsertOnce();
    // update: tags.customerCount
    mockUpdateOnce();
    // insert: tagAuditLog
    mockInsertOnce();

    await handlePmsGuestCreated(makeEvent());

    // Should insert customer + external ID + tag + audit = 4 inserts
    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  it('should create customer when guest has no email', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
    );
    // No email lookup (skipped when email is null)

    // insert: new customer
    mockInsertOnce();
    // insert: external ID link
    mockInsertOnce();
    // update: back-link pmsGuests.customerId
    mockUpdateOnce();
    // select: tag lookup
    mockSelectSequence([{ id: 'tag-1' }]);
    // select: check tag not already applied
    mockSelectSequence([]);
    // insert: customerTags
    mockInsertOnce();
    // update: tags.customerCount
    mockUpdateOnce();
    // insert: tagAuditLog
    mockInsertOnce();

    await handlePmsGuestCreated(makeEvent({ email: null }));

    // Should insert customer + external ID + tag + audit = 4 inserts
    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  it('should back-link customerId on pms_guests', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [],                                  // 2. No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found
    // No tag application when tag not found

    await handlePmsGuestCreated(makeEvent());

    // update should have been called (for back-link)
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('should skip tag when tag does not exist', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [],                                  // 2. No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent());

    // Should insert customer + external ID only (no tag inserts)
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('should skip tag application when tag already applied', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
      [],                                  // 2. No customer by email
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([{ id: 'tag-1' }]); // tag found
    mockSelectSequence([{ id: 'ct-existing' }]); // tag already applied

    await handlePmsGuestCreated(makeEvent());

    // Should insert customer + external ID only (tag skipped)
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('should handle guest with only first name', async () => {
    mockSelectSequence(
      [],                                  // 1. No existing external ID
    );

    mockInsertOnce(); // customer
    mockInsertOnce(); // external ID
    mockUpdateOnce(); // back-link
    mockSelectSequence([]); // tag not found

    await handlePmsGuestCreated(makeEvent({ email: null, phone: null, lastName: '' }));

    // Should still create customer
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('should call withTenant with the event tenantId', async () => {
    mockSelectSequence([{ id: 'ext-1', customerId: 'c1' }]);

    await handlePmsGuestCreated(makeEvent());

    expect(mockWithTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
  });
});
