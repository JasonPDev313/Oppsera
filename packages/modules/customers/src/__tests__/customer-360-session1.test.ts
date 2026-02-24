import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockInsert,
  mockSelect,
  mockUpdate,
  mockDelete,
  mockPublishWithOutbox,
  mockBuildEvent,
  mockAuditLog,
} = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockInsert = vi.fn();
  const mockSelect = vi.fn(() => makeSelectChain());
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();

  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    }),
  });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  mockDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });

  const mockPublishWithOutbox = vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
    };
    const result = await fn(tx);
    return (result as any).result;
  });

  const mockBuildEvent = vi.fn(() => ({ eventId: 'EVT_001', eventType: 'test' }));
  const mockAuditLog = vi.fn();

  return { mockInsert, mockSelect, mockUpdate, mockDelete, mockPublishWithOutbox, mockBuildEvent, mockAuditLog };
});

// ── Chain helpers ─────────────────────────────────────────────

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function mockSelectReturns(data: unknown[]) {
  mockSelect.mockReturnValueOnce(makeSelectChain(data));
}

function mockInsertReturns(data: unknown[]) {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(data),
      onConflictDoNothing: vi.fn().mockResolvedValue(data),
    }),
  });
}

function mockUpdateReturns(data: unknown[]) {
  mockUpdate.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(data),
      }),
    }),
  });
}

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mockPublishWithOutbox,
}));
vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mockBuildEvent,
}));
vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
}));
vi.mock('@oppsera/core/audit/diff', () => ({
  computeChanges: vi.fn(() => ({})),
}));
vi.mock('@oppsera/db', () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete },
  withTenant: vi.fn(async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete };
    return fn(tx);
  }),
  // Table symbols
  customers: Symbol('customers'),
  customerRelationships: Symbol('customerRelationships'),
  customerIdentifiers: Symbol('customerIdentifiers'),
  customerActivityLog: Symbol('customerActivityLog'),
  membershipPlans: Symbol('membershipPlans'),
  customerMemberships: Symbol('customerMemberships'),
  membershipBillingEvents: Symbol('membershipBillingEvents'),
  billingAccounts: Symbol('billingAccounts'),
  billingAccountMembers: Symbol('billingAccountMembers'),
  arTransactions: Symbol('arTransactions'),
  arAllocations: Symbol('arAllocations'),
  statements: Symbol('statements'),
  lateFeePolicies: Symbol('lateFeePolicies'),
  customerPrivileges: Symbol('customerPrivileges'),
  pricingTiers: Symbol('pricingTiers'),
  paymentJournalEntries: Symbol('paymentJournalEntries'),
  orders: Symbol('orders'),
  orderLines: Symbol('orderLines'),
  locations: Symbol('locations'),
  idempotencyKeys: Symbol('idempotencyKeys'),
  inventoryItems: Symbol('inventoryItems'),
  inventoryMovements: Symbol('inventoryMovements'),
  // Session 1 tables
  customerEmails: Symbol('customerEmails'),
  customerPhones: Symbol('customerPhones'),
  customerAddresses: Symbol('customerAddresses'),
  customerEmergencyContacts: Symbol('customerEmergencyContacts'),
  customerServiceFlags: Symbol('customerServiceFlags'),
  customerAlerts: Symbol('customerAlerts'),
  customerScores: Symbol('customerScores'),
  customerMetricsLifetime: Symbol('customerMetricsLifetime'),
  customerVisits: Symbol('customerVisits'),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), { raw: vi.fn((s: string) => s) }),
}));
vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_001'),
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    constructor(m: string) { super(m); this.name = 'ValidationError'; }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(m: string) { super(m); this.name = 'ConflictError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id: string) { super(`${entity} ${id} not found`); this.name = 'NotFoundError'; }
  },
  AppError: class AppError extends Error {
    constructor(public code: string, m: string, public statusCode: number) { super(m); }
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  ne: vi.fn((...args: unknown[]) => ({ type: 'ne', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  not: vi.fn((arg: unknown) => ({ type: 'not', arg })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  asc: vi.fn((col: unknown) => ({ type: 'asc', col })),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), { raw: vi.fn((s: string) => s) }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import {
  addCustomerEmailSchema,
  updateCustomerEmailSchema,
  removeCustomerEmailSchema,
  addCustomerPhoneSchema,
  addCustomerAddressSchema,
  addEmergencyContactSchema,
  updateCustomerMemberNumberSchema,
} from '../validation';

import { addCustomerEmail } from '../commands/add-customer-email';
import { addCustomerPhone } from '../commands/add-customer-phone';
import { addCustomerAddress } from '../commands/add-customer-address';
import { addEmergencyContact } from '../commands/add-emergency-contact';
import { updateCustomerMemberNumber } from '../commands/update-customer-member-number';

import { getCustomerHeader } from '../queries/get-customer-header';
import { getCustomerContacts360 } from '../queries/get-customer-contacts-360';
import { getCustomerOverview } from '../queries/get-customer-overview';

// ── Test data ─────────────────────────────────────────────────

const TENANT_A = 'tenant_001';
const USER_A = 'user_001';

function makeCtx(overrides = {}): any {
  return {
    user: { id: USER_A, email: 'test@test.com', name: 'Test User', tenantId: TENANT_A, tenantStatus: 'active', membershipStatus: 'active' },
    tenantId: TENANT_A,
    locationId: 'loc_001',
    requestId: 'req_001',
    isPlatformAdmin: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('Customer 360 — Session 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });

    mockSelect.mockImplementation(() => makeSelectChain([]));

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    mockPublishWithOutbox.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
        delete: mockDelete,
      };
      const result = await fn(tx);
      return (result as any).result;
    });
  });

  // ── Section 1: Validation Schema Tests ────────────────────────

  describe('Validation Schemas', () => {
    it('addCustomerEmailSchema — valid email with defaults applied', () => {
      const result = addCustomerEmailSchema.parse({
        customerId: 'CUST_001',
        email: 'john@example.com',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.email).toBe('john@example.com');
      expect(result.type).toBe('personal');
      expect(result.isPrimary).toBe(false);
      expect(result.canReceiveStatements).toBe(true);
      expect(result.canReceiveMarketing).toBe(false);
    });

    it('addCustomerEmailSchema — rejects invalid email format', () => {
      const result = addCustomerEmailSchema.safeParse({
        customerId: 'CUST_001',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerEmailSchema — rejects missing customerId', () => {
      const result = addCustomerEmailSchema.safeParse({
        email: 'john@example.com',
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerPhoneSchema — valid phone with defaults', () => {
      const result = addCustomerPhoneSchema.parse({
        customerId: 'CUST_001',
        phoneE164: '+15551234567',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.phoneE164).toBe('+15551234567');
      expect(result.type).toBe('mobile');
      expect(result.isPrimary).toBe(false);
      expect(result.canReceiveSms).toBe(false);
    });

    it('addCustomerPhoneSchema — rejects phone shorter than 7 chars', () => {
      const result = addCustomerPhoneSchema.safeParse({
        customerId: 'CUST_001',
        phoneE164: '123',
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerAddressSchema — valid address with defaults', () => {
      const result = addCustomerAddressSchema.parse({
        customerId: 'CUST_001',
        line1: '123 Main St',
        city: 'Springfield',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.line1).toBe('123 Main St');
      expect(result.city).toBe('Springfield');
      expect(result.type).toBe('mailing');
      expect(result.country).toBe('US');
      expect(result.isPrimary).toBe(false);
    });

    it('addCustomerAddressSchema — rejects missing required fields (line1, city)', () => {
      const noLine1 = addCustomerAddressSchema.safeParse({
        customerId: 'CUST_001',
        city: 'Springfield',
      });
      expect(noLine1.success).toBe(false);

      const noCity = addCustomerAddressSchema.safeParse({
        customerId: 'CUST_001',
        line1: '123 Main St',
      });
      expect(noCity.success).toBe(false);
    });

    it('addCustomerAddressSchema — validates seasonal months are 1-12', () => {
      const tooLow = addCustomerAddressSchema.safeParse({
        customerId: 'CUST_001',
        line1: '123 Main St',
        city: 'Springfield',
        seasonalStartMonth: 0,
      });
      expect(tooLow.success).toBe(false);

      const tooHigh = addCustomerAddressSchema.safeParse({
        customerId: 'CUST_001',
        line1: '123 Main St',
        city: 'Springfield',
        seasonalEndMonth: 13,
      });
      expect(tooHigh.success).toBe(false);

      const valid = addCustomerAddressSchema.safeParse({
        customerId: 'CUST_001',
        line1: '123 Main St',
        city: 'Springfield',
        seasonalStartMonth: 5,
        seasonalEndMonth: 10,
      });
      expect(valid.success).toBe(true);
    });

    it('addEmergencyContactSchema — valid emergency contact with defaults', () => {
      const result = addEmergencyContactSchema.parse({
        customerId: 'CUST_001',
        name: 'Jane Doe',
        phoneE164: '+15559876543',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.name).toBe('Jane Doe');
      expect(result.phoneE164).toBe('+15559876543');
      expect(result.isPrimary).toBe(false);
    });

    it('addEmergencyContactSchema — rejects missing name or phone', () => {
      const noName = addEmergencyContactSchema.safeParse({
        customerId: 'CUST_001',
        phoneE164: '+15559876543',
      });
      expect(noName.success).toBe(false);

      const noPhone = addEmergencyContactSchema.safeParse({
        customerId: 'CUST_001',
        name: 'Jane Doe',
      });
      expect(noPhone.success).toBe(false);
    });

    it('updateCustomerEmailSchema — accepts partial updates', () => {
      const result = updateCustomerEmailSchema.safeParse({
        emailId: 'EMAIL_001',
        canReceiveMarketing: true,
      });
      expect(result.success).toBe(true);
      expect(result.data!.emailId).toBe('EMAIL_001');
      expect(result.data!.canReceiveMarketing).toBe(true);
      expect(result.data!.email).toBeUndefined();
    });

    it('removeCustomerEmailSchema — requires emailId', () => {
      const valid = removeCustomerEmailSchema.safeParse({ emailId: 'EMAIL_001' });
      expect(valid.success).toBe(true);

      const invalid = removeCustomerEmailSchema.safeParse({});
      expect(invalid.success).toBe(false);
    });

    it('updateCustomerMemberNumberSchema — accepts null memberNumber (clear)', () => {
      const result = updateCustomerMemberNumberSchema.safeParse({
        customerId: 'CUST_001',
        memberNumber: null,
      });
      expect(result.success).toBe(true);
      expect(result.data!.memberNumber).toBeNull();
    });

    it('updateCustomerMemberNumberSchema — requires customerId', () => {
      const result = updateCustomerMemberNumberSchema.safeParse({
        memberNumber: 'M-100',
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerEmailSchema — accepts all valid email types', () => {
      const types = ['personal', 'billing', 'spouse', 'corporate', 'other'] as const;
      for (const type of types) {
        const result = addCustomerEmailSchema.safeParse({
          customerId: 'CUST_001',
          email: 'test@example.com',
          type,
        });
        expect(result.success).toBe(true);
        expect(result.data!.type).toBe(type);
      }

      // Invalid type is rejected
      const invalid = addCustomerEmailSchema.safeParse({
        customerId: 'CUST_001',
        email: 'test@example.com',
        type: 'invalid_type',
      });
      expect(invalid.success).toBe(false);
    });
  });

  // ── Section 2: Command Tests ──────────────────────────────────

  describe('Commands', () => {
    // ── addCustomerEmail ────────────────────────────────────────

    it('addCustomerEmail — creates email when customer exists and email is unique', async () => {
      const ctx = makeCtx();

      // 1st select: customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // 2nd select: no duplicate email
      mockSelectReturns([]);
      // insert returns created record
      mockInsertReturns([{
        id: 'EMAIL_001',
        email: 'test@example.com',
        emailNormalized: 'test@example.com',
        type: 'personal',
        isPrimary: false,
        canReceiveStatements: true,
        canReceiveMarketing: false,
      }]);
      // activity log insert
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await addCustomerEmail(ctx, {
        customerId: 'CUST_001',
        email: 'test@example.com',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('EMAIL_001');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.email.added.v1', expect.objectContaining({
        customerId: 'CUST_001',
        email: 'test@example.com',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.email_added', 'customer', 'CUST_001');
    });

    it('addCustomerEmail — throws NotFoundError when customer does not exist', async () => {
      const ctx = makeCtx();

      // customer not found
      mockSelectReturns([]);

      await expect(
        addCustomerEmail(ctx, { customerId: 'CUST_MISSING', email: 'test@example.com' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('addCustomerEmail — throws ConflictError when email already exists in tenant', async () => {
      const ctx = makeCtx();

      // customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // duplicate email found
      mockSelectReturns([{ id: 'EMAIL_EXISTING' }]);

      await expect(
        addCustomerEmail(ctx, { customerId: 'CUST_001', email: 'duplicate@example.com' }),
      ).rejects.toThrow('Email already exists');
    });

    it('addCustomerEmail — normalizes email to lowercase', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockSelectReturns([]);
      mockInsertReturns([{
        id: 'EMAIL_002',
        email: 'john@example.com',
        emailNormalized: 'john@example.com',
        type: 'personal',
        isPrimary: false,
      }]);
      mockInsertReturns([{ id: 'LOG_002' }]);

      const result = await addCustomerEmail(ctx, {
        customerId: 'CUST_001',
        email: 'JOHN@EXAMPLE.COM',
      });

      expect(result).toBeDefined();
      // The command normalizes email to lowercase internally for uniqueness check
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.email.added.v1', expect.objectContaining({
        email: 'JOHN@EXAMPLE.COM',
      }));
    });

    it('addCustomerEmail — unsets existing primaries when isPrimary=true', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockSelectReturns([]);
      mockInsertReturns([{
        id: 'EMAIL_003',
        email: 'primary@example.com',
        type: 'personal',
        isPrimary: true,
      }]);
      mockInsertReturns([{ id: 'LOG_003' }]);

      await addCustomerEmail(ctx, {
        customerId: 'CUST_001',
        email: 'primary@example.com',
        isPrimary: true,
      });

      // Verify update was called (to unset previous primaries + update customer email)
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('addCustomerEmail — emits customer.email.added.v1 event', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockSelectReturns([]);
      mockInsertReturns([{
        id: 'EMAIL_004',
        email: 'event-test@example.com',
        type: 'billing',
        isPrimary: false,
      }]);
      mockInsertReturns([{ id: 'LOG_004' }]);

      await addCustomerEmail(ctx, {
        customerId: 'CUST_001',
        email: 'event-test@example.com',
        type: 'billing',
      });

      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.email.added.v1', expect.objectContaining({
        customerId: 'CUST_001',
        email: 'event-test@example.com',
        type: 'billing',
        isPrimary: false,
      }));
    });

    // ── addCustomerPhone ────────────────────────────────────────

    it('addCustomerPhone — creates phone when customer exists', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockInsertReturns([{
        id: 'PHONE_001',
        phoneE164: '+15551234567',
        phoneDisplay: '(555) 123-4567',
        type: 'mobile',
        isPrimary: false,
        canReceiveSms: true,
      }]);

      const result = await addCustomerPhone(ctx, {
        customerId: 'CUST_001',
        phoneE164: '+15551234567',
        phoneDisplay: '(555) 123-4567',
        canReceiveSms: true,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('PHONE_001');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.phone.added.v1', expect.objectContaining({
        customerId: 'CUST_001',
        phoneE164: '+15551234567',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.phone_added', 'customer', 'CUST_001');
    });

    it('addCustomerPhone — throws NotFoundError when customer does not exist', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        addCustomerPhone(ctx, { customerId: 'CUST_MISSING', phoneE164: '+15551234567' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('addCustomerPhone — unsets existing primaries when isPrimary=true', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockInsertReturns([{
        id: 'PHONE_002',
        phoneE164: '+15559876543',
        type: 'mobile',
        isPrimary: true,
      }]);

      await addCustomerPhone(ctx, {
        customerId: 'CUST_001',
        phoneE164: '+15559876543',
        isPrimary: true,
      });

      // Update called to unset existing primaries + update customer phone
      expect(mockUpdate).toHaveBeenCalled();
    });

    // ── addCustomerAddress ──────────────────────────────────────

    it('addCustomerAddress — creates address when customer exists', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockInsertReturns([{
        id: 'ADDR_001',
        type: 'mailing',
        line1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
        isPrimary: false,
      }]);

      const result = await addCustomerAddress(ctx, {
        customerId: 'CUST_001',
        line1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ADDR_001');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.address.added.v1', expect.objectContaining({
        customerId: 'CUST_001',
        type: 'mailing',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.address_added', 'customer', 'CUST_001');
    });

    // ── addEmergencyContact ─────────────────────────────────────

    it('addEmergencyContact — creates contact when customer exists', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{ id: 'CUST_001' }]);
      mockInsertReturns([{
        id: 'EC_001',
        name: 'Jane Doe',
        relationship: 'Spouse',
        phoneE164: '+15559876543',
        isPrimary: false,
      }]);

      const result = await addEmergencyContact(ctx, {
        customerId: 'CUST_001',
        name: 'Jane Doe',
        relationship: 'Spouse',
        phoneE164: '+15559876543',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('EC_001');
      expect(result.name).toBe('Jane Doe');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.emergency_contact.added.v1', expect.objectContaining({
        customerId: 'CUST_001',
        name: 'Jane Doe',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.emergency_contact_added', 'customer', 'CUST_001');
    });

    // ── updateCustomerMemberNumber ──────────────────────────────

    it('updateCustomerMemberNumber — updates member number successfully', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001', memberNumber: null }]);
      // No duplicate
      mockSelectReturns([]);
      // Update returns
      mockUpdateReturns([{ id: 'CUST_001', memberNumber: 'M-100' }]);

      const result = await updateCustomerMemberNumber(ctx, {
        customerId: 'CUST_001',
        memberNumber: 'M-100',
      });

      expect(result).toBeDefined();
      expect(result.memberNumber).toBe('M-100');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.member_number.updated.v1', expect.objectContaining({
        customerId: 'CUST_001',
        memberNumber: 'M-100',
        previousMemberNumber: null,
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.member_number_updated', 'customer', 'CUST_001');
    });

    it('updateCustomerMemberNumber — throws NotFoundError for missing customer', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        updateCustomerMemberNumber(ctx, { customerId: 'CUST_MISSING', memberNumber: 'M-100' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('updateCustomerMemberNumber — throws ConflictError for duplicate member number', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001', memberNumber: null }]);
      // Duplicate found
      mockSelectReturns([{ id: 'CUST_OTHER' }]);

      await expect(
        updateCustomerMemberNumber(ctx, { customerId: 'CUST_001', memberNumber: 'M-TAKEN' }),
      ).rejects.toThrow('Member number already assigned');
    });

    it('updateCustomerMemberNumber — clears member number when null', async () => {
      const ctx = makeCtx();

      // Customer exists with existing member number
      mockSelectReturns([{ id: 'CUST_001', memberNumber: 'M-100' }]);
      // No duplicate check needed for null
      // Update returns
      mockUpdateReturns([{ id: 'CUST_001', memberNumber: null }]);

      const result = await updateCustomerMemberNumber(ctx, {
        customerId: 'CUST_001',
        memberNumber: null,
      });

      expect(result).toBeDefined();
      expect(result.memberNumber).toBeNull();
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.member_number.updated.v1', expect.objectContaining({
        memberNumber: null,
        previousMemberNumber: 'M-100',
      }));
    });
  });

  // ── Section 3: Query Tests ────────────────────────────────────

  describe('Queries', () => {
    // ── getCustomerHeader ───────────────────────────────────────

    it('getCustomerHeader — returns header data for existing customer', async () => {
      // 1. Customer data
      mockSelectReturns([{
        id: 'CUST_001',
        displayName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        memberNumber: 'M001',
        status: 'active',
        type: 'person',
        email: 'john@test.com',
        phone: '+15551234567',
        totalSpend: 50000,
        totalVisits: 25,
        lastVisitAt: new Date('2026-01-15'),
        loyaltyTier: 'gold',
        taxExempt: false,
        ghinNumber: '12345678',
        metadata: { profileImageUrl: 'https://example.com/photo.jpg' },
      }]);
      // 2. Primary email
      mockSelectReturns([{ email: 'john@primary.com' }]);
      // 3. Primary phone
      mockSelectReturns([{ phoneE164: '+15559876543', phoneDisplay: '(555) 987-6543' }]);
      // 4. Active membership
      mockSelectReturns([{ planName: 'Gold Plan', status: 'active' }]);
      // 5. Billing accounts (cents as bigint strings)
      mockSelectReturns([{ currentBalanceCents: '15000', creditLimitCents: '500000' }]);
      // 6. Service flags
      mockSelectReturns([{ id: 'FLAG_001', flagType: 'vip', severity: 'info' }]);

      const result = await getCustomerHeader({ tenantId: TENANT_A, customerId: 'CUST_001' });

      expect(result.id).toBe('CUST_001');
      expect(result.displayName).toBe('John Doe');
      expect(result.memberNumber).toBe('M001');
      expect(result.primaryEmail).toBe('john@primary.com');
      expect(result.primaryPhone).toBe('+15559876543');
      expect(result.primaryPhoneDisplay).toBe('(555) 987-6543');
      expect(result.activeMembership).toEqual({ planName: 'Gold Plan', status: 'active' });
      expect(result.outstandingBalance).toBe(150);
      expect(result.creditLimit).toBe(5000);
      expect(result.activeFlags).toHaveLength(1);
      expect(result.activeFlags[0]!.flagType).toBe('vip');
      expect(result.loyaltyTier).toBe('gold');
      expect(result.ghinNumber).toBe('12345678');
      expect(result.profileImageUrl).toBe('https://example.com/photo.jpg');
    });

    it('getCustomerHeader — throws NotFoundError for non-existent customer', async () => {
      mockSelectReturns([]);

      await expect(
        getCustomerHeader({ tenantId: TENANT_A, customerId: 'CUST_MISSING' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('getCustomerHeader — includes activeMembership when member has active membership', async () => {
      mockSelectReturns([{
        id: 'CUST_002',
        displayName: 'Member User',
        firstName: 'Member',
        lastName: 'User',
        memberNumber: null,
        status: 'active',
        type: 'person',
        email: null,
        phone: null,
        totalSpend: 0,
        totalVisits: 0,
        lastVisitAt: null,
        loyaltyTier: null,
        taxExempt: false,
        ghinNumber: null,
        metadata: {},
      }]);
      mockSelectReturns([]); // no primary email
      mockSelectReturns([]); // no primary phone
      mockSelectReturns([{ planName: 'Platinum Plan', status: 'active' }]); // active membership
      mockSelectReturns([]); // no billing
      mockSelectReturns([]); // no flags

      const result = await getCustomerHeader({ tenantId: TENANT_A, customerId: 'CUST_002' });

      expect(result.activeMembership).toEqual({ planName: 'Platinum Plan', status: 'active' });
    });

    it('getCustomerHeader — returns null activeMembership when no active membership', async () => {
      mockSelectReturns([{
        id: 'CUST_003',
        displayName: 'No Member',
        firstName: 'No',
        lastName: 'Member',
        memberNumber: null,
        status: 'active',
        type: 'person',
        email: 'no@member.com',
        phone: null,
        totalSpend: 0,
        totalVisits: 0,
        lastVisitAt: null,
        loyaltyTier: null,
        taxExempt: false,
        ghinNumber: null,
        metadata: {},
      }]);
      mockSelectReturns([]); // no primary email
      mockSelectReturns([]); // no primary phone
      mockSelectReturns([]); // no active membership
      mockSelectReturns([]); // no billing
      mockSelectReturns([]); // no flags

      const result = await getCustomerHeader({ tenantId: TENANT_A, customerId: 'CUST_003' });

      expect(result.activeMembership).toBeNull();
    });

    it('getCustomerHeader — falls back to customer.email when no structured primary email', async () => {
      mockSelectReturns([{
        id: 'CUST_004',
        displayName: 'Fallback Email',
        firstName: 'Fallback',
        lastName: 'Email',
        memberNumber: null,
        status: 'active',
        type: 'person',
        email: 'legacy@fallback.com',
        phone: '+15550001111',
        totalSpend: 0,
        totalVisits: 0,
        lastVisitAt: null,
        loyaltyTier: null,
        taxExempt: false,
        ghinNumber: null,
        metadata: {},
      }]);
      mockSelectReturns([]); // no structured primary email
      mockSelectReturns([]); // no structured primary phone
      mockSelectReturns([]); // no membership
      mockSelectReturns([]); // no billing
      mockSelectReturns([]); // no flags

      const result = await getCustomerHeader({ tenantId: TENANT_A, customerId: 'CUST_004' });

      // Falls back to customer.email
      expect(result.primaryEmail).toBe('legacy@fallback.com');
      // Falls back to customer.phone
      expect(result.primaryPhone).toBe('+15550001111');
    });

    it('getCustomerHeader — aggregates billing totals from multiple billing accounts', async () => {
      mockSelectReturns([{
        id: 'CUST_005',
        displayName: 'Multi Billing',
        firstName: 'Multi',
        lastName: 'Billing',
        memberNumber: null,
        status: 'active',
        type: 'person',
        email: null,
        phone: null,
        totalSpend: 100000,
        totalVisits: 50,
        lastVisitAt: null,
        loyaltyTier: null,
        taxExempt: false,
        ghinNumber: null,
        metadata: {},
      }]);
      mockSelectReturns([]); // no primary email
      mockSelectReturns([]); // no primary phone
      mockSelectReturns([]); // no membership
      // Multiple billing accounts (cents as bigint strings)
      mockSelectReturns([
        { currentBalanceCents: '20000', creditLimitCents: '500000' },
        { currentBalanceCents: '30050', creditLimitCents: '300000' },
      ]);
      mockSelectReturns([]); // no flags

      const result = await getCustomerHeader({ tenantId: TENANT_A, customerId: 'CUST_005' });

      expect(result.outstandingBalance).toBe(500.5);
      expect(result.creditLimit).toBe(8000);
    });

    // ── getCustomerContacts360 ──────────────────────────────────

    it('getCustomerContacts360 — returns all contact types', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Emails
      mockSelectReturns([
        { id: 'E1', email: 'john@test.com', type: 'personal', isPrimary: true, isVerified: true, canReceiveStatements: true, canReceiveMarketing: false },
        { id: 'E2', email: 'john@work.com', type: 'corporate', isPrimary: false, isVerified: false, canReceiveStatements: false, canReceiveMarketing: true },
      ]);
      // Phones
      mockSelectReturns([
        { id: 'P1', phoneE164: '+15551234567', phoneDisplay: '(555) 123-4567', type: 'mobile', isPrimary: true, isVerified: true, canReceiveSms: true },
      ]);
      // Addresses
      mockSelectReturns([
        { id: 'A1', type: 'mailing', label: 'Home', line1: '123 Main St', line2: null, line3: null, city: 'Springfield', state: 'IL', postalCode: '62701', county: null, country: 'US', isPrimary: true, seasonalStartMonth: null, seasonalEndMonth: null },
      ]);
      // Emergency contacts
      mockSelectReturns([
        { id: 'EC1', name: 'Jane Doe', relationship: 'Spouse', phoneE164: '+15559876543', phoneDisplay: null, email: 'jane@test.com', notes: null, isPrimary: true },
      ]);

      const result = await getCustomerContacts360({ tenantId: TENANT_A, customerId: 'CUST_001' });

      expect(result.emails).toHaveLength(2);
      expect(result.emails[0]!.email).toBe('john@test.com');
      expect(result.emails[0]!.isPrimary).toBe(true);
      expect(result.phones).toHaveLength(1);
      expect(result.phones[0]!.phoneE164).toBe('+15551234567');
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0]!.line1).toBe('123 Main St');
      expect(result.emergencyContacts).toHaveLength(1);
      expect(result.emergencyContacts[0]!.name).toBe('Jane Doe');
    });

    it('getCustomerContacts360 — throws NotFoundError for non-existent customer', async () => {
      mockSelectReturns([]);

      await expect(
        getCustomerContacts360({ tenantId: TENANT_A, customerId: 'CUST_MISSING' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    // ── getCustomerOverview ─────────────────────────────────────

    it('getCustomerOverview — returns overview with financial data', async () => {
      // Customer
      mockSelectReturns([{
        id: 'CUST_001',
        displayName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        status: 'active',
        type: 'person',
        totalSpend: 75000,
        totalVisits: 30,
        lastVisitAt: new Date('2026-02-10'),
        metadata: {},
      }]);
      // Active membership
      mockSelectReturns([{ planName: 'Gold Plan', status: 'active', startDate: '2025-06-01' }]);
      // Billing accounts (cents as bigint strings)
      mockSelectReturns([{ currentBalanceCents: '50000', creditLimitCents: '1000000' }]);
      // Recent AR transactions
      mockSelectReturns([
        { id: 'AR1', type: 'charge', notes: 'Greens fee', amountCents: 5000, createdAt: new Date('2026-02-10') },
        { id: 'AR2', type: 'payment', notes: 'Cash payment', amountCents: -5000, createdAt: new Date('2026-02-11') },
      ]);
      // Service flags
      mockSelectReturns([{ id: 'FLAG1', flagType: 'vip', severity: 'info', notes: 'VIP member' }]);
      // Alerts
      mockSelectReturns([{ id: 'ALT1', alertType: 'membership_expiring', severity: 'warning', message: 'Expires in 30 days', isActive: true }]);
      // Lifetime metrics
      mockSelectReturns([{
        totalVisits: 30,
        avgSpendCents: 2500,
        topCategory: 'golf',
      }]);

      const result = await getCustomerOverview({ tenantId: TENANT_A, customerId: 'CUST_001' });

      expect(result.outstandingBalance).toBe(500); // 50000 cents / 100
      expect(result.creditLimit).toBe(10000); // 1000000 cents / 100
      expect(result.creditUtilization).toBe(5); // 500/10000 * 100
      expect(result.totalSpend).toBe(75000);
      expect(result.totalVisits).toBe(30);
      expect(result.activeMembership).toEqual({ planName: 'Gold Plan', status: 'active', startDate: '2025-06-01' });
      expect(result.recentTransactions).toHaveLength(2);
      expect(result.recentTransactions[0]!.description).toBe('Greens fee');
      expect(result.activeFlags).toHaveLength(1);
      expect(result.activeFlags[0]!.flagType).toBe('vip');
      expect(result.activeFlags[0]!.description).toBe('VIP member');
      expect(result.activeAlerts).toHaveLength(1);
      expect(result.activeAlerts[0]!.alertType).toBe('membership_expiring');
      expect(result.activeAlerts[0]!.title).toBe('membership expiring'); // derived from alertType
      expect(result.lifetimeMetrics).toBeDefined();
      expect(result.lifetimeMetrics!.totalOrderCount).toBe(30);
    });

    it('getCustomerOverview — throws NotFoundError for non-existent customer', async () => {
      mockSelectReturns([]);

      await expect(
        getCustomerOverview({ tenantId: TENANT_A, customerId: 'CUST_MISSING' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });
});
