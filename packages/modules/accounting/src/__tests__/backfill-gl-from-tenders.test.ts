import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const handleTenderForAccounting = vi.fn();
  const ensureAccountingSettings = vi.fn().mockResolvedValue({ created: false, autoWired: 0 });
  return { handleTenderForAccounting, ensureAccountingSettings };
});

vi.mock('@oppsera/db/schema/accounting', () => ({
  glUnmappedEvents: { tenantId: 'tenant_id', eventType: 'event_type' },
}));

vi.mock('../adapters/pos-posting-adapter', () => ({
  handleTenderForAccounting: mocks.handleTenderForAccounting,
}));

vi.mock('../helpers/ensure-accounting-settings', () => ({
  ensureAccountingSettings: mocks.ensureAccountingSettings,
}));

import { backfillGlFromTenders } from '../commands/backfill-gl-from-tenders';

/**
 * Builds a mock Database object whose execute() returns results in sequence.
 * Also provides insert().values().onConflictDoNothing() for error logging.
 */
function buildMockDb(executeResults: unknown[]) {
  const execute = vi.fn();
  for (const r of executeResults) {
    execute.mockResolvedValueOnce(r);
  }

  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });

  return { execute, insert, _values: values, _onConflictDoNothing: onConflictDoNothing };
}

/** A minimal unposted tender row from the SQL query */
function makeTenderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tender_id: 'tender-1',
    order_id: 'order-1',
    tender_type: 'cash',
    amount: 1000,
    tip_amount: 0,
    business_date: '2026-01-15',
    location_id: 'loc-1',
    terminal_id: null,
    tender_sequence: 1,
    surcharge_amount_cents: 0,
    order_total: 1000,
    subtotal: 900,
    tax_total: 100,
    discount_total: 0,
    service_charge_total: 0,
    customer_id: null,
    ...overrides,
  };
}

