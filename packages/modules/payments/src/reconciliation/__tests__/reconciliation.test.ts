import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock withTenant to execute the callback with a mock tx ────────
const mockExecute = vi.fn();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, cb: (tx: any) => any) => {
    const mockTx = {
      execute: mockExecute,
    };
    return cb(mockTx);
  }),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { empty: { strings: [''], values: [] } },
  ),
}));

// ── Import all 17 functions under test ────────────────────────────
import {
  getTendersSummary,
  getTenderAuditTrail,
  getUnmatchedTenders,
  getTenderAuditCount,
  listSettlements,
  getSettlementDetail,
  getSettlementStatusCounts,
  getDrawerSessionStatus,
  getRetailCloseStatus,
  getCashOnHand,
  getOverShortTotal,
  getTipBalances,
  listTipPayouts,
  getPendingTipCount,
  getOutstandingTipsCents,
  getDepositStatus,
  getLocationCloseStatus,
} from '../index';

// ── Reset mocks before each test ─────────────────────────────────
beforeEach(() => {
  mockExecute.mockReset();
});

// =====================================================================
// 1. getTendersSummary
// =====================================================================
describe('getTendersSummary', () => {
  it('should return TendersSummaryData with correct shape and types', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        cash: 50000,
        card: 80000,
        other: 5000,
        total: 135000,
        tender_count: 25,
        tips: 12000,
      },
    ]);

    const result = await getTendersSummary('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toEqual({
      cashCents: 50000,
      cardCents: 80000,
      otherCents: 5000,
      totalCents: 135000,
      tenderCount: 25,
      tipsCents: 12000,
    });
    expect(typeof result.cashCents).toBe('number');
    expect(typeof result.cardCents).toBe('number');
    expect(typeof result.otherCents).toBe('number');
    expect(typeof result.totalCents).toBe('number');
    expect(typeof result.tenderCount).toBe('number');
    expect(typeof result.tipsCents).toBe('number');
  });

  it('should return zeroes when no tenders exist', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        cash: 0,
        card: 0,
        other: 0,
        total: 0,
        tender_count: 0,
        tips: 0,
      },
    ]);

    const result = await getTendersSummary('tenant-1', '2026-01-01', '2026-01-31');

    expect(result.cashCents).toBe(0);
    expect(result.cardCents).toBe(0);
    expect(result.otherCents).toBe(0);
    expect(result.totalCents).toBe(0);
    expect(result.tenderCount).toBe(0);
    expect(result.tipsCents).toBe(0);
  });
});

