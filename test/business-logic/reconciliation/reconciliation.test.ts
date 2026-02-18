/**
 * Phase 5 — Reconciliation Audit Tests
 *
 * Runs the audit SQL queries against the test database after
 * all test data has been created. Verifies that the data created
 * by factories + integration tests passes all reconciliation checks.
 *
 * These same queries can be run against production for auditing.
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestOrderDiscount,
  createTestServiceCharge,
  createTestTender,
  createTestTenderReversal,
  createTestItem,
  createTestInventoryItem,
  type TestTenantData,
} from '../factories';
import { testUlid } from '../setup';

describe('Reconciliation Audit Queries', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    // Create a fully populated test tenant for reconciliation checks
    t = await createTestTenant({ name: 'Reconciliation Test Tenant' });

    // Order 1: Simple paid order
    const order1 = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 2000,
      taxTotal: 170,
      total: 2170,
    });
    await createTestOrderLine(t.tenantId, order1, t.locationId, {
      unitPrice: 2000, lineSubtotal: 2000, lineTax: 170, lineTotal: 2170,
    });
    await createTestTender(t.tenantId, t.locationId, order1, {
      amount: 2170,
    });

    // Order 2: Order with discount + service charge
    const order2 = await createTestOrder(t.tenantId, t.locationId, {
      status: 'paid',
      subtotal: 5000,
      taxTotal: 425,
      serviceChargeTotal: 900,
      discountTotal: 500,
      total: 5825,
    });
    await createTestOrderLine(t.tenantId, order2, t.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });
    await createTestServiceCharge(t.tenantId, order2, { amount: 900 });
    await createTestOrderDiscount(t.tenantId, order2, { amount: 500 });
    await createTestTender(t.tenantId, t.locationId, order2, {
      tenderType: 'card', amount: 5825,
    });

    // Order 3: Voided order with reversed tender
    const order3 = await createTestOrder(t.tenantId, t.locationId, {
      status: 'voided',
      subtotal: 1000, taxTotal: 85, total: 1085,
    });
    await createTestOrderLine(t.tenantId, order3, t.locationId, {
      unitPrice: 1000, lineSubtotal: 1000, lineTax: 85, lineTotal: 1085,
    });
    const tender3 = await createTestTender(t.tenantId, t.locationId, order3, {
      amount: 1085,
    });
    await createTestTenderReversal(t.tenantId, order3, tender3, {
      amount: 1085, reversalType: 'void',
    });

    // Inventory
    const item = await createTestItem(t.tenantId);
    await createTestInventoryItem(t.tenantId, t.locationId, item.catalogItemId, {
      initialStock: 100,
    });
  });

  // ── Order Total Integrity ──

  describe('Order Total Integrity', () => {
    it('no orders where subtotal != sum(line_subtotal)', async () => {
      const rows = await adminDb.execute(sql`
        SELECT o.id
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(line_subtotal)::int AS computed
          FROM order_lines GROUP BY order_id
        ) l ON l.order_id = o.id
        WHERE o.tenant_id = ${t.tenantId}
          AND o.status NOT IN ('deleted')
          AND o.subtotal != COALESCE(l.computed, 0)
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('no orders where tax_total != sum(line_tax) + sum(charge_tax)', async () => {
      const rows = await adminDb.execute(sql`
        SELECT o.id
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(line_tax)::int AS line_taxes
          FROM order_lines GROUP BY order_id
        ) l ON l.order_id = o.id
        LEFT JOIN (
          SELECT order_id, SUM(tax_amount)::int AS charge_taxes
          FROM order_charges GROUP BY order_id
        ) c ON c.order_id = o.id
        WHERE o.tenant_id = ${t.tenantId}
          AND o.status NOT IN ('deleted')
          AND o.tax_total != COALESCE(l.line_taxes, 0) + COALESCE(c.charge_taxes, 0)
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('no orders with negative totals', async () => {
      const rows = await adminDb.execute(sql`
        SELECT id, total FROM orders
        WHERE tenant_id = ${t.tenantId} AND total < 0
      `);
      expect((rows as any[]).length).toBe(0);
    });
  });

  // ── Payment Balance ──

  describe('Payment Balance', () => {
    it('all paid orders: net_paid = order.total', async () => {
      const rows = await adminDb.execute(sql`
        SELECT o.id, o.total,
          COALESCE(t.tendered, 0)::int AS tendered,
          COALESCE(r.reversed, 0)::int AS reversed
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(amount) AS tendered
          FROM tenders WHERE status = 'captured'
          GROUP BY order_id
        ) t ON t.order_id = o.id
        LEFT JOIN (
          SELECT order_id, SUM(amount) AS reversed
          FROM tender_reversals WHERE status = 'completed'
          GROUP BY order_id
        ) r ON r.order_id = o.id
        WHERE o.tenant_id = ${t.tenantId} AND o.status = 'paid'
          AND o.total != COALESCE(t.tendered, 0)::int - COALESCE(r.reversed, 0)::int
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('all voided orders with tenders: net_paid = 0', async () => {
      const rows = await adminDb.execute(sql`
        SELECT o.id,
          COALESCE(t.tendered, 0)::int - COALESCE(r.reversed, 0)::int AS net_paid
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(amount) AS tendered
          FROM tenders WHERE status = 'captured'
          GROUP BY order_id
        ) t ON t.order_id = o.id
        LEFT JOIN (
          SELECT order_id, SUM(amount) AS reversed
          FROM tender_reversals WHERE status = 'completed'
          GROUP BY order_id
        ) r ON r.order_id = o.id
        WHERE o.tenant_id = ${t.tenantId}
          AND o.status = 'voided'
          AND COALESCE(t.tendered, 0) > 0
          AND COALESCE(t.tendered, 0)::int - COALESCE(r.reversed, 0)::int != 0
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('no reversals exceed original tender amount', async () => {
      const rows = await adminDb.execute(sql`
        SELECT t.id, t.amount AS tender_amount,
          COALESCE(rev.total_reversed, 0)::int AS total_reversed
        FROM tenders t
        LEFT JOIN (
          SELECT original_tender_id, SUM(amount)::int AS total_reversed
          FROM tender_reversals WHERE status = 'completed'
          GROUP BY original_tender_id
        ) rev ON rev.original_tender_id = t.id
        WHERE t.tenant_id = ${t.tenantId}
          AND COALESCE(rev.total_reversed, 0) > t.amount
      `);
      expect((rows as any[]).length).toBe(0);
    });
  });

  // ── Inventory Accuracy ──

  describe('Inventory Accuracy', () => {
    it('no items with negative stock when allowNegative = false', async () => {
      const rows = await adminDb.execute(sql`
        SELECT ii.id, ii.name, SUM(im.quantity_delta::numeric) AS on_hand
        FROM inventory_items ii
        JOIN inventory_movements im ON im.inventory_item_id = ii.id
        WHERE ii.tenant_id = ${t.tenantId}
          AND ii.allow_negative = false
        GROUP BY ii.id, ii.name
        HAVING SUM(im.quantity_delta::numeric) < 0
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('no unbalanced transfer batches', async () => {
      const rows = await adminDb.execute(sql`
        SELECT batch_id, SUM(quantity_delta::numeric) AS net
        FROM inventory_movements
        WHERE tenant_id = ${t.tenantId}
          AND batch_id IS NOT NULL
          AND movement_type IN ('transfer_out', 'transfer_in')
        GROUP BY batch_id
        HAVING SUM(quantity_delta::numeric) != 0
      `);
      expect((rows as any[]).length).toBe(0);
    });
  });

  // ── Cross-Tenant Integrity ──

  describe('Cross-Tenant Integrity', () => {
    it('no order lines with mismatched tenant_id', async () => {
      const rows = await adminDb.execute(sql`
        SELECT ol.id
        FROM order_lines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE ol.tenant_id = ${t.tenantId}
          AND ol.tenant_id != o.tenant_id
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('no tenders with mismatched tenant_id', async () => {
      const rows = await adminDb.execute(sql`
        SELECT t.id
        FROM tenders t
        JOIN orders o ON o.id = t.order_id
        WHERE t.tenant_id = ${t.tenantId}
          AND t.tenant_id != o.tenant_id
      `);
      expect((rows as any[]).length).toBe(0);
    });

    it('no inventory movements with mismatched tenant_id', async () => {
      const rows = await adminDb.execute(sql`
        SELECT im.id
        FROM inventory_movements im
        JOIN inventory_items ii ON ii.id = im.inventory_item_id
        WHERE im.tenant_id = ${t.tenantId}
          AND im.tenant_id != ii.tenant_id
      `);
      expect((rows as any[]).length).toBe(0);
    });
  });
});