describe('backfillGlFromTenders — posted counter behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return early with zeros when no unposted tenders exist', async () => {
    const db = buildMockDb([
      [{ total_unposted: 0 }], // count query
    ]);

    const result = await backfillGlFromTenders(db as any, 'tenant-1');

    expect(result.posted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.totalUnposted).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.lastProcessedTenderId).toBeNull();
  });

  it('should increment posted counter after successful handleTenderForAccounting call (adapter no-op counts as posted)', async () => {
    const tenderRow = makeTenderRow();
    // handleTenderForAccounting resolves without returning a value — simulates adapter no-op
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);

    const db = buildMockDb([
      [{ total_unposted: 1 }],    // count query
      [tenderRow],                 // unposted tenders
      [{ order_id: 'order-1', total_tendered: 1000 }], // tender totals
      [],                          // order lines
      [],                          // order discounts
    ]);

    const result = await backfillGlFromTenders(db as any, 'tenant-1');

    expect(mocks.handleTenderForAccounting).toHaveBeenCalledOnce();
    expect(result.posted).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.lastProcessedTenderId).toBe('tender-1');
  });

  it('should increment posted for each non-throwing call across multiple tenders', async () => {
    const tender1 = makeTenderRow({ tender_id: 'tender-1', order_id: 'order-1' });
    const tender2 = makeTenderRow({ tender_id: 'tender-2', order_id: 'order-2' });
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);

    const db = buildMockDb([
      [{ total_unposted: 2 }],  // count query
      [tender1, tender2],        // unposted tenders
      [                          // tender totals
        { order_id: 'order-1', total_tendered: 1000 },
        { order_id: 'order-2', total_tendered: 500 },
      ],
      [],                        // order lines
      [],                        // order discounts
    ]);

    const result = await backfillGlFromTenders(db as any, 'tenant-1');

    expect(mocks.handleTenderForAccounting).toHaveBeenCalledTimes(2);
    expect(result.posted).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.lastProcessedTenderId).toBe('tender-2');
  });

  it('should count error and NOT increment posted when handleTenderForAccounting throws', async () => {
    const tenderRow = makeTenderRow();
    mocks.handleTenderForAccounting.mockRejectedValue(new Error('GL adapter error'));

    const db = buildMockDb([
      [{ total_unposted: 1 }],  // count query
      [tenderRow],               // unposted tenders
      [{ order_id: 'order-1', total_tendered: 1000 }], // tender totals
      [],                        // order lines
      [],                        // order discounts
    ]);

    const result = await backfillGlFromTenders(db as any, 'tenant-1');

    expect(result.posted).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.failedTenders).toHaveLength(1);
    expect(result.failedTenders[0]!.tenderId).toBe('tender-1');
    expect(result.failedTenders[0]!.message).toBe('GL adapter error');
  });

  it('should handle mixed success and failure: posted increments only for non-throwing calls', async () => {
    const tender1 = makeTenderRow({ tender_id: 'tender-1', order_id: 'order-1' });
    const tender2 = makeTenderRow({ tender_id: 'tender-2', order_id: 'order-2' });
    const tender3 = makeTenderRow({ tender_id: 'tender-3', order_id: 'order-3' });

    mocks.handleTenderForAccounting
      .mockResolvedValueOnce(undefined)          // tender-1: success (no-op)
      .mockRejectedValueOnce(new Error('fail'))  // tender-2: error
      .mockResolvedValueOnce(undefined);         // tender-3: success

    const db = buildMockDb([
      [{ total_unposted: 3 }],
      [tender1, tender2, tender3],
      [
        { order_id: 'order-1', total_tendered: 1000 },
        { order_id: 'order-2', total_tendered: 500 },
        { order_id: 'order-3', total_tendered: 750 },
      ],
      [],
      [],
    ]);

    const result = await backfillGlFromTenders(db as any, 'tenant-1');

    expect(result.posted).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failedTenders[0]!.tenderId).toBe('tender-2');
  });

  it('should include enriched order lines in the synthetic event passed to handleTenderForAccounting', async () => {
    const tenderRow = makeTenderRow();
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);

    const db = buildMockDb([
      [{ total_unposted: 1 }],
      [tenderRow],
      [{ order_id: 'order-1', total_tendered: 1000 }],
      [  // order lines
        {
          order_id: 'order-1',
          catalog_item_id: 'item-1',
          catalog_item_name: 'Widget A',
          sub_department_id: 'subdept-1',
          qty: '2.0000',
          line_subtotal: 900,
          tax_group_id: 'tax-1',
          line_tax: 100,
          cost_price: 400,
          package_components: null,
          price_override_discount_cents: 0,
        },
      ],
      [],  // discounts
    ]);

    await backfillGlFromTenders(db as any, 'tenant-1');

    expect(mocks.handleTenderForAccounting).toHaveBeenCalledOnce();
    const calledWith = mocks.handleTenderForAccounting.mock.calls[0]![0] as any;
    expect(calledWith.data.lines).toHaveLength(1);
    expect(calledWith.data.lines[0].subDepartmentId).toBe('subdept-1');
    expect(calledWith.data.lines[0].taxGroupId).toBe('tax-1');
    expect(calledWith.data.lines[0].catalogItemId).toBe('item-1');
    expect(calledWith.data.lines[0].costCents).toBe(400);
  });

  it('should set hasMore=true when unposted batch equals limit', async () => {
    const limit = 2;
    const tender1 = makeTenderRow({ tender_id: 'tender-1', order_id: 'order-1' });
    const tender2 = makeTenderRow({ tender_id: 'tender-2', order_id: 'order-2' });
    mocks.handleTenderForAccounting.mockResolvedValue(undefined);

    const db = buildMockDb([
      [{ total_unposted: 5 }],      // more exist than the limit
      [tender1, tender2],            // exactly `limit` returned
      [
        { order_id: 'order-1', total_tendered: 1000 },
        { order_id: 'order-2', total_tendered: 500 },
      ],
      [],
      [],
    ]);

    const result = await backfillGlFromTenders(db as any, 'tenant-1', { limit });

    expect(result.hasMore).toBe(true);
    expect(result.lastProcessedTenderId).toBe('tender-2');
  });
});
