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
    const tx = { insert: mockInsert, select: mockSelect, update: mockUpdate, delete: mockDelete };
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
  // ALL table symbols
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
  // Session 16.5 tables
  customerContacts: Symbol('customerContacts'),
  customerPreferences: Symbol('customerPreferences'),
  customerDocuments: Symbol('customerDocuments'),
  customerCommunications: Symbol('customerCommunications'),
  customerServiceFlags: Symbol('customerServiceFlags'),
  customerConsents: Symbol('customerConsents'),
  customerExternalIds: Symbol('customerExternalIds'),
  customerAuthAccounts: Symbol('customerAuthAccounts'),
  customerWalletAccounts: Symbol('customerWalletAccounts'),
  customerAlerts: Symbol('customerAlerts'),
  customerScores: Symbol('customerScores'),
  customerMetricsDaily: Symbol('customerMetricsDaily'),
  customerMetricsLifetime: Symbol('customerMetricsLifetime'),
  customerMergeHistory: Symbol('customerMergeHistory'),
  customerHouseholds: Symbol('customerHouseholds'),
  customerHouseholdMembers: Symbol('customerHouseholdMembers'),
  customerVisits: Symbol('customerVisits'),
  customerIncidents: Symbol('customerIncidents'),
  customerSegments: Symbol('customerSegments'),
  customerSegmentMemberships: Symbol('customerSegmentMemberships'),
  customerPaymentMethods: Symbol('customerPaymentMethods'),
  // Other modules
  paymentJournalEntries: Symbol('paymentJournalEntries'),
  orders: Symbol('orders'),
  orderLines: Symbol('orderLines'),
  locations: Symbol('locations'),
  idempotencyKeys: Symbol('idempotencyKeys'),
  inventoryItems: Symbol('inventoryItems'),
  inventoryMovements: Symbol('inventoryMovements'),
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
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  not: vi.fn(),
  lt: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  sum: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), { raw: vi.fn((s: string) => s), join: vi.fn() }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { addCustomerContact } from '../commands/add-customer-contact';
import { updateCustomerContact } from '../commands/update-customer-contact';
import { setCustomerPreference } from '../commands/set-customer-preference';
import { deleteCustomerPreference } from '../commands/delete-customer-preference';
import { addCustomerDocument } from '../commands/add-customer-document';
import { logCustomerCommunication } from '../commands/log-customer-communication';
import { addServiceFlag } from '../commands/add-service-flag';
import { removeServiceFlag } from '../commands/remove-service-flag';
import { recordConsent } from '../commands/record-consent';
import { addExternalId } from '../commands/add-external-id';
import { createWalletAccount } from '../commands/create-wallet-account';
import { adjustWalletBalance } from '../commands/adjust-wallet-balance';
import { createAlert } from '../commands/create-alert';
import { dismissAlert } from '../commands/dismiss-alert';
import { createHousehold } from '../commands/create-household';
import { addHouseholdMember } from '../commands/add-household-member';
import { removeHouseholdMember } from '../commands/remove-household-member';
import { recordVisit } from '../commands/record-visit';
import { checkOutVisit } from '../commands/check-out-visit';
import { createIncident } from '../commands/create-incident';
import { updateIncident } from '../commands/update-incident';
import { createSegment, addToSegment, removeFromSegment } from '../commands/manage-segments';

// ── Test data ─────────────────────────────────────────────────

const ctx = {
  tenantId: 'TENANT_001',
  user: { id: 'USER_001', name: 'Test User', email: 'test@example.com', role: 'admin' },
  permissions: ['customers.view', 'customers.manage', 'billing.view', 'billing.manage'],
} as any;

// ── Tests ─────────────────────────────────────────────────────

