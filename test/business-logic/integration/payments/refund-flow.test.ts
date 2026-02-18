/**
 * Phase 1B — Refund & Reversal Integration Tests
 *
 * Tests tender reversal flows against a real Postgres database.
 * INVARIANT: totalReversed <= totalTendered
 * INVARIANT: For voided orders: net paid = 0 (all tenders reversed)
 *
 * Tenders are APPEND-ONLY — financial fields are never updated.
 * "Reversed" is a derived state from tender_reversals join.
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestTender,
  createTestTenderReversal,
  type TestTenantData,
} from '../../factories';
import { expectPaymentReconciled, expectExactMoney } from '../../assertions';

describe('Refund & Reversal Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Full Void ──

  it('full void: all tenders reversed, net = 0', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'voided',
      subtotal: 2000, taxTotal: 170, total: 2170,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2000, lineSubtotal: 2000, lineTax: 170, lineTotal: 2170,
    });

    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 2170,
    });
    await createTestTenderReversal(t.tenantId, orderId, tenderId, {
      reversalType: 'void',
      amount: 2170,
      reason: 'Order voided',
    });

    // Net paid should be 0
    const tenderRows = await adminDb.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::int AS total_tendered
      FROM tenders WHERE order_id = ${orderId} AND status = 'captured'
    `);
    const reversalRows = await adminDb.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::int AS total_reversed
      FROM tender_reversals WHERE order_id = ${orderId} AND status = 'completed'
    `);

    const netPaid = Number((tenderRows as any[])[0]!.total_tendered) -
                    Number((reversalRows as any[])[0]!.total_reversed);
    expectExactMoney(netPaid, 0, 'voided order net paid');
  });

  // ── Full Void with Multiple Tenders ──

  it('void with split payment: all tenders reversed', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'voided',
      subtotal: 3000, taxTotal: 255, total: 3255,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 3000, lineSubtotal: 3000, lineTax: 255, lineTotal: 3255,
    });

    const tender1 = await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'cash', tenderSequence: 1, amount: 1500,
    });
    const tender2 = await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card', tenderSequence: 2, amount: 1755,
    });

    await createTestTenderReversal(t.tenantId, orderId, tender1, {
      reversalType: 'void', amount: 1500,
    });
    await createTestTenderReversal(t.tenantId, orderId, tender2, {
      reversalType: 'void', amount: 1755,
    });

    // Verify all reversed
    const rows = await adminDb.execute(sql`
      SELECT
        COALESCE(SUM(t.amount), 0)::int AS tendered,
        COALESCE((SELECT SUM(amount) FROM tender_reversals WHERE order_id = ${orderId} AND status = 'completed'), 0)::int AS reversed
      FROM tenders t WHERE t.order_id = ${orderId} AND t.status = 'captured'
    `);
    const result = (rows as any[])[0]!;
    expectExactMoney(Number(result.tendered), Number(result.reversed), 'tendered = reversed');
  });

  // ── Partial Refund ──

  it('partial refund: reversal < tender amount', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 5000, taxTotal: 425, total: 5425,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });

    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 5425,
    });

    // Refund $10.00 of $54.25
    await createTestTenderReversal(t.tenantId, orderId, tenderId, {
      reversalType: 'refund',
      amount: 1000,
      reason: 'Item returned',
    });

    const rows = await adminDb.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::int AS reversed
      FROM tender_reversals WHERE order_id = ${orderId} AND status = 'completed'
    `);
    const reversed = Number((rows as any[])[0]!.reversed);
    expect(reversed).toBeLessThan(5425);
    expect(reversed).toBe(1000);
  });

  // ── INVARIANT: reversal never exceeds tender ──

  it('INVARIANT: total reversed <= total tendered', async () => {
    // Create order with tender and partial reversal
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 2000, total: 2000,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2000, lineSubtotal: 2000, lineTax: 0, lineTotal: 2000,
    });
    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 2000,
    });
    await createTestTenderReversal(t.tenantId, orderId, tenderId, {
      amount: 500,
    });

    // Verify across all test orders
    const rows = await adminDb.execute(sql`
      SELECT
        t.order_id,
        COALESCE(SUM(t.amount), 0)::int AS tendered,
        COALESCE(
          (SELECT SUM(tr.amount) FROM tender_reversals tr
           WHERE tr.order_id = t.order_id AND tr.status = 'completed'),
          0
        )::int AS reversed
      FROM tenders t
      WHERE t.tenant_id = ${t.tenantId} AND t.status = 'captured'
      GROUP BY t.order_id
    `);
    for (const row of rows as any[]) {
      expect(Number(row.reversed)).toBeLessThanOrEqual(Number(row.tendered));
    }
  });

  // ── Reversal References Original Tender ──

  it('reversal references its original tender', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'voided',
      subtotal: 1000, total: 1000,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1000, lineSubtotal: 1000, lineTax: 0, lineTotal: 1000,
    });
    const tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 1000,
    });
    const reversalId = await createTestTenderReversal(t.tenantId, orderId, tenderId, {
      amount: 1000,
    });

    const rows = await adminDb.execute(sql`
      SELECT original_tender_id FROM tender_reversals WHERE id = ${reversalId}
    `);
    expect((rows as any[])[0]!.original_tender_id).toBe(tenderId);
  });
});
