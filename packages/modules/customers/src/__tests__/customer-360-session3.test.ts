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
    chain.groupBy = vi.fn().mockReturnValue(chain);
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
  chain.groupBy = vi.fn().mockReturnValue(chain);
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
vi.mock('@oppsera/core/db/with-tenant', () => ({
  withTenant: vi.fn(async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete };
    return fn(tx);
  }),
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
  customerNotes: Symbol('customerNotes'),
  customerCommunications: Symbol('customerCommunications'),
  customerDocuments: Symbol('customerDocuments'),
  customerVisits: Symbol('customerVisits'),
  customerIncidents: Symbol('customerIncidents'),
  customerAlerts: Symbol('customerAlerts'),
  customerServiceFlags: Symbol('customerServiceFlags'),
  customerScores: Symbol('customerScores'),
  customerMetricsLifetime: Symbol('customerMetricsLifetime'),
  customerAuditLog: Symbol('customerAuditLog'),
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
  customerEmails: Symbol('customerEmails'),
  customerPhones: Symbol('customerPhones'),
  customerAddresses: Symbol('customerAddresses'),
  customerEmergencyContacts: Symbol('customerEmergencyContacts'),
  customerContacts: Symbol('customerContacts'),
  customerHouseholds: Symbol('customerHouseholds'),
  customerHouseholdMembers: Symbol('customerHouseholdMembers'),
  customerPreferences: Symbol('customerPreferences'),
  customerExternalIds: Symbol('customerExternalIds'),
  customerWalletAccounts: Symbol('customerWalletAccounts'),
  customerConsents: Symbol('customerConsents'),
  customerSegments: Symbol('customerSegments'),
  customerSegmentMemberships: Symbol('customerSegmentMemberships'),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn((...args: unknown[]) => args),
  }),
}));
vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_003'),
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
  lt: vi.fn((...args: unknown[]) => ({ type: 'lt', args })),
  gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
  lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn((...args: unknown[]) => args),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import {
  logCustomerCommunicationSchema,
  addCustomerNoteSchema,
  addCustomerDocumentSchema,
} from '../validation';

import { logCustomerCommunication } from '../commands/log-customer-communication';
import { addCustomerNote } from '../commands/add-customer-note';
import { addCustomerDocument } from '../commands/add-customer-document';

import { getCustomerActivity } from '../queries/get-customer-activity';
import { getCustomerNotes } from '../queries/get-customer-notes';
import { getCustomerCommunications } from '../queries/get-customer-communications';
import { getCustomerDocuments } from '../queries/get-customer-documents';

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

