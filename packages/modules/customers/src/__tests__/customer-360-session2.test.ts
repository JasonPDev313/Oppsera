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
// recordCustomerAuditEntry imports withTenant from this path
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
  customerServiceFlags: Symbol('customerServiceFlags'),
  customerAlerts: Symbol('customerAlerts'),
  customerScores: Symbol('customerScores'),
  customerMetricsLifetime: Symbol('customerMetricsLifetime'),
  customerVisits: Symbol('customerVisits'),
  customerAuditLog: Symbol('customerAuditLog'),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn((...args: unknown[]) => args),
  }),
}));
vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_002'),
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
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn((...args: unknown[]) => args),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import {
  createFinancialAccountSchema,
  adjustLedgerSchema,
  transferBetweenAccountsSchema,
  configureAutopaySchema,
  updateCreditLimitSchema,
  placeFinancialHoldSchema,
  recordCustomerAuditEntrySchema,
} from '../validation';

import { createFinancialAccount } from '../commands/create-financial-account';
import { updateFinancialAccount } from '../commands/update-financial-account';
import { adjustLedger } from '../commands/adjust-ledger';
import { transferBetweenAccounts } from '../commands/transfer-between-accounts';
import { configureAutopay } from '../commands/configure-autopay';
import { placeFinancialHold } from '../commands/place-financial-hold';
import { liftFinancialHold } from '../commands/lift-financial-hold';
import { updateCreditLimit } from '../commands/update-credit-limit';
import { recordCustomerAuditEntry } from '../commands/record-customer-audit-entry';

import { getFinancialAccountsSummary } from '../queries/get-financial-accounts-summary';
import { getUnifiedLedger } from '../queries/get-unified-ledger';
import { getCustomerAgingSummary } from '../queries/get-customer-aging-summary';
import { getCustomerAuditTrail } from '../queries/get-customer-audit-trail';

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

