import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCloseChecklist } from '../queries/get-close-checklist';

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
}));

// Default empty results for the UXOPS-12 new checklist queries (#11-#18)
const UXOPS12_DEFAULTS = [
  [{ total: 0, open_count: 0 }],        // #11 drawer sessions
  [{ total: 0, unposted: 0 }],          // #12 retail close batches
  [{ total: 0, unposted: 0 }],          // #13 F&B close batches
  [{ paid_out: 0 }],                     // #14a tip payouts sum
  [{ count: 0 }],                        // #14b pending tip payouts
  [{ total: 0, unreconciled: 0 }],       // #15 deposit slips
  [{ count: 0 }],                        // #16 dead letter events
  [{ total: 0, unposted: 0 }],          // #17 card settlements
  [{ cogs_posting_mode: 'disabled' }],   // #18 COGS settings
];

// Builds a mockTx whose execute() returns different results in sequence
function buildMockTx(results: any[]) {
  const execute = vi.fn();
  for (const r of results) {
    execute.mockResolvedValueOnce(r);
  }
  return { execute };
}

describe('getCloseChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return legacy GL warning when enableLegacyGlPosting is true', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx([
        // 1. period status
        [{ status: 'open' }],
        // 2. draft count
        [{ count: 0 }],
        // 3. unmapped count
        [{ count: 0 }],
        // 4. trial balance
        [{ total_debits: '100.00', total_credits: '100.00' }],
        // 5. AP settings (no AP control account)
        [{ default_ap_control_account_id: null }],
        // 6. new settings query (legacy, tips, svc)
        [{ enable_legacy_gl_posting: true, default_tips_payable_account_id: null, default_service_charge_revenue_account_id: null }],
        // 7. discount mapping completeness
        [{ total_mapped: 3, missing_discount: 2 }],
        // 8. legacy GL total (pos_legacy reconciliation)
        [{ legacy_total: '1000.00' }],
        // 9. proper GL total
        [{ proper_total: '950.00' }],
        // UXOPS-12 new items
        ...UXOPS12_DEFAULTS,
      ]);
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
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '100.00', total_credits: '100.00' }],
        [{ default_ap_control_account_id: null }],
        // legacy disabled, tips + svc set
        [{ enable_legacy_gl_posting: false, default_tips_payable_account_id: 'acct-tips', default_service_charge_revenue_account_id: 'acct-svc' }],
        [{ total_mapped: 3, missing_discount: 0 }],
        // No legacy reconciliation query since legacy is disabled
        // UXOPS-12 new items
        ...UXOPS12_DEFAULTS,
      ]);
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
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '0', total_credits: '0' }],
        [{ default_ap_control_account_id: null }],
        [{ enable_legacy_gl_posting: false, default_tips_payable_account_id: null, default_service_charge_revenue_account_id: 'acct-svc' }],
        [{ total_mapped: 0, missing_discount: 0 }],
        ...UXOPS12_DEFAULTS,
      ]);
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
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '0', total_credits: '0' }],
        [{ default_ap_control_account_id: null }],
        [{ enable_legacy_gl_posting: false, default_tips_payable_account_id: 'acct-tips', default_service_charge_revenue_account_id: 'acct-svc' }],
        [{ total_mapped: 0, missing_discount: 0 }],
        ...UXOPS12_DEFAULTS,
      ]);
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const tipsItem = result.items.find(i => i.label === 'Tips payable account configured');
    expect(tipsItem!.status).toBe('pass');
  });

  it('should warn when service charge revenue account is not configured', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '0', total_credits: '0' }],
        [{ default_ap_control_account_id: null }],
        [{ enable_legacy_gl_posting: false, default_tips_payable_account_id: 'acct-tips', default_service_charge_revenue_account_id: null }],
        [{ total_mapped: 0, missing_discount: 0 }],
        ...UXOPS12_DEFAULTS,
      ]);
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
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '0', total_credits: '0' }],
        [{ default_ap_control_account_id: null }],
        [{ enable_legacy_gl_posting: false, default_tips_payable_account_id: 'acct-tips', default_service_charge_revenue_account_id: 'acct-svc' }],
        [{ total_mapped: 5, missing_discount: 3 }],
        ...UXOPS12_DEFAULTS,
      ]);
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
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '0', total_credits: '0' }],
        [{ default_ap_control_account_id: null }],
        [{ enable_legacy_gl_posting: false, default_tips_payable_account_id: 'acct-tips', default_service_charge_revenue_account_id: 'acct-svc' }],
        [{ total_mapped: 5, missing_discount: 0 }],
        ...UXOPS12_DEFAULTS,
      ]);
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
      const mockTx = buildMockTx([
        [{ status: 'open' }],
        [{ count: 0 }],
        [{ count: 0 }],
        [{ total_debits: '0', total_credits: '0' }],
        [{ default_ap_control_account_id: null }],
        [{ enable_legacy_gl_posting: true, default_tips_payable_account_id: 'acct-tips', default_service_charge_revenue_account_id: 'acct-svc' }],
        [{ total_mapped: 2, missing_discount: 0 }],
        // Legacy vs proper GL totals differ
        [{ legacy_total: '1500.00' }],
        [{ proper_total: '1200.00' }],
        // UXOPS-12 new items
        ...UXOPS12_DEFAULTS,
      ]);
      return fn(mockTx);
    });

    const result = await getCloseChecklist({ tenantId: 'tenant-1', postingPeriod: '2026-01' });

    const posItem = result.items.find(i => i.label === 'POS legacy vs proper GL reconciliation');
    expect(posItem).toBeDefined();
    expect(posItem!.status).toBe('warning');
    expect(posItem!.detail).toContain('$300.00');
  });
});
