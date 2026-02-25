import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCloseChecklist } from '../queries/get-close-checklist';

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
}));

// Mock ReconciliationReadApi
const mockApi = {
  getDrawerSessionStatus: vi.fn().mockResolvedValue({ total: 0, openCount: 0 }),
  getRetailCloseStatus: vi.fn().mockResolvedValue({ total: 0, unposted: 0 }),
  getFnbCloseStatus: vi.fn().mockResolvedValue({ total: 0, unposted: 0 }),
  getPendingTipCount: vi.fn().mockResolvedValue(0),
  getDepositStatus: vi.fn().mockResolvedValue({ total: 0, unreconciled: 0 }),
  getSettlementStatusCounts: vi.fn().mockResolvedValue({ total: 0, unposted: 0 }),
  getAchPendingCount: vi.fn().mockResolvedValue(0),
  getAchReturnSummary: vi.fn().mockResolvedValue({ totalReturns: 0, totalReturnedCents: 0 }),
};

vi.mock('@oppsera/core/helpers/reconciliation-read-api', () => ({
  getReconciliationReadApi: () => mockApi,
}));

// Builds a mockTx whose execute() returns different results in sequence
function buildMockTx(results: any[]) {
  const execute = vi.fn();
  for (const r of results) {
    execute.mockResolvedValueOnce(r);
  }
  return { execute };
}

// Default local query results (accounting-owned tables)
// Wave 1 (all 9 queries in parallel via Promise.all):
//   1. period status
//   2. draft count
//   3. unmapped count
//   4. trial balance
//   5. combined settings (legacy/tips/svc/cogs/ap_control)
//   6. discount mapping completeness
//   7. dead letter count
//   8. recurring entries
//   9. bank reconciliation
// Wave 2 (conditional, depends on Wave 1 settings):
//   - AP reconciliation (3 queries if ap_control_account_id is set)
//   - Legacy GL reconciliation (2 queries if legacy enabled)
//   - COGS (1 query if periodic)
function defaultLocalResults(overrides: Record<string, any> = {}) {
  // Build combined settings from the separate overrides for backward compat
  const settingsOverride = overrides.settings?.[0] ?? {
    enable_legacy_gl_posting: false,
    default_tips_payable_account_id: 'acct-tips',
    default_service_charge_revenue_account_id: 'acct-svc',
    cogs_posting_mode: 'disabled',
  };
  const apControlId = overrides.apSettings?.[0]?.default_ap_control_account_id ?? null;
  const combinedSettings = [{
    ...settingsOverride,
    default_ap_control_account_id: apControlId,
  }];

  const results: any[] = [
    // 1. period status
    overrides.periodStatus ?? [{ status: 'open' }],
    // 2. draft count
    overrides.draftCount ?? [{ count: 0 }],
    // 3. unmapped count
    overrides.unmappedCount ?? [{ count: 0 }],
    // 4. trial balance
    overrides.trialBalance ?? [{ total_debits: '100.00', total_credits: '100.00' }],
    // 5. combined settings (legacy, tips, svc, cogs, ap_control)
    combinedSettings,
    // 6. discount mapping completeness
    overrides.discountMapping ?? [{ total_mapped: 3, missing_discount: 0 }],
    // 7. dead letter count
    overrides.deadLetters ?? [{ count: 0 }],
    // 8. recurring entries
    overrides.recurring ?? [{ total: 0, overdue: 0 }],
    // 9. bank reconciliation
    overrides.bankRec ?? [{ total_bank_accounts: 0, unreconciled: 0 }],
  ];

  // Wave 2 conditional queries:
  // Legacy GL reconciliation (2 queries if legacy enabled)
  if (overrides.legacyGl) {
    results.push(overrides.legacyGl[0]); // legacy total
    results.push(overrides.legacyGl[1]); // proper total
  }

  // COGS (if periodic)
  if (overrides.cogsCounts) {
    results.push(overrides.cogsCounts);
  }

  return results;
}

