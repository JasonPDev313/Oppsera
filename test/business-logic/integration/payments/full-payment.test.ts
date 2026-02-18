/**
 * Phase 1B — Full Payment Integration Tests
 *
 * Verifies payment reconciliation against a real Postgres database.
 * INVARIANT: For paid orders: sum(tender.amount) - sum(reversal.amount) = order.total
 * INVARIANT: Tip does NOT affect order.total (stored on tender only)
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

describe('Full Payment Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Exact Payment ──

  it('exact cash payment reconciles', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 1000, taxTotal: 85, total: 1085,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1000, lineSubtotal: 1000, lineTax: 85, lineTotal: 1085,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 1085,
      amountGiven: 1085,
      changeGiven: 0,
    });

    await expectPaymentReconciled(orderId);
  });

  // ── Overpayment (Cash) ──

  it('overpayment: tender.amount = order.total, change returned', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 999, taxTotal: 85, total: 1084,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 999, lineSubtotal: 999, lineTax: 85, lineTotal: 1084,
    });

    // Customer gives $20.00, change = $20.00 - $10.84 = $9.16
    // But tender.amount = order.total (the applied amount)
    await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 1084,
      amountGiven: 2000,
      changeGiven: 916,
    });

    await expectPaymentReconciled(orderId);

    // Verify change calculation
    const rows = await adminDb.execute(sql`
      SELECT amount, amount_given, change_given FROM tenders WHERE order_id = ${orderId}
    `);
    const tender = (rows as any[])[0]!;
    expectExactMoney(
      Number(tender.amount_given) - Number(tender.change_given),
      Number(tender.amount),
      'amountGiven - changeGiven = amount',
    );
  });

  // ── Tip Does Not Affect Order Total ──

  it('tip is stored on tender, not added to order.total', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 2500, taxTotal: 213, total: 2713,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2500, lineSubtotal: 2500, lineTax: 213, lineTotal: 2713,
    });

    // $27.13 order + $5.00 tip
    await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 2713,
      tipAmount: 500,
      amountGiven: 3213, // amount + tip
    });

    // Order total unchanged
    const orderRows = await adminDb.execute(sql`
      SELECT total FROM orders WHERE id = ${orderId}
    `);
    expectExactMoney(Number((orderRows as any[])[0]!.total), 2713, 'order.total excludes tip');

    // Tender carries the tip
    const tenderRows = await adminDb.execute(sql`
      SELECT tip_amount FROM tenders WHERE order_id = ${orderId}
    `);
    expectExactMoney(Number((tenderRows as any[])[0]!.tip_amount), 500, 'tender.tipAmount');

    await expectPaymentReconciled(orderId);
  });

  // ── Multiple Tender Types ──

  it('card payment reconciles', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 5000, taxTotal: 425, total: 5425,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card',
      amount: 5425,
    });

    await expectPaymentReconciled(orderId);
  });

  // ── Large Order ──

  it('large order ($999.99) payment reconciles', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 99999, taxTotal: 8500, total: 108499,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 99999, lineSubtotal: 99999, lineTax: 8500, lineTotal: 108499,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      tenderType: 'card',
      amount: 108499,
    });

    await expectPaymentReconciled(orderId);
  });

  // ── $0.01 Minimum ──

  it('minimum order ($0.01) payment reconciles', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 1, taxTotal: 0, total: 1,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1, lineSubtotal: 1, lineTax: 0, lineTotal: 1,
    });
    await createTestTender(t.tenantId, t.locationId, orderId, {
      amount: 1,
    });

    await expectPaymentReconciled(orderId);
  });
});
