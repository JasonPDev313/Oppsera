import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = 'tenant_001';

// ── Mock Drizzle chain ──────────────────────────────────────────────

const mockSelectReturns = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInnerJoin = vi.fn();

function makeWhereResult() {
  let resolved: any[] | null = null;
  const resolve = () => {
    if (resolved === null) {
      const data = mockSelectReturns();
      resolved = Array.isArray(data) ? data : [];
    }
    return resolved;
  };
  return {
    orderBy: mockOrderBy,
    limit: mockLimit,
    [Symbol.iterator]: () => resolve()[Symbol.iterator](),
    then: (onFulfilled: any) => onFulfilled(resolve()),
  };
}

function wireChain() {
  mockOrderBy.mockImplementation(() => {
    const result = mockSelectReturns();
    const arr = Array.isArray(result) ? result : [];
    (arr as any).limit = () => arr;
    return arr;
  });
  mockLimit.mockImplementation(() => mockSelectReturns());
  mockWhere.mockImplementation(() => makeWhereResult());
  mockInnerJoin.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  }));
  mockFrom.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    innerJoin: mockInnerJoin,
  }));
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
}

wireChain();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) =>
    fn({ select: mockSelect }),
  ),
  membershipAccounts: {
    id: 'id', tenantId: 'tenant_id', accountNumber: 'account_number',
    status: 'status', creditLimitCents: 'credit_limit_cents',
    autopayEnabled: 'autopay_enabled', statementDayOfMonth: 'statement_day_of_month',
    startDate: 'start_date',
  },
  membershipMembers: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    customerId: 'customer_id', role: 'role', status: 'status',
  },
  membershipSubscriptions: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    status: 'status',
  },
  statements: {
    id: 'id', tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    statementNumber: 'statement_number', periodStart: 'period_start',
    periodEnd: 'period_end', closingBalanceCents: 'closing_balance_cents',
    status: 'status', createdAt: 'created_at',
  },
}));

beforeEach(() => {
  mockSelectReturns.mockReset();
  wireChain();
});

// ── getMemberPortalAccount ──────────────────────────────────────────