// =====================================================================
// 2. getTenderAuditTrail
// =====================================================================
describe('getTenderAuditTrail', () => {
  it('should return null when tender not found', async () => {
    mockExecute.mockResolvedValueOnce([]); // tender query returns nothing

    const result = await getTenderAuditTrail('tenant-1', 'nonexistent-tender');

    expect(result).toBeNull();
  });

  it('should return TenderAuditTrailData for a cash tender', async () => {
    // Call 1: tender query
    mockExecute.mockResolvedValueOnce([
      {
        id: 'tender-1',
        tender_type: 'cash',
        amount: 5000,
        tip_amount: 300,
        order_id: 'order-1',
        business_date: '2026-01-15',
        location_id: 'loc-1',
        employee_id: 'emp-1',
        status: 'captured',
        created_at: '2026-01-15T10:00:00Z',
      },
    ]);
    // Call 2: order query
    mockExecute.mockResolvedValueOnce([
      {
        order_number: 'ORD-001',
        status: 'paid',
        placed_at: '2026-01-15T09:55:00Z',
        paid_at: '2026-01-15T10:00:00Z',
      },
    ]);
    // Call 3: GL query
    mockExecute.mockResolvedValueOnce([
      {
        id: 'je-1',
        status: 'posted',
        posted_at: '2026-01-15T10:01:00Z',
        journal_number: 'JE-0001',
        memo: 'POS tender',
      },
    ]);
    // Call 4: deposit query (cash tenders skip the settlement step)
    mockExecute.mockResolvedValueOnce([]);

    const result = await getTenderAuditTrail('tenant-1', 'tender-1');

    expect(result).not.toBeNull();
    expect(typeof result!.tenderId).toBe('string');
    expect(result!.tenderId).toBe('tender-1');
    expect(typeof result!.tenderType).toBe('string');
    expect(result!.tenderType).toBe('cash');
    expect(typeof result!.amountCents).toBe('number');
    expect(result!.amountCents).toBe(5000);
    expect(typeof result!.tipAmountCents).toBe('number');
    expect(result!.tipAmountCents).toBe(300);
    expect(typeof result!.orderId).toBe('string');
    expect(result!.orderId).toBe('order-1');
    expect(typeof result!.orderNumber).toBe('string');
    expect(result!.orderNumber).toBe('ORD-001');
    expect(typeof result!.businessDate).toBe('string');
    expect(typeof result!.locationId).toBe('string');
    expect(typeof result!.employeeId).toBe('string');

    // Cash tender: tender, order, gl_posting, deposit = 4 steps (no settlement)
    expect(Array.isArray(result!.steps)).toBe(true);
    expect(result!.steps.length).toBe(4);

    // Verify step shape
    for (const step of result!.steps) {
      expect(typeof step.stage).toBe('string');
      expect(typeof step.label).toBe('string');
      expect(['complete', 'pending', 'missing']).toContain(step.status);
      expect(step.timestamp === null || typeof step.timestamp === 'string').toBe(true);
      expect(step.referenceId === null || typeof step.referenceId === 'string').toBe(true);
    }
  });

  it('should return 5 steps for a card tender (including settlement)', async () => {
    // Call 1: tender query (card type)
    mockExecute.mockResolvedValueOnce([
      {
        id: 'tender-2',
        tender_type: 'credit_card',
        amount: 7500,
        tip_amount: 0,
        order_id: 'order-2',
        business_date: '2026-01-15',
        location_id: 'loc-1',
        employee_id: null,
        status: 'captured',
        created_at: '2026-01-15T11:00:00Z',
      },
    ]);
    // Call 2: order query
    mockExecute.mockResolvedValueOnce([
      {
        order_number: 'ORD-002',
        status: 'paid',
        placed_at: '2026-01-15T10:55:00Z',
        paid_at: '2026-01-15T11:00:00Z',
      },
    ]);
    // Call 3: GL query
    mockExecute.mockResolvedValueOnce([]);
    // Call 4: settlement query (card tender gets a settlement step)
    mockExecute.mockResolvedValueOnce([
      {
        line_id: 'psl-1',
        settlement_id: 'settle-1',
        processor_name: 'Stripe',
        settlement_date: '2026-01-16',
        settlement_status: 'posted',
        line_status: 'matched',
        matched_at: '2026-01-16T08:00:00Z',
        fee_cents: 218,
      },
    ]);
    // Call 5: deposit query
    mockExecute.mockResolvedValueOnce([]);

    const result = await getTenderAuditTrail('tenant-1', 'tender-2');

    expect(result).not.toBeNull();
    // Card tender: tender, order, gl_posting, settlement, deposit = 5 steps
    expect(result!.steps.length).toBe(5);
    expect(result!.employeeId).toBeNull(); // nullable field
    expect(result!.tipAmountCents).toBe(0);

    const stageNames = result!.steps.map((s) => s.stage);
    expect(stageNames).toContain('tender');
    expect(stageNames).toContain('order');
    expect(stageNames).toContain('gl_posting');
    expect(stageNames).toContain('settlement');
    expect(stageNames).toContain('deposit');
  });

  it('should handle missing order gracefully', async () => {
    // Call 1: tender query
    mockExecute.mockResolvedValueOnce([
      {
        id: 'tender-3',
        tender_type: 'cash',
        amount: 1000,
        tip_amount: null,
        order_id: 'order-orphan',
        business_date: '2026-01-20',
        location_id: 'loc-1',
        employee_id: null,
        status: 'captured',
        created_at: '2026-01-20T14:00:00Z',
      },
    ]);
    // Call 2: order not found
    mockExecute.mockResolvedValueOnce([]);
    // Call 3: GL not found
    mockExecute.mockResolvedValueOnce([]);
    // Call 4: deposit not found
    mockExecute.mockResolvedValueOnce([]);

    const result = await getTenderAuditTrail('tenant-1', 'tender-3');

    expect(result).not.toBeNull();
    expect(result!.orderNumber).toBeNull();
    expect(result!.employeeId).toBeNull();
    expect(result!.tipAmountCents).toBe(0); // null tip_amount → 0
  });
});

// =====================================================================
// 3. getUnmatchedTenders
// =====================================================================
describe('getUnmatchedTenders', () => {
  it('should return UnmatchedTenderRow[] with correct shape', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: 'tender-1',
        order_id: 'order-1',
        tender_type: 'card',
        amount: 5000,
        tip_amount: 200,
        business_date: '2026-01-15',
        card_last4: '4242',
        card_brand: 'visa',
        provider_ref: 'pi_abc123',
        created_at: '2026-01-15T10:00:00Z',
      },
    ]);

    const result = await getUnmatchedTenders('tenant-1', '2026-01-01', '2026-01-31');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);

    const row = result[0]!;
    expect(typeof row.id).toBe('string');
    expect(typeof row.orderId).toBe('string');
    expect(typeof row.tenderType).toBe('string');
    expect(typeof row.amount).toBe('number');
    expect(typeof row.tipAmount).toBe('number');
    expect(typeof row.businessDate).toBe('string');
    expect(typeof row.cardLast4).toBe('string');
    expect(typeof row.cardBrand).toBe('string');
    expect(typeof row.providerRef).toBe('string');
    expect(typeof row.createdAt).toBe('string');
  });

  it('should return empty array when no unmatched tenders', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getUnmatchedTenders('tenant-1', '2026-01-01', '2026-01-31');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('should handle nullable card fields', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: 'tender-2',
        order_id: 'order-2',
        tender_type: 'gift_card',
        amount: 2500,
        tip_amount: 0,
        business_date: '2026-01-18',
        card_last4: null,
        card_brand: null,
        provider_ref: null,
        created_at: '2026-01-18T12:00:00Z',
      },
    ]);

    const result = await getUnmatchedTenders('tenant-1', '2026-01-01', '2026-01-31');

    const row = result[0]!;
    expect(row.cardLast4).toBeNull();
    expect(row.cardBrand).toBeNull();
    expect(row.providerRef).toBeNull();
  });
});