describe('Customer 360 — Session 2: Customer Financial Engine', () => {
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
    it('createFinancialAccountSchema — valid input with defaults applied', () => {
      const result = createFinancialAccountSchema.parse({
        customerId: 'CUST_001',
        name: 'House Account',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.name).toBe('House Account');
      expect(result.accountType).toBe('house');
      expect(result.billingCycle).toBe('monthly');
      expect(result.dueDays).toBe(30);
      expect(result.currency).toBe('USD');
    });

    it('createFinancialAccountSchema — rejects missing required fields', () => {
      const noCustomerId = createFinancialAccountSchema.safeParse({
        name: 'House Account',
      });
      expect(noCustomerId.success).toBe(false);

      const noName = createFinancialAccountSchema.safeParse({
        customerId: 'CUST_001',
      });
      expect(noName.success).toBe(false);
    });

    it('createFinancialAccountSchema — rejects invalid accountType', () => {
      const result = createFinancialAccountSchema.safeParse({
        customerId: 'CUST_001',
        name: 'Test Account',
        accountType: 'invalid_type',
      });
      expect(result.success).toBe(false);
    });

    it('createFinancialAccountSchema — accepts all valid accountTypes', () => {
      const types = ['house', 'corporate', 'member', 'group', 'event'] as const;
      for (const accountType of types) {
        const result = createFinancialAccountSchema.safeParse({
          customerId: 'CUST_001',
          name: 'Test',
          accountType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('adjustLedgerSchema — valid input', () => {
      const result = adjustLedgerSchema.parse({
        billingAccountId: 'BA_001',
        type: 'credit_memo',
        amountCents: -5000,
        notes: 'Courtesy credit',
      });

      expect(result.billingAccountId).toBe('BA_001');
      expect(result.type).toBe('credit_memo');
      expect(result.amountCents).toBe(-5000);
      expect(result.notes).toBe('Courtesy credit');
    });

    it('adjustLedgerSchema — rejects invalid type', () => {
      const result = adjustLedgerSchema.safeParse({
        billingAccountId: 'BA_001',
        type: 'refund',
        amountCents: -1000,
      });
      expect(result.success).toBe(false);
    });

    it('adjustLedgerSchema — allows negative amount (for credit_memo and writeoff)', () => {
      const result = adjustLedgerSchema.safeParse({
        billingAccountId: 'BA_001',
        type: 'credit_memo',
        amountCents: -5000,
      });
      expect(result.success).toBe(true);
      expect(result.data!.amountCents).toBe(-5000);
    });

    it('transferBetweenAccountsSchema — valid input', () => {
      const result = transferBetweenAccountsSchema.parse({
        fromAccountId: 'BA_001',
        toAccountId: 'BA_002',
        amountCents: 10000,
        reason: 'Consolidation',
      });

      expect(result.fromAccountId).toBe('BA_001');
      expect(result.toAccountId).toBe('BA_002');
      expect(result.amountCents).toBe(10000);
      expect(result.reason).toBe('Consolidation');
    });

    it('configureAutopaySchema — valid with strategy', () => {
      const result = configureAutopaySchema.parse({
        accountId: 'BA_001',
        strategy: 'full_balance',
      });

      expect(result.accountId).toBe('BA_001');
      expect(result.strategy).toBe('full_balance');
    });

    it('configureAutopaySchema — null strategy (disable)', () => {
      const result = configureAutopaySchema.parse({
        accountId: 'BA_001',
        strategy: null,
      });

      expect(result.accountId).toBe('BA_001');
      expect(result.strategy).toBeNull();
    });

    it('updateCreditLimitSchema — valid input', () => {
      const result = updateCreditLimitSchema.parse({
        accountId: 'BA_001',
        newCreditLimitCents: 500000,
        reason: 'Annual review increase',
      });

      expect(result.accountId).toBe('BA_001');
      expect(result.newCreditLimitCents).toBe(500000);
      expect(result.reason).toBe('Annual review increase');
    });

    it('updateCreditLimitSchema — rejects negative limit', () => {
      const result = updateCreditLimitSchema.safeParse({
        accountId: 'BA_001',
        newCreditLimitCents: -100,
        reason: 'Should fail',
      });
      expect(result.success).toBe(false);
    });

    it('placeFinancialHoldSchema — valid input', () => {
      const result = placeFinancialHoldSchema.parse({
        accountId: 'BA_001',
        holdType: 'hold',
        reason: 'Overdue balance',
      });

      expect(result.accountId).toBe('BA_001');
      expect(result.holdType).toBe('hold');
      expect(result.reason).toBe('Overdue balance');
    });

    it('placeFinancialHoldSchema — rejects invalid holdType', () => {
      const result = placeFinancialHoldSchema.safeParse({
        accountId: 'BA_001',
        holdType: 'paused',
        reason: 'Should fail',
      });
      expect(result.success).toBe(false);
    });

    it('recordCustomerAuditEntrySchema — valid input', () => {
      const result = recordCustomerAuditEntrySchema.parse({
        customerId: 'CUST_001',
        actionType: 'credit_limit_changed',
        beforeJson: { creditLimitCents: 100000 },
        afterJson: { creditLimitCents: 200000 },
        reason: 'Manager approved increase',
      });

      expect(result.customerId).toBe('CUST_001');
      expect(result.actionType).toBe('credit_limit_changed');
      expect(result.beforeJson).toEqual({ creditLimitCents: 100000 });
      expect(result.afterJson).toEqual({ creditLimitCents: 200000 });
      expect(result.reason).toBe('Manager approved increase');
    });
  });

  // ── Section 2: Command Tests ──────────────────────────────────

  describe('Commands', () => {
    it('createFinancialAccount — creates account with correct fields and sets primaryCustomerId', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert billing account
      mockInsertReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        name: 'House Account',
        primaryCustomerId: 'CUST_001',
        creditLimitCents: 100000,
        billingCycle: 'monthly',
        dueDays: 30,
        metadata: { accountType: 'house', currency: 'USD' },
      }]);
      // Insert billing account member
      mockInsertReturns([{ id: 'BAM_001' }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await createFinancialAccount(ctx, {
        customerId: 'CUST_001',
        name: 'House Account',
        creditLimitCents: 100000,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('BA_001');
      expect(result.primaryCustomerId).toBe('CUST_001');
      expect(result.name).toBe('House Account');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.financial_account.created.v1', expect.objectContaining({
        accountId: 'BA_001',
        customerId: 'CUST_001',
        name: 'House Account',
        accountType: 'house',
        creditLimitCents: 100000,
        currency: 'USD',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.financial_account_created', 'billing_account', 'BA_001');
    });

    it('createFinancialAccount — throws NotFoundError when customer does not exist', async () => {
      const ctx = makeCtx();

      mockSelectReturns([]);

      await expect(
        createFinancialAccount(ctx, { customerId: 'CUST_MISSING', name: 'Test' }),
      ).rejects.toThrow('Customer CUST_MISSING not found');
    });

    it('updateFinancialAccount — updates fields and records audit on credit limit change', async () => {
      const ctx = makeCtx();

      // Account exists
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        name: 'Old Name',
        primaryCustomerId: 'CUST_001',
        creditLimitCents: 100000,
        status: 'active',
        metadata: {},
      }]);
      // Update returns
      mockUpdateReturns([{
        id: 'BA_001',
        name: 'New Name',
        creditLimitCents: 200000,
        status: 'active',
      }]);
      // Activity log for credit limit change
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await updateFinancialAccount(ctx, {
        accountId: 'BA_001',
        name: 'New Name',
        creditLimitCents: 200000,
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('New Name');
      expect(result.creditLimitCents).toBe(200000);
      // Insert called for activity log (credit limit changed)
      expect(mockInsert).toHaveBeenCalled();
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.financial_account.updated.v1', expect.objectContaining({
        accountId: 'BA_001',
        customerId: 'CUST_001',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.financial_account_updated', 'billing_account', 'BA_001');
    });

    it('adjustLedger — creates AR transaction and updates balance (credit memo reduces)', async () => {
      const ctx = makeCtx();

      // Account exists with balance
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 50000,
        status: 'active',
      }]);
      // AR transaction insert
      mockInsertReturns([{
        id: 'ART_001',
        tenantId: TENANT_A,
        billingAccountId: 'BA_001',
        type: 'credit_memo',
        amountCents: -5000,
      }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await adjustLedger(ctx, {
        billingAccountId: 'BA_001',
        type: 'credit_memo',
        amountCents: -5000,
        notes: 'Courtesy credit',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ART_001');
      expect(result.newBalance).toBe(45000); // 50000 + (-5000)
      expect(mockUpdate).toHaveBeenCalled(); // balance updated
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.ledger_entry.posted.v1', expect.objectContaining({
        type: 'credit_memo',
        amountCents: -5000,
        newBalance: 45000,
      }));
    });

    it('adjustLedger — manual_charge increases balance', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 10000,
        status: 'active',
      }]);
      mockInsertReturns([{
        id: 'ART_002',
        tenantId: TENANT_A,
        billingAccountId: 'BA_001',
        type: 'manual_charge',
        amountCents: 7500,
      }]);
      mockInsertReturns([{ id: 'LOG_002' }]);

      const result = await adjustLedger(ctx, {
        billingAccountId: 'BA_001',
        type: 'manual_charge',
        amountCents: 7500,
        notes: 'Service fee',
      });

      expect(result.newBalance).toBe(17500); // 10000 + 7500
    });

    it('adjustLedger — writeoff type requires negative amount', async () => {
      const ctx = makeCtx();

      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 20000,
        status: 'active',
      }]);

      await expect(
        adjustLedger(ctx, {
          billingAccountId: 'BA_001',
          type: 'writeoff',
          amountCents: 5000, // positive -- should fail
        }),
      ).rejects.toThrow('Write-off amount must be negative');
    });

    it('transferBetweenAccounts — creates paired transactions and updates both balances', async () => {
      const ctx = makeCtx();

      // Source account
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        name: 'Account A',
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 50000,
        status: 'active',
      }]);
      // Destination account
      mockSelectReturns([{
        id: 'BA_002',
        tenantId: TENANT_A,
        name: 'Account B',
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 10000,
        status: 'active',
      }]);
      // Debit AR transaction on source
      mockInsertReturns([{ id: 'ART_DEBIT', type: 'adjustment', amountCents: -20000 }]);
      // Credit AR transaction on destination
      mockInsertReturns([{ id: 'ART_CREDIT', type: 'adjustment', amountCents: 20000 }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await transferBetweenAccounts(ctx, {
        fromAccountId: 'BA_001',
        toAccountId: 'BA_002',
        amountCents: 20000,
        reason: 'Balance consolidation',
      });

      expect(result).toBeDefined();
      expect(result.debitTransactionId).toBe('ART_DEBIT');
      expect(result.creditTransactionId).toBe('ART_CREDIT');
      expect(result.newFromBalance).toBe(30000); // 50000 - 20000
      expect(result.newToBalance).toBe(30000);   // 10000 + 20000
      // Both accounts updated
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.account_transfer.completed.v1', expect.objectContaining({
        fromAccountId: 'BA_001',
        toAccountId: 'BA_002',
        amountCents: 20000,
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.account_transfer', 'billing_account', 'BA_001');
    });

    it('transferBetweenAccounts — rejects same from/to account', async () => {
      const ctx = makeCtx();

      // Source account
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        name: 'Account A',
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 50000,
        status: 'active',
      }]);
      // Destination account (same ID -- validation in command)
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        name: 'Account A',
        primaryCustomerId: 'CUST_001',
        currentBalanceCents: 50000,
        status: 'active',
      }]);

      await expect(
        transferBetweenAccounts(ctx, {
          fromAccountId: 'BA_001',
          toAccountId: 'BA_001',
          amountCents: 10000,
          reason: 'Should fail',
        }),
      ).rejects.toThrow('Cannot transfer to the same account');
    });

    it('configureAutopay — sets strategy fields and records audit', async () => {
      const ctx = makeCtx();

      // Account exists
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        autoPayEnabled: false,
        metadata: {},
      }]);
      // Update returns
      mockUpdateReturns([{
        id: 'BA_001',
        autoPayEnabled: true,
        metadata: { autopayStrategy: 'full_balance' },
      }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await configureAutopay(ctx, {
        accountId: 'BA_001',
        strategy: 'full_balance',
      });

      expect(result).toBeDefined();
      expect(result.autoPayEnabled).toBe(true);
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.autopay.configured.v1', expect.objectContaining({
        accountId: 'BA_001',
        strategy: 'full_balance',
        enabled: true,
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.autopay_configured', 'billing_account', 'BA_001');
    });

    it('configureAutopay — fixed_amount requires fixedAmountCents', async () => {
      const ctx = makeCtx();

      // Account exists
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        autoPayEnabled: false,
        metadata: {},
      }]);

      await expect(
        configureAutopay(ctx, {
          accountId: 'BA_001',
          strategy: 'fixed_amount',
          // Missing fixedAmountCents
        }),
      ).rejects.toThrow('Fixed amount strategy requires a positive fixedAmountCents');
    });

    it('placeFinancialHold — sets status to hold and records audit', async () => {
      const ctx = makeCtx();

      // Account exists with active status
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        status: 'active',
      }]);
      // Update returns
      mockUpdateReturns([{
        id: 'BA_001',
        status: 'hold',
      }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await placeFinancialHold(ctx, {
        accountId: 'BA_001',
        holdType: 'hold',
        reason: 'Overdue 90+ days',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('hold');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.financial_hold.placed.v1', expect.objectContaining({
        accountId: 'BA_001',
        holdType: 'hold',
        previousStatus: 'active',
        reason: 'Overdue 90+ days',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.financial_hold_placed', 'billing_account', 'BA_001');
    });

    it('liftFinancialHold — restores status to active', async () => {
      const ctx = makeCtx();

      // Account exists with hold status
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        status: 'hold',
      }]);
      // Update returns
      mockUpdateReturns([{
        id: 'BA_001',
        status: 'active',
      }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await liftFinancialHold(ctx, {
        accountId: 'BA_001',
        reason: 'Payment received',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('active');
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.financial_hold.lifted.v1', expect.objectContaining({
        accountId: 'BA_001',
        previousStatus: 'hold',
        reason: 'Payment received',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.financial_hold_lifted', 'billing_account', 'BA_001');
    });

    it('liftFinancialHold — throws when status is already active', async () => {
      const ctx = makeCtx();

      // Account exists with active status (not on hold)
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        status: 'active',
      }]);

      await expect(
        liftFinancialHold(ctx, {
          accountId: 'BA_001',
          reason: 'Should fail',
        }),
      ).rejects.toThrow('Account is not on hold or frozen');
    });

    it('updateCreditLimit — updates limit and records audit with before/after', async () => {
      const ctx = makeCtx();

      // Account exists
      mockSelectReturns([{
        id: 'BA_001',
        tenantId: TENANT_A,
        primaryCustomerId: 'CUST_001',
        creditLimitCents: 100000,
        currentBalanceCents: 30000,
      }]);
      // Update returns
      mockUpdateReturns([{
        id: 'BA_001',
        creditLimitCents: 250000,
      }]);
      // Activity log
      mockInsertReturns([{ id: 'LOG_001' }]);

      const result = await updateCreditLimit(ctx, {
        accountId: 'BA_001',
        newCreditLimitCents: 250000,
        reason: 'Good payment history',
        approvedBy: 'manager_001',
      });

      expect(result).toBeDefined();
      expect(result.creditLimitCents).toBe(250000);
      expect(mockBuildEvent).toHaveBeenCalledWith(ctx, 'customer.credit_limit.changed.v1', expect.objectContaining({
        accountId: 'BA_001',
        previousCreditLimitCents: 100000,
        newCreditLimitCents: 250000,
        reason: 'Good payment history',
        approvedBy: 'manager_001',
      }));
      expect(mockAuditLog).toHaveBeenCalledWith(ctx, 'customer.credit_limit_changed', 'billing_account', 'BA_001');
    });

    it('recordCustomerAuditEntry — inserts audit record', async () => {
      const ctx = makeCtx();

      // Customer exists
      mockSelectReturns([{ id: 'CUST_001' }]);
      // Insert returns audit entry
      mockInsertReturns([{
        id: 'AUDIT_001',
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        activityType: 'credit_limit_changed',
        title: 'credit_limit_changed',
        details: 'Manager approved',
        metadata: {
          beforeJson: { creditLimitCents: 100000 },
          afterJson: { creditLimitCents: 200000 },
          actorUserId: USER_A,
        },
        createdBy: USER_A,
      }]);

      const result = await recordCustomerAuditEntry(ctx, {
        customerId: 'CUST_001',
        actionType: 'credit_limit_changed',
        beforeJson: { creditLimitCents: 100000 },
        afterJson: { creditLimitCents: 200000 },
        reason: 'Manager approved',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('AUDIT_001');
      expect(result.activityType).toBe('credit_limit_changed');
    });
  });

  // ── Section 3: Query Tests ────────────────────────────────────

  describe('Queries', () => {
    // ── getFinancialAccountsSummary ──────────────────────────────

    it('getFinancialAccountsSummary — returns accounts with computed utilization', async () => {
      mockSelectReturns([{
        id: 'BA_001',
        name: 'House Account',
        accountType: 'house',
        status: 'active',
        currentBalanceCents: '25000',
        creditLimitCents: '100000',
        autopayStrategy: 'full_balance',
        currency: 'USD',
        collectionStatus: 'normal',
      }]);

      const result = await getFinancialAccountsSummary({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]!.id).toBe('BA_001');
      expect(result.accounts[0]!.currentBalanceCents).toBe(25000);
      expect(result.accounts[0]!.creditLimitCents).toBe('100000');
      expect(result.accounts[0]!.creditUtilization).toBe(25); // 25000/100000 * 100
      expect(result.accounts[0]!.autopayEnabled).toBe(true);
      expect(result.totalBalanceCents).toBe(25000);
      expect(result.totalCreditLimitCents).toBe(100000);
      expect(result.overallUtilization).toBe(25);
    });

    it('getFinancialAccountsSummary — aggregates totals across multiple accounts', async () => {
      mockSelectReturns([
        {
          id: 'BA_001',
          name: 'Account A',
          accountType: 'house',
          status: 'active',
          currentBalanceCents: '30000',
          creditLimitCents: '100000',
          autopayStrategy: null,
          currency: 'USD',
          collectionStatus: 'normal',
        },
        {
          id: 'BA_002',
          name: 'Account B',
          accountType: 'corporate',
          status: 'active',
          currentBalanceCents: '20000',
          creditLimitCents: '100000',
          autopayStrategy: 'minimum_due',
          currency: 'USD',
          collectionStatus: 'normal',
        },
      ]);

      const result = await getFinancialAccountsSummary({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.accounts).toHaveLength(2);
      expect(result.totalBalanceCents).toBe(50000);  // 30000 + 20000
      expect(result.totalCreditLimitCents).toBe(200000); // 100000 + 100000
      expect(result.overallUtilization).toBe(25); // 50000/200000 * 100
    });

    it('getFinancialAccountsSummary — handles zero credit limit (0% utilization)', async () => {
      mockSelectReturns([{
        id: 'BA_003',
        name: 'No Limit Account',
        accountType: 'house',
        status: 'active',
        currentBalanceCents: '15000',
        creditLimitCents: null,
        autopayStrategy: null,
        currency: 'USD',
        collectionStatus: 'normal',
      }]);

      const result = await getFinancialAccountsSummary({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]!.creditUtilization).toBe(0); // no limit = 0% utilization
      expect(result.accounts[0]!.creditLimitCents).toBeNull();
      expect(result.overallUtilization).toBe(0);
    });

    // ── getUnifiedLedger ──────────────────────────────────────────

    it('getUnifiedLedger — returns paginated transactions', async () => {
      const createdAt = new Date('2026-02-15T10:00:00Z');
      mockSelectReturns([
        {
          id: 'ART_001',
          type: 'charge',
          amountCents: 5000,
          notes: 'Greens fee',
          status: 'posted',
          sourceModule: 'pos',
          businessDate: '2026-02-15',
          locationId: 'loc_001',
          departmentId: null,
          createdAt,
          accountId: 'BA_001',
          accountName: 'House Account',
          metaJson: null,
        },
        {
          id: 'ART_002',
          type: 'payment',
          amountCents: -5000,
          notes: 'Cash payment',
          status: 'posted',
          sourceModule: null,
          businessDate: '2026-02-16',
          locationId: 'loc_001',
          departmentId: null,
          createdAt: new Date('2026-02-16T10:00:00Z'),
          accountId: 'BA_001',
          accountName: 'House Account',
          metaJson: null,
        },
      ]);

      const result = await getUnifiedLedger({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]!.id).toBe('ART_001');
      expect(result.transactions[0]!.type).toBe('charge');
      expect(result.transactions[0]!.amountCents).toBe(5000);
      expect(result.transactions[0]!.accountName).toBe('House Account');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('getUnifiedLedger — filters by accountId', async () => {
      mockSelectReturns([{
        id: 'ART_003',
        type: 'charge',
        amountCents: 8000,
        notes: 'Cart rental',
        status: 'posted',
        sourceModule: 'pos',
        businessDate: '2026-02-17',
        locationId: 'loc_001',
        departmentId: null,
        createdAt: new Date('2026-02-17T10:00:00Z'),
        accountId: 'BA_002',
        accountName: 'Corporate Account',
        metaJson: null,
      }]);

      const result = await getUnifiedLedger({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        accountId: 'BA_002',
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]!.accountId).toBe('BA_002');
    });

    it('getUnifiedLedger — filters by date range', async () => {
      mockSelectReturns([{
        id: 'ART_004',
        type: 'charge',
        amountCents: 3000,
        notes: 'Lunch',
        status: 'posted',
        sourceModule: 'pos',
        businessDate: '2026-02-10',
        locationId: 'loc_001',
        departmentId: null,
        createdAt: new Date('2026-02-10T12:00:00Z'),
        accountId: 'BA_001',
        accountName: 'House Account',
        metaJson: null,
      }]);

      const result = await getUnifiedLedger({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]!.id).toBe('ART_004');
    });

    it('getUnifiedLedger — filters by type', async () => {
      mockSelectReturns([{
        id: 'ART_005',
        type: 'payment',
        amountCents: -10000,
        notes: 'Monthly payment',
        status: 'posted',
        sourceModule: null,
        businessDate: null,
        locationId: null,
        departmentId: null,
        createdAt: new Date('2026-02-18T09:00:00Z'),
        accountId: 'BA_001',
        accountName: 'House Account',
        metaJson: null,
      }]);

      const result = await getUnifiedLedger({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        type: 'payment',
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]!.type).toBe('payment');
    });

    it('getUnifiedLedger — cursor pagination works', async () => {
      // Return limit+1 rows to trigger hasMore
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `ART_${String(i).padStart(3, '0')}`,
        type: 'charge',
        amountCents: 1000,
        notes: `Item ${i}`,
        status: 'posted',
        sourceModule: 'pos',
        businessDate: '2026-02-20',
        locationId: 'loc_001',
        departmentId: null,
        createdAt: new Date(`2026-02-20T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
        accountId: 'BA_001',
        accountName: 'House Account',
        metaJson: null,
      }));
      mockSelectReturns(rows);

      const result = await getUnifiedLedger({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        limit: 50,
      });

      expect(result.transactions).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('ART_049');
    });

    // ── getCustomerAgingSummary ──────────────────────────────────

    it('getCustomerAgingSummary — computes aging buckets correctly', async () => {
      // Billing accounts
      mockSelectReturns([
        { id: 'BA_001', name: 'House Account' },
      ]);
      // Aging rows grouped by bucket
      mockSelectReturns([
        { billingAccountId: 'BA_001', bucket: 'current', chargeCount: 2, totalOutstanding: 10000 },
        { billingAccountId: 'BA_001', bucket: '1-30', chargeCount: 1, totalOutstanding: 5000 },
        { billingAccountId: 'BA_001', bucket: '61-90', chargeCount: 1, totalOutstanding: 3000 },
      ]);

      const result = await getCustomerAgingSummary({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.buckets).toHaveLength(5);
      expect(result.buckets[0]!.label).toBe('Current');
      expect(result.buckets[0]!.totalCents).toBe(10000);
      expect(result.buckets[0]!.count).toBe(2);
      expect(result.buckets[1]!.label).toBe('1-30 Days');
      expect(result.buckets[1]!.totalCents).toBe(5000);
      expect(result.buckets[3]!.label).toBe('61-90 Days');
      expect(result.buckets[3]!.totalCents).toBe(3000);
      // Empty buckets
      expect(result.buckets[2]!.totalCents).toBe(0); // 31-60
      expect(result.buckets[4]!.totalCents).toBe(0); // 90+
      expect(result.totalOutstandingCents).toBe(18000);
      expect(result.byAccount).toHaveLength(1);
      expect(result.byAccount[0]!.accountId).toBe('BA_001');
      expect(result.byAccount[0]!.accountName).toBe('House Account');
      expect(result.byAccount[0]!.current).toBe(10000);
      expect(result.byAccount[0]!.days1to30).toBe(5000);
      expect(result.byAccount[0]!.days61to90).toBe(3000);
      expect(result.byAccount[0]!.totalCents).toBe(18000);
    });

    it('getCustomerAgingSummary — handles no outstanding charges', async () => {
      // No billing accounts for customer
      mockSelectReturns([]);

      const result = await getCustomerAgingSummary({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.buckets).toHaveLength(5);
      expect(result.buckets.every(b => b.totalCents === 0)).toBe(true);
      expect(result.buckets.every(b => b.count === 0)).toBe(true);
      expect(result.byAccount).toHaveLength(0);
      expect(result.totalOutstandingCents).toBe(0);
    });

    // ── getCustomerAuditTrail ────────────────────────────────────

    it('getCustomerAuditTrail — returns audit entries', async () => {
      const occurredAt = new Date('2026-02-20T14:00:00Z');
      mockSelectReturns([
        {
          id: 'AUDIT_001',
          actorUserId: USER_A,
          actionType: 'credit_limit_changed',
          beforeJson: { creditLimitCents: 100000 },
          afterJson: { creditLimitCents: 200000 },
          reason: 'Annual review',
          occurredAt,
        },
        {
          id: 'AUDIT_002',
          actorUserId: USER_A,
          actionType: 'financial_hold_placed',
          beforeJson: { status: 'active' },
          afterJson: { status: 'hold' },
          reason: null,
          occurredAt: new Date('2026-02-19T10:00:00Z'),
        },
      ]);

      const result = await getCustomerAuditTrail({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
      });

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!.id).toBe('AUDIT_001');
      expect(result.entries[0]!.actionType).toBe('credit_limit_changed');
      expect(result.entries[0]!.beforeJson).toEqual({ creditLimitCents: 100000 });
      expect(result.entries[0]!.afterJson).toEqual({ creditLimitCents: 200000 });
      expect(result.entries[0]!.reason).toBe('Annual review');
      expect(result.entries[0]!.occurredAt).toBe('2026-02-20T14:00:00.000Z');
      expect(result.entries[1]!.reason).toBeNull();
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('getCustomerAuditTrail — filters by actionType', async () => {
      mockSelectReturns([
        {
          id: 'AUDIT_003',
          actorUserId: USER_A,
          actionType: 'financial_hold_placed',
          beforeJson: null,
          afterJson: { status: 'hold' },
          reason: 'Overdue',
          occurredAt: new Date('2026-02-18T10:00:00Z'),
        },
      ]);

      const result = await getCustomerAuditTrail({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        actionType: 'financial_hold_placed',
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.actionType).toBe('financial_hold_placed');
    });

    it('getCustomerAuditTrail — cursor pagination works', async () => {
      // Return limit+1 to trigger hasMore
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `AUDIT_${String(i).padStart(3, '0')}`,
        actorUserId: USER_A,
        actionType: 'system_event',
        beforeJson: null,
        afterJson: null,
        reason: null,
        occurredAt: new Date(`2026-02-20T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
      }));
      mockSelectReturns(rows);

      const result = await getCustomerAuditTrail({
        tenantId: TENANT_A,
        customerId: 'CUST_001',
        limit: 50,
      });

      expect(result.entries).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('AUDIT_049');
    });
  });
});