describe('getCloseChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset API mocks to defaults
    mockApi.getDrawerSessionStatus.mockResolvedValue({ total: 0, openCount: 0 });
    mockApi.getRetailCloseStatus.mockResolvedValue({ total: 0, unposted: 0 });
    mockApi.getFnbCloseStatus.mockResolvedValue({ total: 0, unposted: 0 });
    mockApi.getPendingTipCount.mockResolvedValue(0);
    mockApi.getDepositStatus.mockResolvedValue({ total: 0, unreconciled: 0 });
    mockApi.getSettlementStatusCounts.mockResolvedValue({ total: 0, unposted: 0 });
    mockApi.getAchPendingCount.mockResolvedValue(0);
    mockApi.getAchReturnSummary.mockResolvedValue({ totalReturns: 0, totalReturnedCents: 0 });
  });

  it('should return legacy GL warning when enableLegacyGlPosting is true', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        settings: [{
          enable_legacy_gl_posting: true,
          default_tips_payable_account_id: null,
          default_service_charge_revenue_account_id: null,
          cogs_posting_mode: 'disabled',
        }],
        discountMapping: [{ total_mapped: 3, missing_discount: 2 }],
        legacyGl: [
          [{ legacy_total: '1000.00' }],
          [{ proper_total: '950.00' }],
        ],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const legacyItem = result.items.find(i => i.label === 'Legacy GL posting disabled');
    expect(legacyItem).toBeDefined();
    expect(legacyItem!.status).toBe('warning');
    expect(legacyItem!.detail).toContain('still enabled');
  });

  it('should pass legacy GL check when enableLegacyGlPosting is false', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults());
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const legacyItem = result.items.find(i => i.label === 'Legacy GL posting disabled');
    expect(legacyItem).toBeDefined();
    expect(legacyItem!.status).toBe('pass');

    // Should NOT have POS legacy reconciliation item
    const posLegacyItem = result.items.find(i => i.label === 'POS legacy vs proper GL reconciliation');
    expect(posLegacyItem).toBeUndefined();
  });

  it('should warn when tips payable account is not configured', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        trialBalance: [{ total_debits: '0', total_credits: '0' }],
        settings: [{
          enable_legacy_gl_posting: false,
          default_tips_payable_account_id: null,
          default_service_charge_revenue_account_id: 'acct-svc',
          cogs_posting_mode: 'disabled',
        }],
        discountMapping: [{ total_mapped: 0, missing_discount: 0 }],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const tipsItem = result.items.find(i => i.label === 'Tips payable account configured');
    expect(tipsItem).toBeDefined();
    expect(tipsItem!.status).toBe('warning');
    expect(tipsItem!.detail).toContain('No tips payable account');
  });

  it('should pass when tips payable account is configured', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        trialBalance: [{ total_debits: '0', total_credits: '0' }],
        discountMapping: [{ total_mapped: 0, missing_discount: 0 }],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const tipsItem = result.items.find(i => i.label === 'Tips payable account configured');
    expect(tipsItem!.status).toBe('pass');
  });

  it('should warn when service charge revenue account is not configured', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        trialBalance: [{ total_debits: '0', total_credits: '0' }],
        settings: [{
          enable_legacy_gl_posting: false,
          default_tips_payable_account_id: 'acct-tips',
          default_service_charge_revenue_account_id: null,
          cogs_posting_mode: 'disabled',
        }],
        discountMapping: [{ total_mapped: 0, missing_discount: 0 }],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const svcItem = result.items.find(i => i.label === 'Service charge revenue account configured');
    expect(svcItem).toBeDefined();
    expect(svcItem!.status).toBe('warning');
    expect(svcItem!.detail).toContain('No service charge revenue account');
  });

  it('should warn when sub-departments are missing discount account mappings', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        trialBalance: [{ total_debits: '0', total_credits: '0' }],
        discountMapping: [{ total_mapped: 5, missing_discount: 3 }],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const discountItem = result.items.find(i => i.label === 'Sub-department discount account mappings');
    expect(discountItem).toBeDefined();
    expect(discountItem!.status).toBe('warning');
    expect(discountItem!.detail).toContain('3 of 5');
  });

  it('should pass discount check when all sub-departments have discount mappings', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        trialBalance: [{ total_debits: '0', total_credits: '0' }],
        discountMapping: [{ total_mapped: 5, missing_discount: 0 }],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const discountItem = result.items.find(i => i.label === 'Sub-department discount account mappings');
    expect(discountItem).toBeDefined();
    expect(discountItem!.status).toBe('pass');
  });

  it('should show POS legacy reconciliation with difference when totals mismatch', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx(defaultLocalResults({
        trialBalance: [{ total_debits: '0', total_credits: '0' }],
        settings: [{
          enable_legacy_gl_posting: true,
          default_tips_payable_account_id: 'acct-tips',
          default_service_charge_revenue_account_id: 'acct-svc',
          cogs_posting_mode: 'disabled',
        }],
        discountMapping: [{ total_mapped: 2, missing_discount: 0 }],
        legacyGl: [
          [{ legacy_total: '1500.00' }],
          [{ proper_total: '1200.00' }],
        ],
      }));
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const posItem = result.items.find(i => i.label === 'POS legacy vs proper GL reconciliation');
    expect(posItem).toBeDefined();
    expect(posItem!.status).toBe('warning');
    expect(posItem!.detail).toContain('$300.00');
  });
});