// =====================================================================
// 4. getTenderAuditCount
// =====================================================================
describe('getTenderAuditCount', () => {
  it('should return a number', async () => {
    mockExecute.mockResolvedValueOnce([{ count: 42 }]);

    const result = await getTenderAuditCount('tenant-1', '2026-01-01', '2026-01-31');

    expect(typeof result).toBe('number');
    expect(result).toBe(42);
  });

  it('should return 0 when no tenders exist', async () => {
    mockExecute.mockResolvedValueOnce([{ count: 0 }]);

    const result = await getTenderAuditCount('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toBe(0);
  });
});

// =====================================================================
// 5. listSettlements
// =====================================================================
describe('listSettlements', () => {
  it('should return SettlementListResult with correct shape', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: 'settle-1',
        location_id: 'loc-1',
        settlement_date: '2026-01-16',
        processor_name: 'Stripe',
        processor_batch_id: 'batch-001',
        gross_amount: '1500.00',
        fee_amount: '45.00',
        net_amount: '1455.00',
        chargeback_amount: '0.00',
        status: 'posted',
        bank_account_id: 'bank-1',
        bank_account_name: 'Main Checking',
        gl_journal_entry_id: 'je-1',
        import_source: 'csv',
        business_date_from: '2026-01-15',
        business_date_to: '2026-01-15',
        notes: 'Daily batch',
        created_at: '2026-01-16T08:00:00Z',
        total_lines: 10,
        matched_lines: 8,
        unmatched_lines: 2,
      },
    ]);

    const result = await listSettlements('tenant-1', {});

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('cursor');
    expect(result).toHaveProperty('hasMore');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();

    const item = result.items[0]!;
    expect(typeof item.id).toBe('string');
    expect(typeof item.settlementDate).toBe('string');
    expect(typeof item.processorName).toBe('string');
    expect(typeof item.grossAmount).toBe('number');
    expect(typeof item.feeAmount).toBe('number');
    expect(typeof item.netAmount).toBe('number');
    expect(typeof item.chargebackAmount).toBe('number');
    expect(typeof item.status).toBe('string');
    expect(typeof item.importSource).toBe('string');
    expect(typeof item.totalLines).toBe('number');
    expect(typeof item.matchedLines).toBe('number');
    expect(typeof item.unmatchedLines).toBe('number');
    expect(typeof item.createdAt).toBe('string');

    // Nullable fields should be present
    expect(item.locationId).toBe('loc-1');
    expect(item.processorBatchId).toBe('batch-001');
    expect(item.bankAccountId).toBe('bank-1');
    expect(item.bankAccountName).toBe('Main Checking');
    expect(item.glJournalEntryId).toBe('je-1');
    expect(item.businessDateFrom).toBe('2026-01-15');
    expect(item.businessDateTo).toBe('2026-01-15');
    expect(item.notes).toBe('Daily batch');
  });

  it('should return empty items with no cursor when no settlements', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await listSettlements('tenant-1', {});

    expect(result.items).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('should handle nullable fields as null', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: 'settle-2',
        location_id: null,
        settlement_date: '2026-02-01',
        processor_name: 'Square',
        processor_batch_id: null,
        gross_amount: '500.00',
        fee_amount: '15.00',
        net_amount: '485.00',
        chargeback_amount: '0.00',
        status: 'pending',
        bank_account_id: null,
        bank_account_name: null,
        gl_journal_entry_id: null,
        import_source: 'manual',
        business_date_from: null,
        business_date_to: null,
        notes: null,
        created_at: '2026-02-01T09:00:00Z',
        total_lines: 0,
        matched_lines: 0,
        unmatched_lines: 0,
      },
    ]);

    const result = await listSettlements('tenant-1', {});
    const item = result.items[0]!;

    expect(item.locationId).toBeNull();
    expect(item.processorBatchId).toBeNull();
    expect(item.bankAccountId).toBeNull();
    expect(item.bankAccountName).toBeNull();
    expect(item.glJournalEntryId).toBeNull();
    expect(item.businessDateFrom).toBeNull();
    expect(item.businessDateTo).toBeNull();
    expect(item.notes).toBeNull();
  });

  it('should set hasMore and cursor when more results exist', async () => {
    // Default limit is 50, so return 51 items to trigger hasMore
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `settle-${String(i).padStart(3, '0')}`,
      location_id: null,
      settlement_date: '2026-01-15',
      processor_name: 'Stripe',
      processor_batch_id: null,
      gross_amount: '100.00',
      fee_amount: '3.00',
      net_amount: '97.00',
      chargeback_amount: '0.00',
      status: 'pending',
      bank_account_id: null,
      bank_account_name: null,
      gl_journal_entry_id: null,
      import_source: 'csv',
      business_date_from: null,
      business_date_to: null,
      notes: null,
      created_at: '2026-01-15T08:00:00Z',
      total_lines: 1,
      matched_lines: 0,
      unmatched_lines: 1,
    }));

    mockExecute.mockResolvedValueOnce(rows);

    const result = await listSettlements('tenant-1', {});

    expect(result.hasMore).toBe(true);
    expect(result.items.length).toBe(50);
    expect(result.cursor).toBe('settle-049');
  });
});

