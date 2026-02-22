import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = 'tenant_001';

// ── Mock Drizzle ────────────────────────────────────────────────────

const mockSelectReturns = vi.fn();
const mockInsertReturns = vi.fn();
const mockUpdateReturns = vi.fn();

const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockLeftJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockInsert = vi.fn();

const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdate = vi.fn();

function wireChain() {
  // mockOrderBy returns an array-like result from mockSelectReturns,
  // augmented with a .limit() method that returns the same array.
  // This supports:
  //   - Terminal use: await .orderBy()  --> returns the array
  //   - Chained use:  .orderBy().limit() --> .limit() returns the same array
  mockOrderBy.mockImplementation(() => {
    const result = mockSelectReturns();
    if (Array.isArray(result)) {
      (result as any).limit = () => result;
    }
    return result;
  });

  // mockLimit for chains that skip orderBy: where().limit()
  mockLimit.mockImplementation(() => mockSelectReturns());

  mockWhere.mockImplementation(() => ({ orderBy: mockOrderBy, limit: mockLimit }));
  mockLeftJoin.mockImplementation(() => ({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit }));
  mockFrom.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    leftJoin: mockLeftJoin,
  }));
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
  mockInsert.mockImplementation(() => ({ values: mockValues }));
  mockValues.mockImplementation(() => ({
    returning: mockReturning,
    onConflictDoUpdate: vi.fn(() => ({ returning: mockReturning })),
  }));
  mockReturning.mockImplementation(() => mockInsertReturns());
  mockUpdate.mockImplementation(() => ({ set: mockSet }));
  mockSet.mockImplementation(() => ({ where: mockUpdateWhere }));
  mockUpdateWhere.mockImplementation(() => ({ returning: mockReturning }));
}

// Initial wiring
wireChain();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: vi.fn().mockResolvedValue([]),
    }),
  ),
  membershipAccounts: {
    id: 'id', tenantId: 'tenant_id', accountNumber: 'account_number',
    status: 'status', startDate: 'start_date', endDate: 'end_date',
    primaryMemberId: 'primary_member_id', billingEmail: 'billing_email',
    billingAddressJson: 'billing_address_json', statementDayOfMonth: 'statement_day_of_month',
    paymentTermsDays: 'payment_terms_days', autopayEnabled: 'autopay_enabled',
    creditLimitCents: 'credit_limit_cents', holdCharging: 'hold_charging',
    billingAccountId: 'billing_account_id', customerId: 'customer_id',
    notes: 'notes', metadata: 'metadata', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipMembers: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    customerId: 'customer_id', role: 'role', chargePrivileges: 'charge_privileges',
    memberNumber: 'member_number', status: 'status', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipClasses: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    className: 'class_name', effectiveDate: 'effective_date', expirationDate: 'expiration_date',
    billedThroughDate: 'billed_through_date', isArchived: 'is_archived',
    metadata: 'metadata', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipBillingItems: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    classId: 'class_id', description: 'description', amountCents: 'amount_cents',
    discountCents: 'discount_cents', frequency: 'frequency', taxRateId: 'tax_rate_id',
    glRevenueAccountId: 'gl_revenue_account_id', glDeferredRevenueAccountId: 'gl_deferred_revenue_account_id',
    prorationEnabled: 'proration_enabled', seasonalJson: 'seasonal_json',
    isSubMemberItem: 'is_sub_member_item', isActive: 'is_active',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipAuthorizedUsers: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    name: 'name', relationship: 'relationship', privilegesJson: 'privileges_json',
    effectiveDate: 'effective_date', expirationDate: 'expiration_date',
    status: 'status', createdAt: 'created_at', updatedAt: 'updated_at',
  },
  membershipAccountingSettings: {
    id: 'id', tenantId: 'tenant_id', clubModel: 'club_model',
    recognitionPolicy: 'recognition_policy',
    defaultDuesRevenueAccountId: 'default_dues_revenue_account_id',
    defaultDeferredRevenueAccountId: 'default_deferred_revenue_account_id',
    defaultInitiationRevenueAccountId: 'default_initiation_revenue_account_id',
    defaultNotesReceivableAccountId: 'default_notes_receivable_account_id',
    defaultInterestIncomeAccountId: 'default_interest_income_account_id',
    defaultCapitalContributionAccountId: 'default_capital_contribution_account_id',
    defaultBadDebtAccountId: 'default_bad_debt_account_id',
    defaultLateFeeAccountId: 'default_late_fee_account_id',
    defaultMinimumRevenueAccountId: 'default_minimum_revenue_account_id',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  customers: { id: 'id', tenantId: 'tenant_id', displayName: 'display_name' },
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (tx: any) => any) =>
    fn({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    }).then((r: any) => r.result),
  ),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, type, payload) => ({ type, payload })),
}));