describe('Session 12 — Member Portal Queries', () => {
  describe('getMemberPortalAccount', () => {
    it('returns account for valid customer', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_1',
        accountNumber: 'MBR-001',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 500000,
        autopayEnabled: true,
        statementDayOfMonth: 15,
        startDate: '2024-01-01',
      }]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_1' });
      expect(result).not.toBeNull();
      expect(result!.accountId).toBe('acct_1');
      expect(result!.accountNumber).toBe('MBR-001');
      expect(result!.status).toBe('active');
      expect(result!.memberRole).toBe('primary');
      expect(result!.creditLimitCents).toBe(500000);
      expect(result!.autopayEnabled).toBe(true);
      expect(result!.statementDayOfMonth).toBe(15);
    });

    it('returns null when customer has no membership', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_no_membership' });
      expect(result).toBeNull();
    });

    it('maps start date correctly when present', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_2',
        accountNumber: 'MBR-002',
        status: 'active',
        memberRole: 'spouse',
        creditLimitCents: 0,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: '2025-03-15',
      }]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_2' });
      expect(result).not.toBeNull();
      expect(result!.startDate).toBe('2025-03-15');
      expect(result!.memberRole).toBe('spouse');
    });

    it('maps start date to null when absent', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_3',
        accountNumber: 'MBR-003',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 100000,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: null,
      }]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_3' });
      expect(result).not.toBeNull();
      expect(result!.startDate).toBeNull();
    });

    it('includes V1 placeholder fields', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_4',
        accountNumber: 'MBR-004',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 250000,
        autopayEnabled: true,
        statementDayOfMonth: 20,
        startDate: '2024-06-01',
      }]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_4' });
      expect(result).not.toBeNull();
      // V1 placeholders
      expect(result!.planName).toBeNull();
      expect(result!.currentBalanceCents).toBe(0);
    });

    it('defaults creditLimitCents to 0 when null', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_5',
        accountNumber: 'MBR-005',
        status: 'suspended',
        memberRole: 'corporate_designee',
        creditLimitCents: null,
        autopayEnabled: false,
        statementDayOfMonth: null,
        startDate: null,
      }]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_5' });
      expect(result).not.toBeNull();
      expect(result!.creditLimitCents).toBe(0);
      expect(result!.statementDayOfMonth).toBe(1);
    });

    it('coerces status to string with fallback', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_6',
        accountNumber: null,
        status: null,
        memberRole: null,
        creditLimitCents: 0,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: null,
      }]);

      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_6' });
      expect(result).not.toBeNull();
      expect(result!.accountNumber).toBe('');
      expect(result!.status).toBe('unknown');
      expect(result!.memberRole).toBe('primary');
    });
  });

  // ── getMemberPortalSummary ──────────────────────────────────────────

  describe('getMemberPortalSummary', () => {
    it('returns full summary with statements and subscriptions', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      // 1st query: member -> account join
      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_1',
        accountNumber: 'MBR-001',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 500000,
        autopayEnabled: true,
        statementDayOfMonth: 15,
        startDate: '2024-06-01',
      }]);

      // 2nd query: recent statements
      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'stmt_1', statementNumber: 'STMT-001',
          periodStart: '2025-06-01', periodEnd: '2025-06-30',
          closingBalanceCents: 75000, status: 'issued',
          createdAt: '2025-07-01',
        },
        {
          id: 'stmt_2', statementNumber: 'STMT-002',
          periodStart: '2025-05-01', periodEnd: '2025-05-31',
          closingBalanceCents: 50000, status: 'paid',
          createdAt: '2025-06-01',
        },
      ]);

      // 3rd query: active subscriptions
      mockSelectReturns.mockReturnValueOnce([
        { id: 'sub_1' },
        { id: 'sub_2' },
      ]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_1' });
      expect(result.accountId).toBe('acct_1');
      expect(result.accountNumber).toBe('MBR-001');
      expect(result.accountStatus).toBe('active');
      expect(result.memberRole).toBe('primary');
      expect(result.autopayEnabled).toBe(true);
      expect(result.recentStatements).toHaveLength(2);
      expect(result.recentStatements[0]!.statementNumber).toBe('STMT-001');
      expect(result.recentStatements[0]!.totalDueCents).toBe(75000);
      expect(result.recentStatements[1]!.totalDueCents).toBe(50000);
      expect(result.activeSubscriptionCount).toBe(2);
    });

    it('returns empty summary when customer has no membership', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_no_membership' });
      expect(result.accountId).toBeNull();
      expect(result.accountNumber).toBeNull();
      expect(result.accountStatus).toBeNull();
      expect(result.memberRole).toBeNull();
      expect(result.recentStatements).toHaveLength(0);
      expect(result.activeSubscriptionCount).toBe(0);
    });

    it('handles account with no statements and no subscriptions', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      // account found
      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_3',
        accountNumber: 'MBR-003',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 100000,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: '2025-01-15',
      }]);

      // no statements
      mockSelectReturns.mockReturnValueOnce([]);

      // no subscriptions
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_3' });
      expect(result.accountId).toBe('acct_3');
      expect(result.recentStatements).toHaveLength(0);
      expect(result.activeSubscriptionCount).toBe(0);
      expect(result.creditLimitCents).toBe(100000);
    });

    it('caps recent statements at 5', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_4',
        accountNumber: 'MBR-004',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 200000,
        autopayEnabled: true,
        statementDayOfMonth: 20,
        startDate: '2023-01-01',
      }]);

      // 5 statements (DB limited to 5 via .limit(5))
      const stmts = Array.from({ length: 5 }, (_, i) => ({
        id: `stmt_${i}`, statementNumber: `STMT-${i}`,
        periodStart: '2025-01-01', periodEnd: '2025-01-31',
        closingBalanceCents: 10000 + i * 1000, status: 'issued',
        createdAt: new Date(2025, 0, i + 1).toISOString(),
      }));
      mockSelectReturns.mockReturnValueOnce(stmts);

      // subscriptions
      mockSelectReturns.mockReturnValueOnce([{ id: 'sub_1' }]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_4' });
      expect(result.recentStatements).toHaveLength(5);
      expect(result.activeSubscriptionCount).toBe(1);
    });

    it('converts Date objects to strings for periodStart/periodEnd/createdAt', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_5',
        accountNumber: 'MBR-005',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 0,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: '2024-03-01',
      }]);

      // Statement with Date objects (as postgres.js might return for date/timestamp columns)
      mockSelectReturns.mockReturnValueOnce([{
        id: 'stmt_d', statementNumber: null,
        periodStart: new Date('2025-06-01'),
        periodEnd: new Date('2025-06-30'),
        closingBalanceCents: 25000, status: 'issued',
        createdAt: new Date('2025-07-02T10:00:00Z'),
      }]);

      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_5' });
      expect(result.recentStatements[0]!.periodStart).toBe('2025-06-01');
      expect(result.recentStatements[0]!.periodEnd).toBe('2025-06-30');
      expect(result.recentStatements[0]!.createdAt).toContain('2025-07-02');
    });

    it('handles statement with null statementNumber', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_6',
        accountNumber: 'MBR-006',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 50000,
        autopayEnabled: true,
        statementDayOfMonth: 5,
        startDate: '2024-11-01',
      }]);

      mockSelectReturns.mockReturnValueOnce([{
        id: 'stmt_null_num', statementNumber: null,
        periodStart: '2025-08-01', periodEnd: '2025-08-31',
        closingBalanceCents: 30000, status: 'issued',
        createdAt: '2025-09-01',
      }]);

      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_6' });
      expect(result.recentStatements[0]!.statementNumber).toBeNull();
    });

    it('handles statement with zero closing balance', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_7',
        accountNumber: 'MBR-007',
        status: 'suspended',
        memberRole: 'corporate_designee',
        creditLimitCents: 100000,
        autopayEnabled: true,
        statementDayOfMonth: 10,
        startDate: '2024-09-15',
      }]);

      mockSelectReturns.mockReturnValueOnce([{
        id: 'stmt_z', statementNumber: 'STMT-ZERO',
        periodStart: '2025-07-01', periodEnd: '2025-07-31',
        closingBalanceCents: 0, status: 'issued',
        createdAt: '2025-08-01',
      }]);

      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_7' });
      expect(result.accountStatus).toBe('suspended');
      expect(result.memberRole).toBe('corporate_designee');
      expect(result.recentStatements[0]!.totalDueCents).toBe(0);
    });

    it('defaults closingBalanceCents to 0 when null in DB row', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_8',
        accountNumber: 'MBR-008',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 0,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: null,
      }]);

      mockSelectReturns.mockReturnValueOnce([{
        id: 'stmt_null_bal', statementNumber: 'STMT-NB',
        periodStart: '2025-09-01', periodEnd: '2025-09-30',
        closingBalanceCents: null, status: 'issued',
        createdAt: '2025-10-01',
      }]);

      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_8' });
      expect(result.recentStatements[0]!.totalDueCents).toBe(0);
    });

    it('counts multiple active subscriptions', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_9',
        accountNumber: 'MBR-009',
        status: 'active',
        memberRole: 'primary',
        creditLimitCents: 300000,
        autopayEnabled: true,
        statementDayOfMonth: 1,
        startDate: '2023-06-01',
      }]);

      mockSelectReturns.mockReturnValueOnce([]);

      // 3 active subscriptions
      mockSelectReturns.mockReturnValueOnce([
        { id: 'sub_a' },
        { id: 'sub_b' },
        { id: 'sub_c' },
      ]);

      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_9' });
      expect(result.activeSubscriptionCount).toBe(3);
    });
  });

  // ── End-to-end data scoping ─────────────────────────────────────────

  describe('End-to-end data scoping', () => {
    it('different customers see different accounts', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      // Customer A
      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_A', accountNumber: 'MBR-A', status: 'active',
        memberRole: 'primary', creditLimitCents: 100000, autopayEnabled: true,
        statementDayOfMonth: 1, startDate: '2024-01-01',
      }]);
      const r1 = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_A' });

      // Customer B
      mockSelectReturns.mockReturnValueOnce([{
        accountId: 'acct_B', accountNumber: 'MBR-B', status: 'suspended',
        memberRole: 'spouse', creditLimitCents: 50000, autopayEnabled: false,
        statementDayOfMonth: 15, startDate: '2024-06-01',
      }]);
      const r2 = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_B' });

      expect(r1!.accountId).toBe('acct_A');
      expect(r2!.accountId).toBe('acct_B');
      expect(r1!.accountId).not.toBe(r2!.accountId);
    });

    it('returns null for non-existent customer', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');

      mockSelectReturns.mockReturnValueOnce([]);
      const result = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_does_not_exist' });
      expect(result).toBeNull();
    });

    it('summary defaults are safe for UI rendering', async () => {
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      mockSelectReturns.mockReturnValueOnce([]);
      const result = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_none' });

      // All fields have safe defaults for frontend rendering
      expect(result.accountId).toBeNull();
      expect(result.accountNumber).toBeNull();
      expect(result.accountStatus).toBeNull();
      expect(result.memberRole).toBeNull();
      expect(result.creditLimitCents).toBe(0);
      expect(result.autopayEnabled).toBe(false);
      expect(result.statementDayOfMonth).toBe(1);
      expect(result.startDate).toBeNull();
      expect(result.recentStatements).toEqual([]);
      expect(result.activeSubscriptionCount).toBe(0);
    });

    it('portal account and summary agree on account identity', async () => {
      const { getMemberPortalAccount } = await import('../queries/get-member-portal-account');
      const { getMemberPortalSummary } = await import('../queries/get-member-portal-summary');

      const sharedRow = {
        accountId: 'acct_shared', accountNumber: 'MBR-SHARED', status: 'active',
        memberRole: 'primary', creditLimitCents: 200000, autopayEnabled: true,
        statementDayOfMonth: 10, startDate: '2024-02-01',
      };

      // Portal account query
      mockSelectReturns.mockReturnValueOnce([sharedRow]);
      const acct = await getMemberPortalAccount({ tenantId: TENANT_A, customerId: 'cust_shared' });

      // Summary query (account + statements + subscriptions)
      mockSelectReturns.mockReturnValueOnce([sharedRow]);
      mockSelectReturns.mockReturnValueOnce([]);
      mockSelectReturns.mockReturnValueOnce([]);
      const summary = await getMemberPortalSummary({ tenantId: TENANT_A, customerId: 'cust_shared' });

      expect(acct!.accountId).toBe(summary.accountId);
      expect(acct!.accountNumber).toBe(summary.accountNumber);
      expect(acct!.status).toBe(summary.accountStatus);
      expect(acct!.creditLimitCents).toBe(summary.creditLimitCents);
      expect(acct!.autopayEnabled).toBe(summary.autopayEnabled);
    });
  });
});