// =====================================================================
// 6. getSettlementDetail
// =====================================================================
describe('getSettlementDetail', () => {
  it('should return null when settlement not found', async () => {
    mockExecute.mockResolvedValueOnce([]); // header query returns nothing

    const result = await getSettlementDetail('tenant-1', 'nonexistent');

    expect(result).toBeNull();
  });

  it('should return SettlementDetailData with lines', async () => {
    // Call 1: header query
    mockExecute.mockResolvedValueOnce([
      {
        id: 'settle-1',
        location_id: 'loc-1',
        settlement_date: '2026-01-16',
        processor_name: 'Stripe',
        processor_batch_id: 'batch-001',
        gross_amount: '1500.00',
        fee_amount: '45.00',
        net_amount: '1455.00',
        chargeback_amount: '0.00',
        status: 'posted',
        bank_account_id: 'bank-1',
        bank_account_name: 'Main Checking',
        gl_journal_entry_id: 'je-1',
        import_source: 'csv',
        business_date_from: '2026-01-15',
        business_date_to: '2026-01-15',
        notes: 'Daily settlement',
        created_at: '2026-01-16T08:00:00Z',
        updated_at: '2026-01-16T09:00:00Z',
      },
    ]);
    // Call 2: lines query
    mockExecute.mockResolvedValueOnce([
      {
        id: 'psl-1',
        tender_id: 'tender-1',
        original_amount_cents: 5000,
        settled_amount_cents: 4850,
        fee_cents: 150,
        net_cents: 4850,
        status: 'matched',
        matched_at: '2026-01-16T08:30:00Z',
        tender_type: 'credit_card',
        tender_business_date: '2026-01-15',
        order_id: 'order-1',
        card_last4: '4242',
        card_brand: 'visa',
      },
      {
        id: 'psl-2',
        tender_id: null,
        original_amount_cents: 2000,
        settled_amount_cents: 1940,
        fee_cents: 60,
        net_cents: 1940,
        status: 'unmatched',
        matched_at: null,
        tender_type: null,
        tender_business_date: null,
        order_id: null,
        card_last4: null,
        card_brand: null,
      },
    ]);

    const result = await getSettlementDetail('tenant-1', 'settle-1');

    expect(result).not.toBeNull();
    expect(typeof result!.id).toBe('string');
    expect(typeof result!.settlementDate).toBe('string');
    expect(typeof result!.processorName).toBe('string');
    expect(typeof result!.grossAmount).toBe('number');
    expect(typeof result!.feeAmount).toBe('number');
    expect(typeof result!.netAmount).toBe('number');
    expect(typeof result!.chargebackAmount).toBe('number');
    expect(typeof result!.status).toBe('string');
    expect(typeof result!.importSource).toBe('string');
    expect(typeof result!.createdAt).toBe('string');
    expect(typeof result!.updatedAt).toBe('string');
    expect(Array.isArray(result!.lines)).toBe(true);
    expect(result!.lines.length).toBe(2);

    // Verify first line (matched)
    const line1 = result!.lines[0]!;
    expect(typeof line1.id).toBe('string');
    expect(typeof line1.tenderId).toBe('string');
    expect(typeof line1.originalAmountCents).toBe('number');
    expect(typeof line1.settledAmountCents).toBe('number');
    expect(typeof line1.feeCents).toBe('number');
    expect(typeof line1.netCents).toBe('number');
    expect(typeof line1.status).toBe('string');
    expect(typeof line1.matchedAt).toBe('string');
    expect(typeof line1.tenderType).toBe('string');
    expect(typeof line1.tenderBusinessDate).toBe('string');
    expect(typeof line1.orderId).toBe('string');
    expect(typeof line1.cardLast4).toBe('string');
    expect(typeof line1.cardBrand).toBe('string');

    // Verify second line (unmatched — all tender fields null)
    const line2 = result!.lines[1]!;
    expect(line2.tenderId).toBeNull();
    expect(line2.matchedAt).toBeNull();
    expect(line2.tenderType).toBeNull();
    expect(line2.tenderBusinessDate).toBeNull();
    expect(line2.orderId).toBeNull();
    expect(line2.cardLast4).toBeNull();
    expect(line2.cardBrand).toBeNull();
  });

  it('should return settlement with empty lines array', async () => {
    // Call 1: header query
    mockExecute.mockResolvedValueOnce([
      {
        id: 'settle-empty',
        location_id: null,
        settlement_date: '2026-02-01',
        processor_name: 'Square',
        processor_batch_id: null,
        gross_amount: '0.00',
        fee_amount: '0.00',
        net_amount: '0.00',
        chargeback_amount: '0.00',
        status: 'pending',
        bank_account_id: null,
        bank_account_name: null,
        gl_journal_entry_id: null,
        import_source: 'manual',
        business_date_from: null,
        business_date_to: null,
        notes: null,
        created_at: '2026-02-01T09:00:00Z',
        updated_at: '2026-02-01T09:00:00Z',
      },
    ]);
    // Call 2: no lines
    mockExecute.mockResolvedValueOnce([]);

    const result = await getSettlementDetail('tenant-1', 'settle-empty');

    expect(result).not.toBeNull();
    expect(result!.lines).toEqual([]);
    expect(result!.grossAmount).toBe(0);
    expect(result!.locationId).toBeNull();
  });
});