describe('Customer 360 — Session 3: Activity + Communication + Relationships + Documents', () => {
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
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
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
    it('logCustomerCommunicationSchema — valid input with defaults', () => {
      const result = logCustomerCommunicationSchema.parse({
        customerId: 'CUST_001',
        channel: 'email',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.channel).toBe('email');
      expect(result.direction).toBe('outbound');
      expect(result.status).toBe('sent');
    });

    it('logCustomerCommunicationSchema — valid input with all fields', () => {
      const result = logCustomerCommunicationSchema.parse({
        customerId: 'CUST_001',
        channel: 'sms',
        direction: 'inbound',
        subject: 'Follow-up inquiry',
        body: 'Customer asked about membership renewal.',
        status: 'delivered',
        metadata: { campaignId: 'CAMP_001' },
      });

      expect(result.channel).toBe('sms');
      expect(result.direction).toBe('inbound');
      expect(result.subject).toBe('Follow-up inquiry');
      expect(result.body).toBe('Customer asked about membership renewal.');
      expect(result.status).toBe('delivered');
      expect(result.metadata).toEqual({ campaignId: 'CAMP_001' });
    });

    it('logCustomerCommunicationSchema — rejects missing required customerId', () => {
      const result = logCustomerCommunicationSchema.safeParse({
        channel: 'email',
      });
      expect(result.success).toBe(false);
    });

    it('logCustomerCommunicationSchema — rejects invalid channel', () => {
      const result = logCustomerCommunicationSchema.safeParse({
        customerId: 'CUST_001',
        channel: 'fax',
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerNoteSchema — valid input', () => {
      const result = addCustomerNoteSchema.parse({
        customerId: 'CUST_001',
        title: 'VIP member note',
        details: 'Prefers to be greeted by name.',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.title).toBe('VIP member note');
      expect(result.details).toBe('Prefers to be greeted by name.');
    });

    it('addCustomerNoteSchema — rejects empty title', () => {
      const result = addCustomerNoteSchema.safeParse({
        customerId: 'CUST_001',
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerDocumentSchema — valid input', () => {
      const result = addCustomerDocumentSchema.parse({
        customerId: 'CUST_001',
        documentType: 'contract',
        name: 'Membership Agreement 2026',
        storageKey: 'docs/cust001/membership-agreement-2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 245000,
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.documentType).toBe('contract');
      expect(result.name).toBe('Membership Agreement 2026');
      expect(result.storageKey).toBe('docs/cust001/membership-agreement-2026.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.sizeBytes).toBe(245000);
    });

    it('addCustomerDocumentSchema — rejects missing storageKey', () => {
      const result = addCustomerDocumentSchema.safeParse({
        customerId: 'CUST_001',
        documentType: 'waiver',
        name: 'Liability Waiver',
        mimeType: 'application/pdf',
        sizeBytes: 50000,
      });
      expect(result.success).toBe(false);
    });

    it('addCustomerDocumentSchema — rejects invalid documentType', () => {
      const result = addCustomerDocumentSchema.safeParse({
        customerId: 'CUST_001',
        documentType: 'spreadsheet',
        name: 'Some file',
        storageKey: 'docs/test.xlsx',
        mimeType: 'application/vnd.ms-excel',
        sizeBytes: 10000,
      });
      expect(result.success).toBe(false);
    });

    it('logCustomerCommunicationSchema — accepts all valid channels', () => {
      const channels = ['email', 'sms', 'push', 'in_app', 'phone_call', 'letter'] as const;
      for (const channel of channels) {
        const result = logCustomerCommunicationSchema.safeParse({
          customerId: 'CUST_001',
          channel,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  // ── Section 2: Command Tests ──────────────────────────────────

  describe('Commands', () => {
    // ── logCustomerCommunication ─────────────────────────────────

    it('logCustomerCommunication — creates communication record with correct fields', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert communication
      mockInsertReturns([{
        id: 'COMM_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        channel: 'email',
        direction: 'outbound',
        subject: 'Welcome email',
        body: 'Thank you for joining.',
        status: 'sent',
        createdBy: USER_A,
        createdAt: new Date('2026-02-20T10:00:00Z'),
      }]);
      // Activity log insert
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await logCustomerCommunication(ctx, {
        customerId: 'CUST_001',
        channel: 'email',
        direction: 'outbound',
        subject: 'Welcome email',
        body: 'Thank you for joining.',
        status: 'sent',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('COMM_001');
      expect(result.channel).toBe('email');
      expect(result.direction).toBe('outbound');
      expect(result.subject).toBe('Welcome email');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer_communication.logged.v1', expect.objectContaining({
        customerId: 'CUST_001',
        communicationId: 'COMM_001',
        channel: 'email',
        direction: 'outbound',
        status: 'sent',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.communication_logged', 'customer', 'CUST_001');
    });

    it('logCustomerCommunication — throws NotFoundError when customer does not exist', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        logCustomerCommunication(ctx, {
          customerId: 'CUST_MISSING',
          channel: 'sms',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    // ── addCustomerNote ─────────────────────────────────────────

    it('addCustomerNote — creates note entry in activity log', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert note
      mockInsertReturns([{
        id: 'NOTE_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        activityType: 'note',
        title: 'Allergic to shellfish',
        details: 'Must be communicated to kitchen.',
        createdBy: USER_A,
        createdAt: new Date('2026-02-20T11:00:00Z'),
      }]);

      const result = await addCustomerNote(ctx, {
        customerId: 'CUST_001',
        title: 'Allergic to shellfish',
        details: 'Must be communicated to kitchen.',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('NOTE_001');
      expect(result.activityType).toBe('note');
      expect(result.title).toBe('Allergic to shellfish');
      expect(result.details).toBe('Must be communicated to kitchen.');
      expect(result.createdBy).toBe(USER_A);
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.note_added', 'customer', 'CUST_001');
    });

    it('addCustomerNote — creates note without details', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert note
      mockInsertReturns([{
        id: 'NOTE_002',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        activityType: 'note',
        title: 'Quick reminder',
        details: null,
        createdBy: USER_A,
        createdAt: new Date('2026-02-20T12:00:00Z'),
      }]);

      const result = await addCustomerNote(ctx, {
        customerId: 'CUST_001',
        title: 'Quick reminder',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('NOTE_002');
      expect(result.title).toBe('Quick reminder');
      expect(result.details).toBeNull();
    });

    it('addCustomerNote — throws NotFoundError when customer does not exist', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        addCustomerNote(ctx, {
          customerId: 'CUST_MISSING',
          title: 'Should fail',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    // ── addCustomerDocument ─────────────────────────────────────

    it('addCustomerDocument — creates document record with correct fields', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert document
      mockInsertReturns([{
        id: 'DOC_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        documentType: 'waiver',
        name: 'Liability Waiver 2026',
        description: 'Annual liability waiver',
        storageKey: 'docs/cust001/waiver-2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 125000,
        uploadedBy: USER_A,
        uploadedAt: new Date('2026-02-20T13:00:00Z'),
        expiresAt: null,
      }]);
      // Activity log insert
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await addCustomerDocument(ctx, {
        customerId: 'CUST_001',
        documentType: 'waiver',
        name: 'Liability Waiver 2026',
        description: 'Annual liability waiver',
        storageKey: 'docs/cust001/waiver-2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 125000,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('DOC_001');
      expect(result.documentType).toBe('waiver');
      expect(result.name).toBe('Liability Waiver 2026');
      expect(result.storageKey).toBe('docs/cust001/waiver-2026.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.sizeBytes).toBe(125000);
      expect(result.uploadedBy).toBe(USER_A);
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer_document.added.v1', expect.objectContaining({
        customerId: 'CUST_001',
        documentId: 'DOC_001',
        documentType: 'waiver',
        name: 'Liability Waiver 2026',
        mimeType: 'application/pdf',
        sizeBytes: 125000,
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.document_added', 'customer', 'CUST_001');
    });

    it('addCustomerDocument — photo type updates customer profileImageUrl', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert document
      mockInsertReturns([{
        id: 'DOC_002',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        documentType: 'photo',
        name: 'Profile Photo',
        storageKey: 'photos/cust001/profile.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 45000,
        uploadedBy: USER_A,
        uploadedAt: new Date('2026-02-20T14:00:00Z'),
      }]);
      // Activity log insert
      mockInsertReturns([{ id: 'LOG_002' }]);

      await addCustomerDocument(ctx, {
        customerId: 'CUST_001',
        documentType: 'photo',
        name: 'Profile Photo',
        storageKey: 'photos/cust001/profile.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 45000,
      });

      // Verify update was called (to set profileImageUrl)
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('addCustomerDocument — throws NotFoundError when customer does not exist', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        addCustomerDocument(ctx, {
          customerId: 'CUST_MISSING',
          documentType: 'contract',
          name: 'Test Doc',
          storageKey: 'docs/test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1000,
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── Section 3: Query Tests ────────────────────────────────────

  describe('Queries', () => {
    // ── getCustomerActivity ──────────────────────────────────────

    it('getCustomerActivity — returns interleaved timeline items', async () => {
      const ts1 = new Date('2026-02-20T10:00:00Z');
      const ts2 = new Date('2026-02-20T11:00:00Z');
      const ts3 = new Date('2026-02-20T12:00:00Z');

      // Activity log rows (first select call)
      mockSelectReturns([
        { id: 'ACT_003', customerId: 'CUST_001', activityType: 'system', title: 'Order placed', details: null, createdAt: ts3, createdBy: USER_A },
        { id: 'ACT_002', customerId: 'CUST_001', activityType: 'note', title: 'VIP note', details: 'Prefers window seat', createdAt: ts2, createdBy: USER_A },
        { id: 'ACT_001', customerId: 'CUST_001', activityType: 'system', title: 'Account created', details: null, createdAt: ts1, createdBy: 'system' },
      ]);
      // Recent visits (second select call)
      mockSelectReturns([
        { id: 'VISIT_001', customerId: 'CUST_001', location: 'pro_shop', checkInAt: ts1, checkOutAt: ts2 },
      ]);

      const result = await getCustomerActivity({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0]!.id).toBe('ACT_003');
      expect(result.timeline[1]!.id).toBe('ACT_002');
      expect(result.timeline[2]!.id).toBe('ACT_001');
      expect(result.recentVisits).toHaveLength(1);
      expect(result.recentVisits[0]!.id).toBe('VISIT_001');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('getCustomerActivity — cursor pagination works', async () => {
      // Return limit+1 rows to trigger hasMore (default limit=50)
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `ACT_${String(i).padStart(3, '0')}`,
        customerId: 'CUST_001',
        activityType: 'system',
        title: `Activity ${i}`,
        details: null,
        createdAt: new Date(`2026-02-20T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
        createdBy: USER_A,
      }));
      // Activity log
      mockSelectReturns(rows);
      // Recent visits
      mockSelectReturns([]);

      const result = await getCustomerActivity({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.timeline).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('ACT_049');
    });

    it('getCustomerActivity — respects cursor parameter', async () => {
      // Should filter by lt(id, cursor)
      mockSelectReturns([
        { id: 'ACT_024', customerId: 'CUST_001', activityType: 'note', title: 'Older note', createdAt: new Date('2026-02-19T10:00:00Z'), createdBy: USER_A },
      ]);
      mockSelectReturns([]);

      const result = await getCustomerActivity({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        cursor: 'ACT_025',
      });

      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0]!.id).toBe('ACT_024');
      expect(result.hasMore).toBe(false);
    });

    // ── getCustomerNotes ────────────────────────────────────────

    it('getCustomerNotes — returns notes, incidents, and alerts', async () => {
      // Staff notes (activity log where activityType='note')
      mockSelectReturns([
        { id: 'NOTE_001', customerId: 'CUST_001', activityType: 'note', title: 'VIP preference', details: 'Always comp the first drink', createdAt: new Date('2026-02-20T10:00:00Z'), createdBy: USER_A },
        { id: 'NOTE_002', customerId: 'CUST_001', activityType: 'note', title: 'Allergy', details: 'Peanut allergy', createdAt: new Date('2026-02-19T10:00:00Z'), createdBy: USER_A },
      ]);
      // Incidents
      mockSelectReturns([
        { id: 'INC_001', customerId: 'CUST_001', incidentType: 'complaint', severity: 'medium', subject: 'Slow service', createdAt: new Date('2026-02-18T10:00:00Z') },
      ]);
      // Alerts
      mockSelectReturns([
        { id: 'ALERT_001', customerId: 'CUST_001', alertType: 'vip_arrival', severity: 'info', message: 'VIP arriving today', isActive: true, createdAt: new Date('2026-02-20T08:00:00Z') },
      ]);

      const result = await getCustomerNotes({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.staffNotes).toHaveLength(2);
      expect(result.staffNotes[0]!.id).toBe('NOTE_001');
      expect(result.staffNotes[1]!.id).toBe('NOTE_002');
      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0]!.id).toBe('INC_001');
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.id).toBe('ALERT_001');
    });

    it('getCustomerNotes — returns empty arrays when no data', async () => {
      // Staff notes
      mockSelectReturns([]);
      // Incidents
      mockSelectReturns([]);
      // Alerts
      mockSelectReturns([]);

      const result = await getCustomerNotes({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.staffNotes).toHaveLength(0);
      expect(result.incidents).toHaveLength(0);
      expect(result.alerts).toHaveLength(0);
    });

    // ── getCustomerCommunications ────────────────────────────────

    it('getCustomerCommunications — returns communications', async () => {
      mockSelectReturns([
        { id: 'COMM_001', customerId: 'CUST_001', channel: 'email', direction: 'outbound', subject: 'Welcome', status: 'delivered', createdAt: new Date('2026-02-20T10:00:00Z'), createdBy: USER_A },
        { id: 'COMM_002', customerId: 'CUST_001', channel: 'sms', direction: 'outbound', subject: null, status: 'sent', createdAt: new Date('2026-02-19T14:00:00Z'), createdBy: USER_A },
      ]);

      const result = await getCustomerCommunications({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('COMM_001');
      expect(result.items[0]!.channel).toBe('email');
      expect(result.items[0]!.direction).toBe('outbound');
      expect(result.items[1]!.id).toBe('COMM_002');
      expect(result.items[1]!.channel).toBe('sms');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('getCustomerCommunications — cursor pagination works', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `COMM_${String(i).padStart(3, '0')}`,
        customerId: 'CUST_001',
        channel: 'email',
        direction: 'outbound',
        subject: `Email ${i}`,
        status: 'sent',
        createdAt: new Date(`2026-02-20T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
        createdBy: USER_A,
      }));
      mockSelectReturns(rows);

      const result = await getCustomerCommunications({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        limit: 50,
      });

      expect(result.items).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('COMM_049');
    });

    it('getCustomerCommunications — returns empty list for no data', async () => {
      mockSelectReturns([]);

      const result = await getCustomerCommunications({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('getCustomerCommunications — respects cursor for pagination', async () => {
      mockSelectReturns([
        { id: 'COMM_009', customerId: 'CUST_001', channel: 'push', direction: 'outbound', subject: 'Reminder', status: 'delivered', createdAt: new Date('2026-02-18T09:00:00Z'), createdBy: USER_A },
      ]);

      const result = await getCustomerCommunications({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        cursor: 'COMM_010',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('COMM_009');
      expect(result.hasMore).toBe(false);
    });

    // ── getCustomerDocuments ─────────────────────────────────────

    it('getCustomerDocuments — returns documents ordered by uploadedAt desc', async () => {
      mockSelectReturns([
        {
          id: 'DOC_002',
          customerId: 'CUST_001',
          documentType: 'waiver',
          name: 'Liability Waiver 2026',
          description: 'Updated waiver',
          storageKey: 'docs/cust001/waiver-2026.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 130000,
          tagsJson: ['waiver', '2026'],
          version: 2,
          uploadedAt: new Date('2026-02-20T15:00:00Z'),
          uploadedBy: USER_A,
          expiresAt: new Date('2027-02-20T00:00:00Z'),
        },
        {
          id: 'DOC_001',
          customerId: 'CUST_001',
          documentType: 'contract',
          name: 'Membership Agreement',
          description: null,
          storageKey: 'docs/cust001/agreement.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 245000,
          tagsJson: ['membership'],
          version: 1,
          uploadedAt: new Date('2026-01-15T10:00:00Z'),
          uploadedBy: USER_A,
          expiresAt: null,
        },
      ]);

      const result = await getCustomerDocuments({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('DOC_002');
      expect(result[0]!.documentType).toBe('waiver');
      expect(result[0]!.name).toBe('Liability Waiver 2026');
      expect(result[0]!.version).toBe(2);
      expect(result[0]!.tagsJson).toEqual(['waiver', '2026']);
      expect(result[1]!.id).toBe('DOC_001');
      expect(result[1]!.documentType).toBe('contract');
      expect(result[1]!.expiresAt).toBeNull();
    });

    it('getCustomerDocuments — returns empty array when no documents', async () => {
      mockSelectReturns([]);

      const result = await getCustomerDocuments({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result).toHaveLength(0);
    });

    it('getCustomerDocuments — returns documents with expiration dates', async () => {
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      mockSelectReturns([
        {
          id: 'DOC_003',
          customerId: 'CUST_001',
          documentType: 'medical_waiver',
          name: 'Medical Clearance',
          description: 'Annual medical clearance form',
          storageKey: 'docs/cust001/medical-2026.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 80000,
          tagsJson: ['medical', 'annual'],
          version: 1,
          uploadedAt: new Date('2026-02-01T10:00:00Z'),
          uploadedBy: USER_A,
          expiresAt,
        },
      ]);

      const result = await getCustomerDocuments({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.documentType).toBe('medical_waiver');
      expect(result[0]!.expiresAt).toEqual(expiresAt);
      expect(result[0]!.tagsJson).toEqual(['medical', 'annual']);
    });
  });
});