describe('Session 16.5 — Customer Profile Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish default chains after clearing
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });

    mockSelect.mockReturnValue(makeSelectChain([]));

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

  // ── 1. addCustomerContact ─────────────────────────────────────

  describe('addCustomerContact', () => {
    it('should add a contact successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No duplicate email
      mockSelectReturns([]);
      // Insert contact
      const created = {
        id: 'CONTACT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        contactType: 'email',
        value: 'alice@example.com',
        isPrimary: false,
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await addCustomerContact(ctx, {
        customerId: 'CUST_001',
        contactType: 'email',
        value: 'alice@example.com',
        isPrimary: false,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('CONTACT_001');
      expect(result.contactType).toBe('email');
      expect(result.value).toBe('alice@example.com');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.contact_added', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        addCustomerContact(ctx, {
          customerId: 'CUST_MISSING',
          contactType: 'email',
          value: 'test@example.com',
          isPrimary: false,
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('should throw ConflictError on duplicate email contact', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Duplicate found
      mockSelectReturns([{ id: 'CONTACT_EXISTING' }]);

      await expect(
        addCustomerContact(ctx, {
          customerId: 'CUST_001',
          contactType: 'email',
          value: 'duplicate@example.com',
          isPrimary: false,
        }),
      ).rejects.toThrow('Contact with this email already exists');
    });
  });

  // ── 2. updateCustomerContact ──────────────────────────────────

  describe('updateCustomerContact', () => {
    it('should update a contact successfully', async () => {
      // Find existing contact
      const existing = {
        id: 'CONTACT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        contactType: 'email',
        value: 'old@example.com',
        isPrimary: false,
      };
      mockSelectReturns([existing]);
      // Update returning
      const updated = { ...existing, value: 'new@example.com' };
      mockUpdateReturns([updated]);

      const result = await updateCustomerContact(ctx, {
        contactId: 'CONTACT_001',
        value: 'new@example.com',
      });

      expect(result).toBeDefined();
      expect(result.value).toBe('new@example.com');
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.contact_updated', 'customer_contact', 'CONTACT_001');
    });

    it('should throw NotFoundError when contact does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        updateCustomerContact(ctx, {
          contactId: 'CONTACT_MISSING',
          value: 'test@example.com',
        }),
      ).rejects.toThrow('Customer contact CONTACT_MISSING not found');
    });
  });

  // ── 3. setCustomerPreference ──────────────────────────────────

  describe('setCustomerPreference', () => {
    it('should insert a new preference when none exists', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No existing preference
      mockSelectReturns([]);
      // Insert preference
      const created = {
        id: 'PREF_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        category: 'general',
        key: 'preferred_channel',
        value: 'sms',
        source: 'manual',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await setCustomerPreference(ctx, {
        customerId: 'CUST_001',
        category: 'general',
        key: 'preferred_channel',
        value: 'sms',
        source: 'manual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('PREF_001');
      expect(result.category).toBe('general');
      expect(result.key).toBe('preferred_channel');
      expect(result.value).toBe('sms');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.preference_set', 'customer', 'CUST_001');
    });

    it('should update an existing preference', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Existing preference found
      mockSelectReturns([{ id: 'PREF_001' }]);
      // Update preference
      const updated = {
        id: 'PREF_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        category: 'general',
        key: 'preferred_channel',
        value: 'email',
        source: 'manual',
      };
      mockUpdateReturns([updated]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await setCustomerPreference(ctx, {
        customerId: 'CUST_001',
        category: 'general',
        key: 'preferred_channel',
        value: 'email',
        source: 'manual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('PREF_001');
      expect(result.value).toBe('email');
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        setCustomerPreference(ctx, {
          customerId: 'CUST_MISSING',
          category: 'general',
          key: 'preferred_channel',
          value: 'sms',
          source: 'manual',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 4. deleteCustomerPreference ───────────────────────────────

  describe('deleteCustomerPreference', () => {
    it('should delete a preference successfully', async () => {
      // Preference exists
      const existing = {
        id: 'PREF_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        category: 'general',
        key: 'preferred_channel',
        value: 'sms',
      };
      mockSelectReturns([existing]);

      const result = await deleteCustomerPreference(ctx, {
        customerId: 'CUST_001',
        preferenceId: 'PREF_001',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('PREF_001');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.preference_deleted', 'customer_preference', 'PREF_001');
    });

    it('should throw NotFoundError when preference does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        deleteCustomerPreference(ctx, {
          customerId: 'CUST_001',
          preferenceId: 'PREF_MISSING',
        }),
      ).rejects.toThrow('Customer preference PREF_MISSING not found');
    });
  });

  // ── 5. addCustomerDocument ────────────────────────────────────

  describe('addCustomerDocument', () => {
    it('should add a document successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert document
      const created = {
        id: 'DOC_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        documentType: 'id_verification',
        name: 'Drivers License',
        storageKey: 'docs/dl_001.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 102400,
        uploadedBy: 'USER_001',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await addCustomerDocument(ctx, {
        customerId: 'CUST_001',
        documentType: 'id_verification',
        name: 'Drivers License',
        storageKey: 'docs/dl_001.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 102400,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('DOC_001');
      expect(result.documentType).toBe('id_verification');
      expect(result.name).toBe('Drivers License');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.document_added', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        addCustomerDocument(ctx, {
          customerId: 'CUST_MISSING',
          documentType: 'id_verification',
          name: 'Drivers License',
          storageKey: 'docs/dl_001.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 102400,
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 6. logCustomerCommunication ───────────────────────────────

  describe('logCustomerCommunication', () => {
    it('should log a communication successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert communication
      const created = {
        id: 'COMM_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        channel: 'email',
        direction: 'outbound',
        subject: 'Welcome!',
        status: 'sent',
        createdBy: 'USER_001',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await logCustomerCommunication(ctx, {
        customerId: 'CUST_001',
        channel: 'email',
        direction: 'outbound',
        subject: 'Welcome!',
        status: 'sent',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('COMM_001');
      expect(result.channel).toBe('email');
      expect(result.direction).toBe('outbound');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.communication_logged', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        logCustomerCommunication(ctx, {
          customerId: 'CUST_MISSING',
          channel: 'email',
          direction: 'outbound',
          status: 'sent',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 7. addServiceFlag ─────────────────────────────────────────

  describe('addServiceFlag', () => {
    it('should add a service flag successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert service flag
      const created = {
        id: 'FLAG_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        flagType: 'allergy',
        severity: 'warning',
        notes: 'Peanut allergy',
        createdBy: 'USER_001',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await addServiceFlag(ctx, {
        customerId: 'CUST_001',
        flagType: 'allergy',
        severity: 'warning',
        notes: 'Peanut allergy',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('FLAG_001');
      expect(result.flagType).toBe('allergy');
      expect(result.severity).toBe('warning');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.service_flag_added', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        addServiceFlag(ctx, {
          customerId: 'CUST_MISSING',
          flagType: 'allergy',
          severity: 'warning',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 8. removeServiceFlag ──────────────────────────────────────

  describe('removeServiceFlag', () => {
    it('should remove a service flag successfully', async () => {
      // Flag exists
      const flag = {
        id: 'FLAG_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        flagType: 'allergy',
        severity: 'warning',
      };
      mockSelectReturns([flag]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await removeServiceFlag(ctx, {
        flagId: 'FLAG_001',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('FLAG_001');
      expect(result.flagType).toBe('allergy');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.service_flag_removed', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when flag does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        removeServiceFlag(ctx, {
          flagId: 'FLAG_MISSING',
        }),
      ).rejects.toThrow('Service flag FLAG_MISSING not found');
    });
  });

  // ── 9. recordConsent ──────────────────────────────────────────

  describe('recordConsent', () => {
    it('should insert a new consent grant', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No existing consent for this type
      mockSelectReturns([]);
      // Insert consent
      const created = {
        id: 'CONSENT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        consentType: 'marketing_email',
        status: 'granted',
        source: 'manual',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await recordConsent(ctx, {
        customerId: 'CUST_001',
        consentType: 'marketing_email',
        status: 'granted',
        source: 'manual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('CONSENT_001');
      expect(result.consentType).toBe('marketing_email');
      expect(result.status).toBe('granted');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.consent_recorded', 'customer', 'CUST_001');
    });

    it('should update an existing consent record', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Existing consent found
      mockSelectReturns([{ id: 'CONSENT_001', consentType: 'marketing_email', status: 'granted' }]);
      // Update consent
      const updated = {
        id: 'CONSENT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        consentType: 'marketing_email',
        status: 'revoked',
        source: 'manual',
      };
      mockUpdateReturns([updated]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await recordConsent(ctx, {
        customerId: 'CUST_001',
        consentType: 'marketing_email',
        status: 'revoked',
        source: 'manual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('CONSENT_001');
      expect(result.status).toBe('revoked');
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        recordConsent(ctx, {
          customerId: 'CUST_MISSING',
          consentType: 'marketing_email',
          status: 'granted',
          source: 'manual',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 10. addExternalId ─────────────────────────────────────────

  describe('addExternalId', () => {
    it('should add an external ID successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No duplicate
      mockSelectReturns([]);
      // Insert external ID
      const created = {
        id: 'EXTID_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        provider: 'stripe',
        externalId: 'cus_abc123',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await addExternalId(ctx, {
        customerId: 'CUST_001',
        provider: 'stripe',
        externalId: 'cus_abc123',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('EXTID_001');
      expect(result.provider).toBe('stripe');
      expect(result.externalId).toBe('cus_abc123');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.external_id_added', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        addExternalId(ctx, {
          customerId: 'CUST_MISSING',
          provider: 'stripe',
          externalId: 'cus_abc123',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('should throw ConflictError on duplicate provider + externalId', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Duplicate found
      mockSelectReturns([{ id: 'EXTID_EXISTING' }]);

      await expect(
        addExternalId(ctx, {
          customerId: 'CUST_001',
          provider: 'stripe',
          externalId: 'cus_abc123',
        }),
      ).rejects.toThrow('External ID already exists for this provider');
    });
  });

  // ── 11. createWalletAccount ───────────────────────────────────

  describe('createWalletAccount', () => {
    it('should create a wallet account successfully', async () => {
      // Customer exists (select() returns full customer for walletBalanceCents)
      mockSelectReturns([{ id: 'CUST_001', walletBalanceCents: 0, loyaltyPointsBalance: 0 }]);
      // Insert wallet account
      const created = {
        id: 'WALLET_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        walletType: 'credit',
        balanceCents: 5000,
        currency: 'USD',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await createWalletAccount(ctx, {
        customerId: 'CUST_001',
        walletType: 'credit',
        balanceCents: 5000,
        currency: 'USD',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('WALLET_001');
      expect(result.walletType).toBe('credit');
      expect(result.balanceCents).toBe(5000);
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.wallet_created', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        createWalletAccount(ctx, {
          customerId: 'CUST_MISSING',
          walletType: 'credit',
          balanceCents: 0,
          currency: 'USD',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 12. adjustWalletBalance ───────────────────────────────────

  describe('adjustWalletBalance', () => {
    it('should adjust wallet balance successfully', async () => {
      // Wallet exists and is active
      const wallet = {
        id: 'WALLET_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        walletType: 'credit',
        balanceCents: 5000,
        status: 'active',
      };
      mockSelectReturns([wallet]);
      // Update wallet
      const updated = { ...wallet, balanceCents: 8000 };
      mockUpdateReturns([updated]);
      // SUM query for total wallet balance (recompute)
      mockSelectReturns([{ total: 8000 }]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await adjustWalletBalance(ctx, {
        walletAccountId: 'WALLET_001',
        amountCents: 3000,
        reason: 'Manual credit',
      });

      expect(result).toBeDefined();
      expect(result.balanceCents).toBe(8000);
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.wallet_adjusted', 'wallet_account', 'WALLET_001');
    });

    it('should throw NotFoundError when wallet does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        adjustWalletBalance(ctx, {
          walletAccountId: 'WALLET_MISSING',
          amountCents: 1000,
          reason: 'Test',
        }),
      ).rejects.toThrow('Wallet account WALLET_MISSING not found');
    });

    it('should throw ValidationError when wallet is not active', async () => {
      const wallet = {
        id: 'WALLET_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        walletType: 'credit',
        balanceCents: 5000,
        status: 'frozen',
      };
      mockSelectReturns([wallet]);

      await expect(
        adjustWalletBalance(ctx, {
          walletAccountId: 'WALLET_001',
          amountCents: 1000,
          reason: 'Test',
        }),
      ).rejects.toThrow('Cannot adjust balance on a non-active wallet');
    });
  });

  // ── 13. createAlert ───────────────────────────────────────────

  describe('createAlert', () => {
    it('should create an alert successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert alert
      const created = {
        id: 'ALERT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        alertType: 'birthday',
        severity: 'info',
        message: 'Customer birthday today!',
        isActive: true,
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await createAlert(ctx, {
        customerId: 'CUST_001',
        alertType: 'birthday',
        severity: 'info',
        message: 'Customer birthday today!',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ALERT_001');
      expect(result.alertType).toBe('birthday');
      expect(result.message).toBe('Customer birthday today!');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.alert_created', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        createAlert(ctx, {
          customerId: 'CUST_MISSING',
          alertType: 'birthday',
          severity: 'info',
          message: 'Test',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 14. dismissAlert ──────────────────────────────────────────

  describe('dismissAlert', () => {
    it('should dismiss an alert successfully', async () => {
      // Alert exists
      const alert = {
        id: 'ALERT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        alertType: 'birthday',
        isActive: true,
      };
      mockSelectReturns([alert]);
      // Update alert
      const updated = { ...alert, isActive: false, dismissedAt: new Date(), dismissedBy: 'USER_001' };
      mockUpdateReturns([updated]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await dismissAlert(ctx, {
        alertId: 'ALERT_001',
      });

      expect(result).toBeDefined();
      expect(result.isActive).toBe(false);
      expect(result.dismissedBy).toBe('USER_001');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.alert_dismissed', 'customer', result.customerId);
    });

    it('should throw NotFoundError when alert does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        dismissAlert(ctx, {
          alertId: 'ALERT_MISSING',
        }),
      ).rejects.toThrow('Alert ALERT_MISSING not found');
    });
  });

  // ── 15. createHousehold ───────────────────────────────────────

  describe('createHousehold', () => {
    it('should create a household and auto-add primary member', async () => {
      // Primary customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert household
      const created = {
        id: 'HH_001',
        tenantId: 'TENANT_001',
        name: 'Smith Family',
        householdType: 'family',
        primaryCustomerId: 'CUST_001',
        createdBy: 'USER_001',
      };
      mockInsertReturns([created]);
      // Auto-insert primary as member
      mockInsertReturns([{ id: 'HHM_001', householdId: 'HH_001', customerId: 'CUST_001', role: 'primary' }]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await createHousehold(ctx, {
        primaryCustomerId: 'CUST_001',
        name: 'Smith Family',
        householdType: 'family',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('HH_001');
      expect(result.name).toBe('Smith Family');
      expect(result.primaryCustomerId).toBe('CUST_001');
      expect(mockInsert).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.household_created', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when primary customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        createHousehold(ctx, {
          primaryCustomerId: 'CUST_MISSING',
          name: 'Missing Family',
          householdType: 'family',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 16. addHouseholdMember ────────────────────────────────────

  describe('addHouseholdMember', () => {
    it('should add a household member successfully', async () => {
      // Household exists
      mockSelectReturns([{ id: 'HH_001' }]);
      // Customer exists
      mockSelectReturns([{ id: 'CUST_002' }]);
      // No duplicate membership
      mockSelectReturns([]);
      // Insert member
      const created = {
        id: 'HHM_002',
        tenantId: 'TENANT_001',
        householdId: 'HH_001',
        customerId: 'CUST_002',
        role: 'member',
      };
      mockInsertReturns([created]);

      const result = await addHouseholdMember(ctx, {
        householdId: 'HH_001',
        customerId: 'CUST_002',
        role: 'member',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('HHM_002');
      expect(result.householdId).toBe('HH_001');
      expect(result.customerId).toBe('CUST_002');
      expect(result.role).toBe('member');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.household_member_added', 'customer', 'CUST_002');
    });

    it('should throw NotFoundError when household does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        addHouseholdMember(ctx, {
          householdId: 'HH_MISSING',
          customerId: 'CUST_002',
          role: 'member',
        }),
      ).rejects.toThrow('Household HH_MISSING not found');
    });

    it('should throw ConflictError on duplicate member', async () => {
      // Household exists
      mockSelectReturns([{ id: 'HH_001' }]);
      // Customer exists
      mockSelectReturns([{ id: 'CUST_002' }]);
      // Duplicate membership found
      mockSelectReturns([{ id: 'HHM_EXISTING' }]);

      await expect(
        addHouseholdMember(ctx, {
          householdId: 'HH_001',
          customerId: 'CUST_002',
          role: 'member',
        }),
      ).rejects.toThrow('Customer is already a member of this household');
    });
  });

  // ── 17. removeHouseholdMember ─────────────────────────────────

  describe('removeHouseholdMember', () => {
    it('should remove a household member successfully', async () => {
      // Active membership found
      const membership = {
        id: 'HHM_002',
        tenantId: 'TENANT_001',
        householdId: 'HH_001',
        customerId: 'CUST_002',
        role: 'member',
        leftAt: null,
      };
      mockSelectReturns([membership]);
      // Update (soft-remove) membership
      const updated = { ...membership, leftAt: new Date() };
      mockUpdateReturns([updated]);

      const result = await removeHouseholdMember(ctx, {
        householdId: 'HH_001',
        customerId: 'CUST_002',
      });

      expect(result).toBeDefined();
      expect(result.leftAt).toBeDefined();
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.household_member_removed', 'customer', 'CUST_002');
    });

    it('should throw NotFoundError when membership does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        removeHouseholdMember(ctx, {
          householdId: 'HH_001',
          customerId: 'CUST_MISSING',
        }),
      ).rejects.toThrow('Household membership HH_001/CUST_MISSING not found');
    });
  });

  // ── 18. recordVisit ───────────────────────────────────────────

  describe('recordVisit', () => {
    it('should record a visit and update totalVisits + lastVisitAt', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert visit
      const created = {
        id: 'VISIT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        location: 'restaurant',
        checkInAt: new Date(),
        checkInMethod: 'manual',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await recordVisit(ctx, {
        customerId: 'CUST_001',
        location: 'restaurant',
        checkInMethod: 'manual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('VISIT_001');
      expect(result.location).toBe('restaurant');
      expect(result.checkInMethod).toBe('manual');
      // Verify customer update was called (totalVisits + 1, lastVisitAt)
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.visit_recorded', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        recordVisit(ctx, {
          customerId: 'CUST_MISSING',
          location: 'restaurant',
          checkInMethod: 'manual',
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 19. checkOutVisit ─────────────────────────────────────────

  describe('checkOutVisit', () => {
    it('should check out a visit and compute duration', async () => {
      // Visit exists with no checkOutAt
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60000);
      const visit = {
        id: 'VISIT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        checkInAt: thirtyMinutesAgo.toISOString(),
        checkOutAt: null,
      };
      mockSelectReturns([visit]);
      // Update visit
      const updated = {
        ...visit,
        checkOutAt: new Date(),
        durationMinutes: 30,
      };
      mockUpdateReturns([updated]);

      const result = await checkOutVisit(ctx, {
        visitId: 'VISIT_001',
      });

      expect(result).toBeDefined();
      expect(result.checkOutAt).toBeDefined();
      expect(result.durationMinutes).toBe(30);
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.visit_checked_out', 'customer_visit', 'VISIT_001');
    });

    it('should throw NotFoundError when visit does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        checkOutVisit(ctx, {
          visitId: 'VISIT_MISSING',
        }),
      ).rejects.toThrow('Visit VISIT_MISSING not found');
    });

    it('should throw ValidationError when visit is already checked out', async () => {
      const visit = {
        id: 'VISIT_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        checkInAt: new Date(Date.now() - 60 * 60000).toISOString(),
        checkOutAt: new Date().toISOString(),
      };
      mockSelectReturns([visit]);

      await expect(
        checkOutVisit(ctx, {
          visitId: 'VISIT_001',
        }),
      ).rejects.toThrow('Visit is already checked out');
    });
  });

  // ── 20. createIncident ────────────────────────────────────────

  describe('createIncident', () => {
    it('should create an incident successfully', async () => {
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert incident
      const created = {
        id: 'INC_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        incidentType: 'complaint',
        severity: 'high',
        subject: 'Cold food served',
        description: 'Customer received cold food.',
        status: 'open',
        reportedBy: 'USER_001',
      };
      mockInsertReturns([created]);
      // Activity log insert
      mockInsertReturns([]);

      const result = await createIncident(ctx, {
        customerId: 'CUST_001',
        incidentType: 'complaint',
        severity: 'high',
        subject: 'Cold food served',
        description: 'Customer received cold food.',
        staffInvolvedIds: [],
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('INC_001');
      expect(result.incidentType).toBe('complaint');
      expect(result.severity).toBe('high');
      expect(result.subject).toBe('Cold food served');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.incident_created', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        createIncident(ctx, {
          customerId: 'CUST_MISSING',
          incidentType: 'complaint',
          severity: 'high',
          subject: 'Test',
          staffInvolvedIds: [],
        }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });
  });

  // ── 21. updateIncident ────────────────────────────────────────

  describe('updateIncident', () => {
    it('should update an incident successfully', async () => {
      // Incident exists
      const incident = {
        id: 'INC_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        incidentType: 'complaint',
        status: 'open',
        subject: 'Cold food served',
      };
      mockSelectReturns([incident]);
      // Update incident
      const updated = {
        ...incident,
        status: 'investigating',
        resolution: null,
      };
      mockUpdateReturns([updated]);

      const result = await updateIncident(ctx, {
        incidentId: 'INC_001',
        status: 'investigating',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('investigating');
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.incident_updated', 'customer_incident', 'INC_001');
    });

    it('should throw NotFoundError when incident does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        updateIncident(ctx, {
          incidentId: 'INC_MISSING',
          status: 'resolved',
        }),
      ).rejects.toThrow('Incident INC_MISSING not found');
    });

    it('should set resolvedBy and resolvedAt when resolving', async () => {
      // Incident exists
      const incident = {
        id: 'INC_001',
        tenantId: 'TENANT_001',
        customerId: 'CUST_001',
        incidentType: 'complaint',
        status: 'investigating',
        subject: 'Cold food served',
      };
      mockSelectReturns([incident]);
      // Update incident with resolved fields
      const updated = {
        ...incident,
        status: 'resolved',
        resolution: 'Offered replacement meal',
        resolvedBy: 'USER_001',
        resolvedAt: new Date(),
      };
      mockUpdateReturns([updated]);

      const result = await updateIncident(ctx, {
        incidentId: 'INC_001',
        status: 'resolved',
        resolution: 'Offered replacement meal',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('resolved');
      expect(result.resolvedBy).toBe('USER_001');
      expect(result.resolvedAt).toBeDefined();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // ── 22. Segments: createSegment, addToSegment, removeFromSegment ─

  describe('createSegment', () => {
    it('should create a segment successfully', async () => {
      // Insert segment
      const created = {
        id: 'SEG_001',
        tenantId: 'TENANT_001',
        name: 'VIP Customers',
        description: 'Top-tier customers',
        segmentType: 'manual',
        memberCount: 0,
        createdBy: 'USER_001',
      };
      mockInsertReturns([created]);

      const result = await createSegment(ctx, {
        name: 'VIP Customers',
        description: 'Top-tier customers',
        segmentType: 'manual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('SEG_001');
      expect(result.name).toBe('VIP Customers');
      expect(result.segmentType).toBe('manual');
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.segment_created', 'customer_segment', 'SEG_001');
    });
  });

  describe('addToSegment', () => {
    it('should add a customer to a segment successfully', async () => {
      // Segment exists
      mockSelectReturns([{ id: 'SEG_001' }]);
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // No existing membership
      mockSelectReturns([]);
      // Insert segment membership
      const created = {
        id: 'SEGM_001',
        tenantId: 'TENANT_001',
        segmentId: 'SEG_001',
        customerId: 'CUST_001',
        addedBy: 'USER_001',
      };
      mockInsertReturns([created]);

      const result = await addToSegment(ctx, {
        segmentId: 'SEG_001',
        customerId: 'CUST_001',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('SEGM_001');
      expect(result.segmentId).toBe('SEG_001');
      expect(result.customerId).toBe('CUST_001');
      // Verify segment memberCount was incremented
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.segment_member_added', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when segment does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        addToSegment(ctx, {
          segmentId: 'SEG_MISSING',
          customerId: 'CUST_001',
        }),
      ).rejects.toThrow('Segment SEG_MISSING not found');
    });

    it('should throw ConflictError when customer is already in the segment', async () => {
      // Segment exists
      mockSelectReturns([{ id: 'SEG_001' }]);
      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Existing membership found
      mockSelectReturns([{ id: 'SEGM_EXISTING' }]);

      await expect(
        addToSegment(ctx, {
          segmentId: 'SEG_001',
          customerId: 'CUST_001',
        }),
      ).rejects.toThrow('Customer is already in this segment');
    });
  });

  describe('removeFromSegment', () => {
    it('should remove a customer from a segment successfully', async () => {
      // Active membership found
      const membership = {
        id: 'SEGM_001',
        tenantId: 'TENANT_001',
        segmentId: 'SEG_001',
        customerId: 'CUST_001',
        removedAt: null,
      };
      mockSelectReturns([membership]);
      // Update (soft-remove) membership
      const updated = { ...membership, removedAt: new Date() };
      mockUpdateReturns([updated]);

      const result = await removeFromSegment(ctx, {
        segmentId: 'SEG_001',
        customerId: 'CUST_001',
      });

      expect(result).toBeDefined();
      expect(result.removedAt).toBeDefined();
      // Verify segment memberCount was decremented
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPublishWithOutbox).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.segment_member_removed', 'customer', 'CUST_001');
    });

    it('should throw NotFoundError when segment membership does not exist', async () => {
      mockSelectReturns([]);

      await expect(
        removeFromSegment(ctx, {
          segmentId: 'SEG_001',
          customerId: 'CUST_MISSING',
        }),
      ).rejects.toThrow('Segment membership SEG_001/CUST_MISSING not found');
    });
  });
});