// =====================================================================
// 7. getSettlementStatusCounts
// =====================================================================
describe('getSettlementStatusCounts', () => {
  it('should return { total, unposted } with correct types', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 15, unposted: 3 }]);

    const result = await getSettlementStatusCounts('tenant-1', '2026-01');

    expect(result).toEqual({ total: 15, unposted: 3 });
    expect(typeof result.total).toBe('number');
    expect(typeof result.unposted).toBe('number');
  });

  it('should return zeroes when no settlements in period', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 0, unposted: 0 }]);

    const result = await getSettlementStatusCounts('tenant-1', '2026-03');

    expect(result.total).toBe(0);
    expect(result.unposted).toBe(0);
  });
});

// =====================================================================
// 8. getDrawerSessionStatus
// =====================================================================
describe('getDrawerSessionStatus', () => {
  it('should return { total, openCount } with correct types', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 8, open_count: 2 }]);

    const result = await getDrawerSessionStatus('tenant-1', '2026-01');

    expect(result).toEqual({ total: 8, openCount: 2 });
    expect(typeof result.total).toBe('number');
    expect(typeof result.openCount).toBe('number');
  });

  it('should return zeroes when no drawer sessions in period', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 0, open_count: 0 }]);

    const result = await getDrawerSessionStatus('tenant-1', '2026-03');

    expect(result.total).toBe(0);
    expect(result.openCount).toBe(0);
  });
});

// =====================================================================
// 9. getRetailCloseStatus
// =====================================================================
describe('getRetailCloseStatus', () => {
  it('should return { total, unposted } with correct types', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 12, unposted: 4 }]);

    const result = await getRetailCloseStatus('tenant-1', '2026-01');

    expect(result).toEqual({ total: 12, unposted: 4 });
    expect(typeof result.total).toBe('number');
    expect(typeof result.unposted).toBe('number');
  });

  it('should return zeroes when no close batches in period', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 0, unposted: 0 }]);

    const result = await getRetailCloseStatus('tenant-1', '2026-03');

    expect(result.total).toBe(0);
    expect(result.unposted).toBe(0);
  });
});

