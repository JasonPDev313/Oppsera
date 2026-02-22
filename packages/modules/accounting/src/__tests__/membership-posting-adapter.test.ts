import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMembershipBillingForAccounting } from '../adapters/membership-posting-adapter';

vi.mock('@oppsera/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  sql: vi.fn(),
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: vi.fn(),
}));

vi.mock('../helpers/resolve-mapping', () => ({
  logUnmappedEvent: vi.fn(),
}));

const mockPostEntry = vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: () => ({
    postEntry: mockPostEntry,
  }),
}));

const baseBillingEvent = {
  eventId: 'evt-1',
  eventType: 'membership.billing.charged.v1',
  occurredAt: new Date().toISOString(),
  tenantId: 'tenant-1',
  idempotencyKey: 'key-1',
  data: {
    membershipId: 'mem-1',
    membershipPlanId: 'plan-1',
    customerId: 'cust-1',
    billingAccountId: 'ba-1',
    amountCents: 9900,
    billingPeriodStart: '2026-03-01',
    billingPeriodEnd: '2026-03-31',
    businessDate: '2026-03-01',
    locationId: 'loc-1',
    revenueGlAccountId: 'acct-mem-revenue',
    deferredRevenueGlAccountId: 'acct-deferred-revenue',
  },
};

describe('handleMembershipBillingForAccounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip when no accounting settings', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce(null);

    await handleMembershipBillingForAccounting(baseBillingEvent as any);

    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should log unmapped event when AR control account missing', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultARControlAccountId: null,
    });

    const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

    await handleMembershipBillingForAccounting(baseBillingEvent as any);

    expect(logUnmappedEvent).toHaveBeenCalledOnce();
    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should log unmapped event when deferred revenue account missing on plan', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultARControlAccountId: 'acct-ar',
    });

    const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

    const event = {
      ...baseBillingEvent,
      data: { ...baseBillingEvent.data, deferredRevenueGlAccountId: null },
    };

    await handleMembershipBillingForAccounting(event as any);

    expect(logUnmappedEvent).toHaveBeenCalledOnce();
    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should post balanced GL entry: Dr AR, Cr Deferred Revenue', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultARControlAccountId: 'acct-ar',
    });

    await handleMembershipBillingForAccounting(baseBillingEvent as any);

    expect(mockPostEntry).toHaveBeenCalledOnce();
    const [ctx, input] = mockPostEntry.mock.calls[0]!;

    expect(ctx.tenantId).toBe('tenant-1');
    expect(input.sourceModule).toBe('membership');
    expect(input.sourceReferenceId).toBe('billing-mem-1-2026-03-01');
    expect(input.forcePost).toBe(true);
    expect(input.lines).toHaveLength(2);

    // Debit AR control
    expect(input.lines[0].accountId).toBe('acct-ar');
    expect(input.lines[0].debitAmount).toBe('99.00');
    expect(input.lines[0].creditAmount).toBe('0');
    expect(input.lines[0].customerId).toBe('cust-1');

    // Credit Deferred Revenue
    expect(input.lines[1].accountId).toBe('acct-deferred-revenue');
    expect(input.lines[1].debitAmount).toBe('0');
    expect(input.lines[1].creditAmount).toBe('99.00');
  });

  it('should include billing period in memo', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultARControlAccountId: 'acct-ar',
    });

    await handleMembershipBillingForAccounting(baseBillingEvent as any);

    const input = mockPostEntry.mock.calls[0]![1];
    expect(input.memo).toContain('2026-03-01');
    expect(input.memo).toContain('2026-03-31');
  });

  it('should convert cents to dollars correctly', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultARControlAccountId: 'acct-ar',
    });

    const event = {
      ...baseBillingEvent,
      data: { ...baseBillingEvent.data, amountCents: 12345 },
    };

    await handleMembershipBillingForAccounting(event as any);

    const lines = mockPostEntry.mock.calls[0]![1].lines as any[];
    expect(lines[0].debitAmount).toBe('123.45');
    expect(lines[1].creditAmount).toBe('123.45');
  });

  it('should never throw — catches all errors', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

    await expect(handleMembershipBillingForAccounting(baseBillingEvent as any)).resolves.toBeUndefined();
  });

  it('should set locationId on GL lines when provided', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultARControlAccountId: 'acct-ar',
    });

    await handleMembershipBillingForAccounting(baseBillingEvent as any);

    const lines = mockPostEntry.mock.calls[0]![1].lines as any[];
    expect(lines[0].locationId).toBe('loc-1');
    expect(lines[1].locationId).toBe('loc-1');
  });
});
