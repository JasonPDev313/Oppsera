/**
 * Phase 1B — Split Payment Integration Tests
 *
 * Verifies multi-tender payment scenarios against a real Postgres database.
 * INVARIANT: sum(tender.amount) = order.total for paid orders
 * INVARIANT: tenderSequence is monotonically increasing per order
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestTender,
  type TestTenantData,
} from '../../factories';
import { expectPaymentReconciled, expectExactMoney } from '../../assertions';

describe('Split Payment Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Two-Way Split ──

  it('two tenders sum to order total', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 2000, taxTotal: 170, total: 2170,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2000, lineSubtotal: 2000, lineTax: 170, lineTotal: 2170,
    });

    // Split: $10 cash + $11.70 card
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'cash', tenderSequence: 1, amount: 1000,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card', tenderSequence: 2, amount: 1170,
    });

    await expectPaymentReconciled(orderId);

    // Verify sum
    const rows = await adminDb.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::int AS total_tendered
      FROM tenders WHERE order_id = ${orderId} AND status = 'captured'
    `);
    expectExactMoney(Number((rows as any[])[0]!.total_tendered), 2170, 'sum(tender.amount)');
  });

  // ── Three-Way Split ──

  it('three tenders sum to order total', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 3000, taxTotal: 255, total: 3255,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 3000, lineSubtotal: 3000, lineTax: 255, lineTotal: 3255,
    });

    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'cash', tenderSequence: 1, amount: 1000,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card', tenderSequence: 2, amount: 1000,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'gift_card', tenderSequence: 3, amount: 1255,
    });

    await expectPaymentReconciled(orderId);
  });

  // ── Mixed Types with Tip ──

  it('split payment with tip on card tender', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 5000, taxTotal: 425, total: 5425,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });

    // Cash: $20.00 (no tip)
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'cash', tenderSequence: 1, amount: 2000,
    });
    // Card: $34.25 + $5.00 tip
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card', tenderSequence: 2, amount: 3425, tipAmount: 500,
    });

    // Payment reconciles (tip excluded from order.total)
    await expectPaymentReconciled(orderId);

    // Total tips = $5.00
    const tipRows = await adminDb.execute(sql`
      SELECT COALESCE(SUM(tip_amount), 0)::int AS total_tips
      FROM tenders WHERE order_id = ${orderId}
    `);
    expectExactMoney(Number((tipRows as any[])[0]!.total_tips), 500, 'total tips');
  });

  // ── Odd Split (Rounding) ──

  it('odd split handles rounding: $10.01 split two ways', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 1001, taxTotal: 0, total: 1001,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1001, lineSubtotal: 1001, lineTax: 0, lineTotal: 1001,
    });

    // $5.00 + $5.01 = $10.01
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'cash', tenderSequence: 1, amount: 500,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'cash', tenderSequence: 2, amount: 501,
    });

    await expectPaymentReconciled(orderId);
  });

  // ── Partial Payment (Not Yet Paid) ──

  it('partial payment: net paid < order.total', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'placed', // Not yet paid
      subtotal: 5000, taxTotal: 425, total: 5425,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });

    // Only $20.00 tendered so far
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderSequence: 1, amount: 2000,
    });

    // Should not throw — partial is valid for non-paid orders
    await expectPaymentReconciled(orderId);
  });

  // ── Sequence Ordering ──

  it('tender sequences are monotonically increasing', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid', subtotal: 3000, total: 3000,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 3000, lineSubtotal: 3000, lineTax: 0, lineTotal: 3000,
    });

    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderSequence: 1, amount: 1000,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderSequence: 2, amount: 1000,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderSequence: 3, amount: 1000,
    });

    const rows = await adminDb.execute(sql`
      SELECT tender_sequence FROM tenders
      WHERE order_id = ${orderId}
      ORDER BY tender_sequence
    `);
    const seqs = (rows as any[]).map((r: any) => Number(r.tender_sequence));
    expect(seqs).toEqual([1, 2, 3]);
  });
});
