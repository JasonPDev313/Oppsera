/**
 * Phase 1B — Order Creation Integration Tests
 *
 * Verifies order data integrity against a real Postgres database.
 * Tests invariants:
 *   subtotal = sum(lineSubtotal)
 *   taxTotal = sum(lineTax) + sum(chargeTaxAmount)
 *   total = sum(lineTotal) + serviceChargeTotal + serviceChargeTax - discountTotal + roundingAdjustment
 *   total >= 0 always
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestOrderDiscount,
  createTestServiceCharge,
  type TestTenantData,
} from '../../factories';
import { expectOrderBalanced, expectExactMoney, expectNonNegativeMoney } from '../../assertions';

describe('Order Creation Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Single Line ──

  it('single line order is balanced', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 1000,
      taxTotal: 85,
      total: 1085,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1000,
      lineSubtotal: 1000,
      lineTax: 85,
      lineTotal: 1085,
    });
    await expectOrderBalanced(orderId);
  });

  // ── Multi-Line ──

  it('multi-line order sums correctly', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 2498,
      taxTotal: 212,
      total: 2710,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 999, lineSubtotal: 999, lineTax: 85, lineTotal: 1084,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1499, lineSubtotal: 1499, lineTax: 127, lineTotal: 1626,
    });
    await expectOrderBalanced(orderId);
  });

  it('10-line order sums correctly', async () => {
    // 10 × $9.99 items with $0.85 tax each
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 9990,
      taxTotal: 850,
      total: 10840,
    });
    for (let i = 0; i < 10; i++) {
      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 999, lineSubtotal: 999, lineTax: 85, lineTotal: 1084,
        sortOrder: i,
      });
    }
    await expectOrderBalanced(orderId);
  });

  // ── With Discount ──

  it('order with fixed discount is balanced', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 2000,
      taxTotal: 170,
      discountTotal: 200,
      total: 1970,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2000, lineSubtotal: 2000, lineTax: 170, lineTotal: 2170,
    });
    await createTestOrderDiscount(t.tenantId, orderId, {
      type: 'fixed', value: 200, amount: 200,
    });
    await expectOrderBalanced(orderId);
  });

  it('stacked discounts are balanced', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 2000,
      taxTotal: 170,
      discountTotal: 300,
      total: 1870,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 2000, lineSubtotal: 2000, lineTax: 170, lineTotal: 2170,
    });
    await createTestOrderDiscount(t.tenantId, orderId, { amount: 200 });
    await createTestOrderDiscount(t.tenantId, orderId, { amount: 100 });
    await expectOrderBalanced(orderId);
  });

  it('discount exceeding total clamps to zero', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 100,
      taxTotal: 9,
      discountTotal: 500,
      total: 0, // max(0, 109 - 500) = 0
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 100, lineSubtotal: 100, lineTax: 9, lineTotal: 109,
    });
    await createTestOrderDiscount(t.tenantId, orderId, { amount: 500 });
    await expectOrderBalanced(orderId);
  });

  // ── With Service Charge ──

  it('order with service charge is balanced', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 5000,
      taxTotal: 425,
      serviceChargeTotal: 900,
      total: 6325, // 5425 + 900
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });
    await createTestServiceCharge(t.tenantId, orderId, { amount: 900 });
    await expectOrderBalanced(orderId);
  });

  it('taxable service charge adds to taxTotal', async () => {
    // 18% charge on $50: $9.00 charge + $0.77 tax on charge
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 5000,
      taxTotal: 502, // 425 line tax + 77 charge tax
      serviceChargeTotal: 900,
      total: 6402, // 5425 + 900 + 77
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });
    await createTestServiceCharge(t.tenantId, orderId, {
      amount: 900, isTaxable: true, taxAmount: 77,
    });
    await expectOrderBalanced(orderId);
  });

  // ── Combined ──

  it('full order: lines + charge + discount is balanced', async () => {
    // 2 items: $10 + $15 = $25 subtotal, $2.13 tax, $4.50 charge, $2.50 discount
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 2500,
      taxTotal: 213,
      serviceChargeTotal: 450,
      discountTotal: 250,
      total: 2913, // (1085 + 1628) + 450 - 250
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1000, lineSubtotal: 1000, lineTax: 85, lineTotal: 1085,
    });
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 1500, lineSubtotal: 1500, lineTax: 128, lineTotal: 1628,
    });
    await createTestServiceCharge(t.tenantId, orderId, { amount: 450 });
    await createTestOrderDiscount(t.tenantId, orderId, { amount: 250 });
    await expectOrderBalanced(orderId);
  });

  // ── Rounding ──

  it('order with positive rounding adjustment is balanced', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 999,
      taxTotal: 85,
      total: 1085, // 1084 + 1
    });
    await adminDb.execute(
      sql`UPDATE orders SET rounding_adjustment = 1 WHERE id = ${orderId}`,
    );
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 999, lineSubtotal: 999, lineTax: 85, lineTotal: 1084,
    });
    await expectOrderBalanced(orderId);
  });

  it('order with negative rounding adjustment is balanced', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 999,
      taxTotal: 85,
      total: 1083, // 1084 - 1
    });
    await adminDb.execute(
      sql`UPDATE orders SET rounding_adjustment = -1 WHERE id = ${orderId}`,
    );
    await createTestOrderLine(t.tenantId, orderId, t.locationId, {
      unitPrice: 999, lineSubtotal: 999, lineTax: 85, lineTotal: 1084,
    });
    await expectOrderBalanced(orderId);
  });

  // ── Empty Order ──

  it('empty order (no lines) is balanced at zero', async () => {
    const orderId = await createTestOrder(t.tenantId, t.locationId, {
      subtotal: 0, taxTotal: 0, total: 0,
    });
    await expectOrderBalanced(orderId);
  });

  // ── Invariant Sweep ──

  it('INVARIANT: total is non-negative for all created orders', async () => {
    const rows = await adminDb.execute(sql`
      SELECT id, total FROM orders WHERE tenant_id = ${t.tenantId}
    `);
    for (const row of rows as any[]) {
      expectNonNegativeMoney(Number(row.total), `order ${row.id}`);
    }
  });
});