const mockAuditLog = vi.fn();
vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ulid_test_001'),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  lt: vi.fn((a, b) => ({ op: 'lt', a, b })),
  desc: vi.fn((col) => ({ op: 'desc', col })),
  asc: vi.fn((col) => ({ op: 'asc', col })),
  or: vi.fn((...args: any[]) => ({ op: 'or', args })),
  ilike: vi.fn((col, val) => ({ op: 'ilike', col, val })),
  sql: Object.assign(vi.fn(), { raw: vi.fn(), join: vi.fn() }),
  count: vi.fn(() => 'count'),
}));

// ── Imports ─────────────────────────────────────────────────────────

import {
  createMembershipAccountSchema,
  addMembershipMemberSchema,
  addBillingItemSchema,
  updateMembershipAccountingSettingsSchema,
} from '../validation';
import { createMembershipAccount } from '../commands/create-membership-account';
import { updateMembershipAccount } from '../commands/update-membership-account';
import { addMembershipMember } from '../commands/add-membership-member';
import { updateMembershipMember } from '../commands/update-membership-member';
import { removeMembershipMember } from '../commands/remove-membership-member';
import { addMembershipClass } from '../commands/add-membership-class';
import { addBillingItem } from '../commands/add-billing-item';
import { updateBillingItem } from '../commands/update-billing-item';
import { addAuthorizedUser } from '../commands/add-authorized-user';
import { updateAuthorizedUser } from '../commands/update-authorized-user';
import { updateMembershipAccountingSettings } from '../commands/update-membership-accounting-settings';
import { listMembershipAccounts } from '../queries/list-membership-accounts';
import { getMembershipAccount } from '../queries/get-membership-account';
import { getMembershipAccountingSettings } from '../queries/get-membership-accounting-settings';

// ── Helpers ─────────────────────────────────────────────────────────

function makeCtx() {
  return {
    tenantId: TENANT_A,
    user: { id: 'user_001', email: 'test@example.com', role: 'owner' },
    requestId: 'req_001',
  } as any;
}

function resetMocks() {
  vi.clearAllMocks();
  mockSelectReturns.mockReturnValue([]);
  mockInsertReturns.mockReturnValue([]);
  mockUpdateReturns.mockReturnValue([]);
  wireChain();
}

function makeAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acct_001',
    tenantId: TENANT_A,
    accountNumber: 'MEM-001',
    status: 'active',
    startDate: '2025-01-01',
    endDate: null,
    primaryMemberId: 'cust_001',
    billingEmail: 'billing@test.com',
    billingAddressJson: null,
    statementDayOfMonth: 1,
    paymentTermsDays: 30,
    autopayEnabled: false,
    creditLimitCents: 0,
    holdCharging: false,
    billingAccountId: null,
    customerId: 'cust_001',
    notes: null,
    metadata: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Validation Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 5 — Validation', () => {
  describe('createMembershipAccountSchema', () => {
    it('valid input passes', () => {
      const result = createMembershipAccountSchema.safeParse({
        accountNumber: 'MEM-001',
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('missing accountNumber fails', () => {
      const result = createMembershipAccountSchema.safeParse({
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('missing primaryMemberId fails', () => {
      const result = createMembershipAccountSchema.safeParse({
        accountNumber: 'MEM-001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('missing startDate fails', () => {
      const result = createMembershipAccountSchema.safeParse({
        accountNumber: 'MEM-001',
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
      });
      expect(result.success).toBe(false);
    });

    it('defaults are applied (statementDayOfMonth=1, paymentTermsDays=30, autopayEnabled=false)', () => {
      const result = createMembershipAccountSchema.parse({
        accountNumber: 'MEM-001',
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });
      expect(result.statementDayOfMonth).toBe(1);
      expect(result.paymentTermsDays).toBe(30);
      expect(result.autopayEnabled).toBe(false);
    });

    it('empty accountNumber fails', () => {
      const result = createMembershipAccountSchema.safeParse({
        accountNumber: '',
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addMembershipMemberSchema', () => {
    it('valid input passes', () => {
      const result = addMembershipMemberSchema.safeParse({
        membershipAccountId: 'acct_001',
        customerId: 'cust_002',
      });
      expect(result.success).toBe(true);
    });

    it('missing customerId fails', () => {
      const result = addMembershipMemberSchema.safeParse({
        membershipAccountId: 'acct_001',
      });
      expect(result.success).toBe(false);
    });

    it('role defaults to dependent', () => {
      const result = addMembershipMemberSchema.parse({
        membershipAccountId: 'acct_001',
        customerId: 'cust_002',
      });
      expect(result.role).toBe('dependent');
    });
  });

  describe('addBillingItemSchema', () => {
    it('valid input passes', () => {
      const result = addBillingItemSchema.safeParse({
        membershipAccountId: 'acct_001',
        description: 'Monthly Dues',
        amountCents: 25000,
      });
      expect(result.success).toBe(true);
    });

    it('missing description fails', () => {
      const result = addBillingItemSchema.safeParse({
        membershipAccountId: 'acct_001',
        amountCents: 25000,
      });
      expect(result.success).toBe(false);
    });

    it('frequency defaults to monthly', () => {
      const result = addBillingItemSchema.parse({
        membershipAccountId: 'acct_001',
        description: 'Monthly Dues',
        amountCents: 25000,
      });
      expect(result.frequency).toBe('monthly');
    });
  });

  describe('updateMembershipAccountingSettingsSchema', () => {
    it('valid input passes', () => {
      const result = updateMembershipAccountingSettingsSchema.safeParse({
        clubModel: 'member_owned',
        defaultDuesRevenueAccountId: 'gl_001',
      });
      expect(result.success).toBe(true);
    });

    it('empty object passes (all fields optional)', () => {
      const result = updateMembershipAccountingSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Command Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 5 — Commands', () => {
  beforeEach(resetMocks);

  describe('createMembershipAccount', () => {
    it('creates account and returns it', async () => {
      const created = makeAccountRow();
      // First select: check duplicate account number -> empty (no duplicate)
      mockSelectReturns.mockReturnValueOnce([]);
      // Insert returns the created row
      mockInsertReturns.mockReturnValueOnce([created]);

      const result = await createMembershipAccount(makeCtx(), {
        accountNumber: 'MEM-001',
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('acct_001');
    });

    it('calls auditLog', async () => {
      const created = makeAccountRow();
      mockSelectReturns.mockReturnValueOnce([]);
      mockInsertReturns.mockReturnValueOnce([created]);

      await createMembershipAccount(makeCtx(), {
        accountNumber: 'MEM-001',
        primaryMemberId: 'cust_001',
        customerId: 'cust_001',
        startDate: '2025-01-01',
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
        'membership.account.created',
        'membership_account',
        'acct_001',
      );
    });

    it('throws ConflictError when account number already exists', async () => {
      mockSelectReturns.mockReturnValueOnce([{ id: 'existing_001' }]);

      await expect(
        createMembershipAccount(makeCtx(), {
          accountNumber: 'MEM-001',
          primaryMemberId: 'cust_001',
          customerId: 'cust_001',
          startDate: '2025-01-01',
        }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('updateMembershipAccount', () => {
    it('updates account fields', async () => {
      const existing = makeAccountRow();
      const updated = makeAccountRow({ billingEmail: 'new@test.com' });

      mockSelectReturns.mockReturnValueOnce([existing]);
      mockInsertReturns.mockReturnValueOnce([updated]); // returning() for update

      const result = await updateMembershipAccount(makeCtx(), {
        accountId: 'acct_001',
        billingEmail: 'new@test.com',
      });

      expect(result).toBeDefined();
      expect(mockSet).toHaveBeenCalled();
    });

    it('throws NotFoundError when account not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        updateMembershipAccount(makeCtx(), { accountId: 'nonexistent' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('addMembershipMember', () => {
    it('adds member to account', async () => {
      const account = { id: 'acct_001' };
      const member = {
        id: 'mem_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        customerId: 'cust_002', role: 'dependent', status: 'active',
      };

      mockSelectReturns.mockReturnValueOnce([account]);
      mockInsertReturns.mockReturnValueOnce([member]);

      const result = await addMembershipMember(makeCtx(), {
        membershipAccountId: 'acct_001',
        customerId: 'cust_002',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('mem_001');
    });

    it('throws NotFoundError when account not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        addMembershipMember(makeCtx(), {
          membershipAccountId: 'nonexistent',
          customerId: 'cust_002',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('updateMembershipMember', () => {
    it('updates member role and status', async () => {
      const existing = {
        id: 'mem_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        customerId: 'cust_002', role: 'dependent', status: 'active',
      };
      const updated = { ...existing, role: 'spouse', status: 'suspended' };

      mockSelectReturns.mockReturnValueOnce([existing]);
      mockInsertReturns.mockReturnValueOnce([updated]);

      const result = await updateMembershipMember(makeCtx(), {
        memberId: 'mem_001',
        role: 'spouse',
        status: 'suspended',
      });

      expect(result).toBeDefined();
      expect(mockSet).toHaveBeenCalled();
    });

    it('throws NotFoundError when member not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        updateMembershipMember(makeCtx(), { memberId: 'nonexistent' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('removeMembershipMember', () => {
    it('sets status to removed', async () => {
      const existing = {
        id: 'mem_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        customerId: 'cust_002', role: 'dependent', status: 'active',
      };
      const updated = { ...existing, status: 'removed' };

      mockSelectReturns.mockReturnValueOnce([existing]);
      mockInsertReturns.mockReturnValueOnce([updated]);

      const result = await removeMembershipMember(makeCtx(), { memberId: 'mem_001' });

      expect(result).toBeDefined();
      expect(result.status).toBe('removed');
    });

    it('throws NotFoundError when member not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        removeMembershipMember(makeCtx(), { memberId: 'nonexistent' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('addMembershipClass', () => {
    it('adds class to account', async () => {
      const account = { id: 'acct_001' };
      const cls = {
        id: 'cls_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        className: 'Gold', effectiveDate: '2025-01-01',
      };

      mockSelectReturns.mockReturnValueOnce([account]);
      mockInsertReturns.mockReturnValueOnce([cls]);

      const result = await addMembershipClass(makeCtx(), {
        membershipAccountId: 'acct_001',
        className: 'Gold',
        effectiveDate: '2025-01-01',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('cls_001');
    });

    it('throws NotFoundError when account not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        addMembershipClass(makeCtx(), {
          membershipAccountId: 'nonexistent',
          className: 'Gold',
          effectiveDate: '2025-01-01',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('addBillingItem', () => {
    it('adds billing item', async () => {
      const account = { id: 'acct_001' };
      const item = {
        id: 'bi_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        description: 'Monthly Dues', amountCents: 25000, frequency: 'monthly',
      };

      mockSelectReturns.mockReturnValueOnce([account]);
      mockInsertReturns.mockReturnValueOnce([item]);

      const result = await addBillingItem(makeCtx(), {
        membershipAccountId: 'acct_001',
        description: 'Monthly Dues',
        amountCents: 25000,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('bi_001');
    });

    it('throws NotFoundError when account not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        addBillingItem(makeCtx(), {
          membershipAccountId: 'nonexistent',
          description: 'Monthly Dues',
          amountCents: 25000,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('updateBillingItem', () => {
    it('updates billing item', async () => {
      const existing = {
        id: 'bi_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        description: 'Monthly Dues', amountCents: 25000, frequency: 'monthly',
      };
      const updated = { ...existing, amountCents: 30000 };

      mockSelectReturns.mockReturnValueOnce([existing]);
      mockInsertReturns.mockReturnValueOnce([updated]);

      const result = await updateBillingItem(makeCtx(), {
        billingItemId: 'bi_001',
        amountCents: 30000,
      });

      expect(result).toBeDefined();
      expect(mockSet).toHaveBeenCalled();
    });

    it('throws NotFoundError when item not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        updateBillingItem(makeCtx(), {
          billingItemId: 'nonexistent',
          amountCents: 30000,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('addAuthorizedUser', () => {
    it('adds authorized user', async () => {
      const account = { id: 'acct_001' };
      const user = {
        id: 'au_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        name: 'Jane Doe', status: 'active',
      };

      mockSelectReturns.mockReturnValueOnce([account]);
      mockInsertReturns.mockReturnValueOnce([user]);

      const result = await addAuthorizedUser(makeCtx(), {
        membershipAccountId: 'acct_001',
        name: 'Jane Doe',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('au_001');
    });

    it('throws NotFoundError when account not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        addAuthorizedUser(makeCtx(), {
          membershipAccountId: 'nonexistent',
          name: 'Jane Doe',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('updateAuthorizedUser', () => {
    it('updates authorized user', async () => {
      const existing = {
        id: 'au_001', tenantId: TENANT_A, membershipAccountId: 'acct_001',
        name: 'Jane Doe', status: 'active',
      };
      const updated = { ...existing, name: 'Jane Smith', status: 'revoked' };

      mockSelectReturns.mockReturnValueOnce([existing]);
      mockInsertReturns.mockReturnValueOnce([updated]);

      const result = await updateAuthorizedUser(makeCtx(), {
        authorizedUserId: 'au_001',
        name: 'Jane Smith',
        status: 'revoked',
      });

      expect(result).toBeDefined();
      expect(mockSet).toHaveBeenCalled();
    });

    it('throws NotFoundError when user not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        updateAuthorizedUser(makeCtx(), {
          authorizedUserId: 'nonexistent',
          name: 'Unknown',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('updateMembershipAccountingSettings', () => {
    it('upserts settings when existing', async () => {
      const existing = {
        id: 'mas_001', tenantId: TENANT_A, clubModel: 'for_profit',
      };
      const updated = { ...existing, clubModel: 'member_owned' };

      mockSelectReturns.mockReturnValueOnce([existing]);
      mockInsertReturns.mockReturnValueOnce([updated]);

      const result = await updateMembershipAccountingSettings(makeCtx(), {
        clubModel: 'member_owned',
      });

      expect(result).toBeDefined();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('inserts settings when none exist', async () => {
      const created = {
        id: 'mas_001', tenantId: TENANT_A, clubModel: 'member_owned',
      };

      // No existing row -> empty select
      mockSelectReturns.mockReturnValueOnce([]);
      // Then inserts
      mockInsertReturns.mockReturnValueOnce([created]);

      const result = await updateMembershipAccountingSettings(makeCtx(), {
        clubModel: 'member_owned',
      });

      expect(result).toBeDefined();
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Query Tests
// ═══════════════════════════════════════════════════════════════════

describe('Session 5 — Queries', () => {
  beforeEach(resetMocks);

  describe('listMembershipAccounts', () => {
    it('returns paginated accounts', async () => {
      const row = {
        id: 'acct_001',
        accountNumber: 'MEM-001',
        status: 'active',
        startDate: '2025-01-01',
        endDate: null,
        primaryMemberId: 'cust_001',
        primaryMemberName: 'John Doe',
        autopayEnabled: false,
        creditLimitCents: 0,
        holdCharging: false,
        createdAt: new Date('2025-01-01'),
      };

      // The select with leftJoin resolves through the mock chain
      mockSelectReturns.mockReturnValueOnce([row]);

      const result = await listMembershipAccounts({ tenantId: TENANT_A });

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]!.id).toBe('acct_001');
      expect(result.accounts[0]!.accountNumber).toBe('MEM-001');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('filters by status', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await listMembershipAccounts({ tenantId: TENANT_A, status: 'suspended' });

      // Verify that where was called (status filter applied)
      expect(mockWhere).toHaveBeenCalled();
    });

    it('returns empty for no results', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await listMembershipAccounts({ tenantId: TENANT_A });

      expect(result.accounts).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('supports cursor pagination', async () => {
      // Return limit+1 rows to trigger hasMore
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `acct_${String(i).padStart(3, '0')}`,
        accountNumber: `MEM-${String(i).padStart(3, '0')}`,
        status: 'active',
        startDate: '2025-01-01',
        endDate: null,
        primaryMemberId: 'cust_001',
        primaryMemberName: 'John Doe',
        autopayEnabled: false,
        creditLimitCents: 0,
        holdCharging: false,
        createdAt: new Date('2025-01-01'),
      }));

      mockSelectReturns.mockReturnValueOnce(rows);

      const result = await listMembershipAccounts({ tenantId: TENANT_A });

      expect(result.accounts).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).not.toBeNull();
    });

    it('filters by account number via search', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await listMembershipAccounts({ tenantId: TENANT_A, search: 'MEM-001' });

      // Search filter was applied to where clause
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('getMembershipAccount', () => {
    it('returns account with members, classes, billing items, authorized users', async () => {
      const accountRow = {
        id: 'acct_001',
        accountNumber: 'MEM-001',
        status: 'active',
        startDate: '2025-01-01',
        endDate: null,
        primaryMemberId: 'cust_001',
        primaryMemberName: 'John Doe',
        billingEmail: 'billing@test.com',
        billingAddressJson: null,
        statementDayOfMonth: 1,
        paymentTermsDays: 30,
        autopayEnabled: false,
        creditLimitCents: 0,
        holdCharging: false,
        billingAccountId: null,
        customerId: 'cust_001',
        notes: null,
        metadata: null,
        createdAt: new Date('2025-01-01'),
      };

      const memberRow = {
        id: 'mem_001',
        customerId: 'cust_002',
        customerName: 'Jane Doe',
        role: 'spouse',
        memberNumber: 'MN-002',
        status: 'active',
        chargePrivileges: null,
      };

      const classRow = {
        id: 'cls_001',
        className: 'Gold',
        effectiveDate: '2025-01-01',
        expirationDate: null,
        billedThroughDate: null,
        isArchived: false,
      };

      const billingItemRow = {
        id: 'bi_001',
        description: 'Monthly Dues',
        amountCents: 25000,
        discountCents: 0,
        frequency: 'monthly',
        isActive: true,
        isSubMemberItem: false,
      };

      const authUserRow = {
        id: 'au_001',
        name: 'Guest User',
        relationship: 'friend',
        status: 'active',
        effectiveDate: '2025-01-01',
        expirationDate: null,
      };

      // First call: fetch the account (with leftJoin)
      mockSelectReturns.mockReturnValueOnce([accountRow]);
      // Promise.all calls 4 sub-resource selects:
      // The leftJoin mock chain produces calls to mockLimit -> mockSelectReturns
      // Members (leftJoin -> where -> orderBy -> limit)
      mockSelectReturns.mockReturnValueOnce([memberRow]);
      // Classes (where -> orderBy -> limit)
      mockSelectReturns.mockReturnValueOnce([classRow]);
      // Billing items (where -> orderBy -> limit)
      mockSelectReturns.mockReturnValueOnce([billingItemRow]);
      // Authorized users (where -> orderBy -> limit)
      mockSelectReturns.mockReturnValueOnce([authUserRow]);

      const result = await getMembershipAccount({
        tenantId: TENANT_A,
        accountId: 'acct_001',
      });

      expect(result.id).toBe('acct_001');
      expect(result.accountNumber).toBe('MEM-001');
      expect(result.members).toHaveLength(1);
      expect(result.members[0]!.id).toBe('mem_001');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0]!.className).toBe('Gold');
      expect(result.billingItems).toHaveLength(1);
      expect(result.billingItems[0]!.description).toBe('Monthly Dues');
      expect(result.authorizedUsers).toHaveLength(1);
      expect(result.authorizedUsers[0]!.name).toBe('Guest User');
    });

    it('throws NotFoundError when not found', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      await expect(
        getMembershipAccount({ tenantId: TENANT_A, accountId: 'nonexistent' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('getMembershipAccountingSettings', () => {
    it('returns settings', async () => {
      const settingsRow = {
        clubModel: 'member_owned',
        recognitionPolicy: null,
        defaultDuesRevenueAccountId: 'gl_001',
        defaultDeferredRevenueAccountId: null,
        defaultInitiationRevenueAccountId: null,
        defaultNotesReceivableAccountId: null,
        defaultInterestIncomeAccountId: null,
        defaultCapitalContributionAccountId: null,
        defaultBadDebtAccountId: null,
        defaultLateFeeAccountId: null,
        defaultMinimumRevenueAccountId: null,
      };

      mockSelectReturns.mockReturnValueOnce([settingsRow]);

      const result = await getMembershipAccountingSettings({ tenantId: TENANT_A });

      expect(result).not.toBeNull();
      expect(result!.clubModel).toBe('member_owned');
      expect(result!.defaultDuesRevenueAccountId).toBe('gl_001');
    });

    it('returns null when no settings exist', async () => {
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMembershipAccountingSettings({ tenantId: TENANT_A });

      expect(result).toBeNull();
    });
  });
});