// =====================================================================
// 10. getCashOnHand
// =====================================================================
describe('getCashOnHand', () => {
  it('should return a number', async () => {
    mockExecute.mockResolvedValueOnce([{ cash_on_hand: 125000 }]);

    const result = await getCashOnHand('tenant-1', '2026-01-01', '2026-01-31');

    expect(typeof result).toBe('number');
    expect(result).toBe(125000);
  });

  it('should return 0 when no cash on hand', async () => {
    mockExecute.mockResolvedValueOnce([{ cash_on_hand: 0 }]);

    const result = await getCashOnHand('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toBe(0);
  });

  it('should accept optional locationId parameter', async () => {
    mockExecute.mockResolvedValueOnce([{ cash_on_hand: 50000 }]);

    const result = await getCashOnHand('tenant-1', '2026-01-01', '2026-01-31', 'loc-1');

    expect(typeof result).toBe('number');
    expect(result).toBe(50000);
  });
});

// =====================================================================
// 11. getOverShortTotal
// =====================================================================
describe('getOverShortTotal', () => {
  it('should return a number (positive for over)', async () => {
    mockExecute.mockResolvedValueOnce([{ over_short: 500 }]);

    const result = await getOverShortTotal('tenant-1', '2026-01-01', '2026-01-31');

    expect(typeof result).toBe('number');
    expect(result).toBe(500);
  });

  it('should return a negative number (short)', async () => {
    mockExecute.mockResolvedValueOnce([{ over_short: -300 }]);

    const result = await getOverShortTotal('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toBe(-300);
  });

  it('should return 0 when perfectly balanced', async () => {
    mockExecute.mockResolvedValueOnce([{ over_short: 0 }]);

    const result = await getOverShortTotal('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toBe(0);
  });

  it('should accept optional locationId parameter', async () => {
    mockExecute.mockResolvedValueOnce([{ over_short: 100 }]);

    const result = await getOverShortTotal('tenant-1', '2026-01-01', '2026-01-31', 'loc-1');

    expect(typeof result).toBe('number');
  });
});

// =====================================================================
// 12. getTipBalances
// =====================================================================
describe('getTipBalances', () => {
  it('should return TipBalanceRow[] with correct shape', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        employee_id: 'emp-1',
        employee_name: 'Jane Doe',
        total_tips_cents: 15000,
        total_paid_cents: 5000,
        balance_cents: 10000,
        last_tip_date: '2026-01-20',
        last_payout_date: '2026-01-18',
      },
      {
        employee_id: 'emp-2',
        employee_name: null,
        total_tips_cents: 8000,
        total_paid_cents: 0,
        balance_cents: 8000,
        last_tip_date: '2026-01-19',
        last_payout_date: null,
      },
    ]);

    const result = await getTipBalances('tenant-1', '2026-01-31');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);

    const row1 = result[0]!;
    expect(typeof row1.employeeId).toBe('string');
    expect(typeof row1.employeeName).toBe('string');
    expect(typeof row1.totalTipsCents).toBe('number');
    expect(typeof row1.totalPaidCents).toBe('number');
    expect(typeof row1.balanceCents).toBe('number');
    expect(typeof row1.lastTipDate).toBe('string');
    expect(typeof row1.lastPayoutDate).toBe('string');

    const row2 = result[1]!;
    expect(row2.employeeName).toBeNull();
    expect(row2.lastPayoutDate).toBeNull();
    expect(row2.totalPaidCents).toBe(0);
  });

  it('should return empty array when no tip balances', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getTipBalances('tenant-1', '2026-01-31');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('should accept optional locationId parameter', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getTipBalances('tenant-1', '2026-01-31', 'loc-1');

    expect(Array.isArray(result)).toBe(true);
  });
});

// =====================================================================
// 13. listTipPayouts
// =====================================================================
describe('listTipPayouts', () => {
  it('should return TipPayoutListResult with correct shape', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: 'payout-1',
        location_id: 'loc-1',
        employee_id: 'emp-1',
        employee_name: 'John Smith',
        payout_type: 'cash',
        amount_cents: 5000,
        business_date: '2026-01-20',
        drawer_session_id: 'ds-1',
        payroll_period: null,
        status: 'completed',
        approved_by: 'mgr-1',
        gl_journal_entry_id: 'je-1',
        notes: 'End of shift payout',
        created_at: '2026-01-20T22:00:00Z',
      },
    ]);

    const result = await listTipPayouts('tenant-1', {});

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('cursor');
    expect(result).toHaveProperty('hasMore');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();

    const item = result.items[0]!;
    expect(typeof item.id).toBe('string');
    expect(typeof item.locationId).toBe('string');
    expect(typeof item.employeeId).toBe('string');
    expect(typeof item.employeeName).toBe('string');
    expect(typeof item.payoutType).toBe('string');
    expect(typeof item.amountCents).toBe('number');
    expect(typeof item.businessDate).toBe('string');
    expect(typeof item.drawerSessionId).toBe('string');
    expect(item.payrollPeriod).toBeNull();
    expect(typeof item.status).toBe('string');
    expect(typeof item.approvedBy).toBe('string');
    expect(typeof item.glJournalEntryId).toBe('string');
    expect(typeof item.notes).toBe('string');
    expect(typeof item.createdAt).toBe('string');
  });

  it('should return empty items when no payouts', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await listTipPayouts('tenant-1', {});

    expect(result.items).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('should handle nullable fields as null', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: 'payout-2',
        location_id: 'loc-1',
        employee_id: 'emp-2',
        employee_name: null,
        payout_type: 'payroll',
        amount_cents: 8000,
        business_date: '2026-01-25',
        drawer_session_id: null,
        payroll_period: '2026-W04',
        status: 'pending',
        approved_by: null,
        gl_journal_entry_id: null,
        notes: null,
        created_at: '2026-01-25T10:00:00Z',
      },
    ]);

    const result = await listTipPayouts('tenant-1', {});
    const item = result.items[0]!;

    expect(item.employeeName).toBeNull();
    expect(item.drawerSessionId).toBeNull();
    expect(item.approvedBy).toBeNull();
    expect(item.glJournalEntryId).toBeNull();
    expect(item.notes).toBeNull();
    expect(item.payrollPeriod).toBe('2026-W04');
  });

  it('should set hasMore and cursor when more results exist', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `payout-${String(i).padStart(3, '0')}`,
      location_id: 'loc-1',
      employee_id: 'emp-1',
      employee_name: 'Test',
      payout_type: 'cash',
      amount_cents: 1000,
      business_date: '2026-01-20',
      drawer_session_id: null,
      payroll_period: null,
      status: 'completed',
      approved_by: null,
      gl_journal_entry_id: null,
      notes: null,
      created_at: '2026-01-20T22:00:00Z',
    }));

    mockExecute.mockResolvedValueOnce(rows);

    const result = await listTipPayouts('tenant-1', {});

    expect(result.hasMore).toBe(true);
    expect(result.items.length).toBe(50);
    expect(result.cursor).toBe('payout-049');
  });
});

// =====================================================================
// 14. getPendingTipCount
// =====================================================================
describe('getPendingTipCount', () => {
  it('should return a number', async () => {
    mockExecute.mockResolvedValueOnce([{ count: 7 }]);

    const result = await getPendingTipCount('tenant-1', '2026-01');

    expect(typeof result).toBe('number');
    expect(result).toBe(7);
  });

  it('should return 0 when no pending tips', async () => {
    mockExecute.mockResolvedValueOnce([{ count: 0 }]);

    const result = await getPendingTipCount('tenant-1', '2026-01');

    expect(result).toBe(0);
  });
});

// =====================================================================
// 15. getOutstandingTipsCents
// =====================================================================
describe('getOutstandingTipsCents', () => {
  it('should return a number', async () => {
    mockExecute.mockResolvedValueOnce([{ outstanding: 25000 }]);

    const result = await getOutstandingTipsCents('tenant-1', '2026-01-01', '2026-01-31');

    expect(typeof result).toBe('number');
    expect(result).toBe(25000);
  });

  it('should return 0 when no outstanding tips', async () => {
    mockExecute.mockResolvedValueOnce([{ outstanding: 0 }]);

    const result = await getOutstandingTipsCents('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toBe(0);
  });

  it('should clamp negative values to 0', async () => {
    // This can happen if payouts exceed tips (edge case)
    mockExecute.mockResolvedValueOnce([{ outstanding: -500 }]);

    const result = await getOutstandingTipsCents('tenant-1', '2026-01-01', '2026-01-31');

    expect(result).toBe(0);
  });

  it('should accept optional locationId parameter', async () => {
    mockExecute.mockResolvedValueOnce([{ outstanding: 10000 }]);

    const result = await getOutstandingTipsCents('tenant-1', '2026-01-01', '2026-01-31', 'loc-1');

    expect(typeof result).toBe('number');
  });
});

// =====================================================================
// 16. getDepositStatus
// =====================================================================
describe('getDepositStatus', () => {
  it('should return { total, unreconciled } with correct types', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 20, unreconciled: 5 }]);

    const result = await getDepositStatus('tenant-1', '2026-01');

    expect(result).toEqual({ total: 20, unreconciled: 5 });
    expect(typeof result.total).toBe('number');
    expect(typeof result.unreconciled).toBe('number');
  });

  it('should return zeroes when no deposits in period', async () => {
    mockExecute.mockResolvedValueOnce([{ total: 0, unreconciled: 0 }]);

    const result = await getDepositStatus('tenant-1', '2026-03');

    expect(result.total).toBe(0);
    expect(result.unreconciled).toBe(0);
  });
});

// =====================================================================
// 17. getLocationCloseStatus
// =====================================================================
describe('getLocationCloseStatus', () => {
  it('should return LocationCloseStatusData with correct shape', async () => {
    // Call 1: terminal query
    mockExecute.mockResolvedValueOnce([
      {
        terminal_id: 'term-1',
        terminal_name: 'Register 1',
        drawer_session_status: 'closed',
        close_batch_status: 'posted',
        close_batch_id: 'rcb-1',
      },
      {
        terminal_id: 'term-2',
        terminal_name: 'Register 2',
        drawer_session_status: 'closed',
        close_batch_status: 'locked',
        close_batch_id: 'rcb-2',
      },
    ]);
    // Call 2: F&B close batch
    mockExecute.mockResolvedValueOnce([
      { id: 'fnb-batch-1', status: 'posted' },
    ]);
    // Call 3: deposit slip
    mockExecute.mockResolvedValueOnce([
      { id: 'deposit-1', status: 'pending' },
    ]);

    const result = await getLocationCloseStatus('tenant-1', 'loc-1', '2026-01-15');

    expect(typeof result.locationId).toBe('string');
    expect(result.locationId).toBe('loc-1');
    expect(typeof result.businessDate).toBe('string');
    expect(result.businessDate).toBe('2026-01-15');
    expect(Array.isArray(result.retailTerminals)).toBe(true);
    expect(result.retailTerminals.length).toBe(2);

    // Verify terminal shape
    const term1 = result.retailTerminals[0]!;
    expect(typeof term1.terminalId).toBe('string');
    expect(typeof term1.terminalName).toBe('string');
    expect(typeof term1.drawerSessionStatus).toBe('string');
    expect(typeof term1.closeBatchStatus).toBe('string');
    expect(typeof term1.closeBatchId).toBe('string');

    // F&B batch
    expect(typeof result.fnbBatchStatus).toBe('string');
    expect(result.fnbBatchStatus).toBe('posted');
    expect(typeof result.fnbBatchId).toBe('string');
    expect(result.fnbBatchId).toBe('fnb-batch-1');

    // Deposit slip
    expect(typeof result.depositSlipId).toBe('string');
    expect(result.depositSlipId).toBe('deposit-1');
    expect(typeof result.depositSlipStatus).toBe('string');
    expect(result.depositSlipStatus).toBe('pending');

    // Computed booleans
    expect(typeof result.allTerminalsClosed).toBe('boolean');
    expect(result.allTerminalsClosed).toBe(true); // both posted/locked
    expect(typeof result.fnbClosed).toBe('boolean');
    expect(result.fnbClosed).toBe(true); // posted
    expect(typeof result.depositReady).toBe('boolean');
    expect(result.depositReady).toBe(true); // all closed + fnb closed
  });

  it('should handle no terminals, no F&B, no deposit (empty location)', async () => {
    // Call 1: no terminals
    mockExecute.mockResolvedValueOnce([]);
    // Call 2: no F&B batch
    mockExecute.mockResolvedValueOnce([]);
    // Call 3: no deposit
    mockExecute.mockResolvedValueOnce([]);

    const result = await getLocationCloseStatus('tenant-1', 'loc-2', '2026-01-15');

    expect(result.retailTerminals).toEqual([]);
    expect(result.fnbBatchStatus).toBeNull();
    expect(result.fnbBatchId).toBeNull();
    expect(result.depositSlipId).toBeNull();
    expect(result.depositSlipStatus).toBeNull();
    // No terminals = allTerminalsClosed is true (vacuous truth)
    expect(result.allTerminalsClosed).toBe(true);
    // No fnb batch = fnbClosed is true (nothing to close)
    expect(result.fnbClosed).toBe(true);
    expect(result.depositReady).toBe(true);
  });

  it('should set allTerminalsClosed to false when a terminal is still open', async () => {
    // Call 1: one posted, one open
    mockExecute.mockResolvedValueOnce([
      {
        terminal_id: 'term-1',
        terminal_name: 'Register 1',
        drawer_session_status: 'closed',
        close_batch_status: 'posted',
        close_batch_id: 'rcb-1',
      },
      {
        terminal_id: 'term-2',
        terminal_name: 'Register 2',
        drawer_session_status: 'open',
        close_batch_status: 'open',
        close_batch_id: 'rcb-2',
      },
    ]);
    // Call 2: no F&B
    mockExecute.mockResolvedValueOnce([]);
    // Call 3: no deposit
    mockExecute.mockResolvedValueOnce([]);

    const result = await getLocationCloseStatus('tenant-1', 'loc-1', '2026-01-15');

    expect(result.allTerminalsClosed).toBe(false);
    expect(result.depositReady).toBe(false);
  });

  it('should set fnbClosed to false when F&B batch is not posted', async () => {
    // Call 1: no terminals
    mockExecute.mockResolvedValueOnce([]);
    // Call 2: F&B batch still open
    mockExecute.mockResolvedValueOnce([
      { id: 'fnb-batch-2', status: 'in_progress' },
    ]);
    // Call 3: no deposit
    mockExecute.mockResolvedValueOnce([]);

    const result = await getLocationCloseStatus('tenant-1', 'loc-1', '2026-01-15');

    expect(result.fnbBatchStatus).toBe('in_progress');
    expect(result.fnbClosed).toBe(false);
    expect(result.depositReady).toBe(false);
  });

  it('should handle nullable terminal fields', async () => {
    // Call 1: terminal with no drawer session and no close batch
    mockExecute.mockResolvedValueOnce([
      {
        terminal_id: 'term-1',
        terminal_name: null,
        drawer_session_status: null,
        close_batch_status: null,
        close_batch_id: null,
      },
    ]);
    // Call 2: no F&B
    mockExecute.mockResolvedValueOnce([]);
    // Call 3: no deposit
    mockExecute.mockResolvedValueOnce([]);

    const result = await getLocationCloseStatus('tenant-1', 'loc-1', '2026-01-15');

    const term = result.retailTerminals[0]!;
    expect(term.terminalName).toBeNull();
    expect(term.drawerSessionStatus).toBeNull();
    expect(term.closeBatchStatus).toBeNull();
    expect(term.closeBatchId).toBeNull();
    // No close batch status = not closed
    expect(result.allTerminalsClosed).toBe(false);
  });
});
