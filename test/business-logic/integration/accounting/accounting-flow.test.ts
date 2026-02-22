/**
 * Accounting Flow Integration Tests
 *
 * End-to-end tests validating GL posting scenarios using real
 * database records. Tests create orders, tenders, chargebacks,
 * and verify the expected data relationships.
 *
 * These tests validate data integrity at the DB layer —
 * the GL adapters are tested in their own module tests.
 *
 * SESSION 48: Integration Tests + Posting Matrix
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestTender,
  createTestTenderReversal,
  createTestServiceCharge,
  createTestOrderDiscount,
  type TestTenantData,
} from '../../factories';
import {
  expectOrderBalanced,
  expectPaymentReconciled,
  expectExactMoney,
  expectNonNegativeMoney,
} from '../../assertions';
import { testUlid } from '../../setup';

describe('Accounting Flow Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant({ name: 'Accounting Flow Test Tenant' });
  });

  // ─── Single Tender Flow ─────────────────────────────────

  describe('Single Cash Tender', () => {
    let orderId: string;
    let tenderId: string;

    beforeAll(async () => {
      orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'paid',
        subtotal: 2000,
        taxTotal: 170,
        total: 2170,
        businessDate: '2026-02-21',
      });

      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 2000,
        lineSubtotal: 2000,
        lineTax: 170,
        lineTotal: 2170,
      });

      tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'cash',
        amount: 2170,
        amountGiven: 2500,
        changeGiven: 330,
        businessDate: '2026-02-21',
      });
    });

    it('order totals are balanced', async () => {
      await expectOrderBalanced(orderId);
    });

    it('payments reconcile with order total', async () => {
      await expectPaymentReconciled(orderId);
    });

    it('tender amount matches order total', async () => {
      const rows = await adminDb.execute(sql`
        SELECT amount FROM tenders WHERE id = ${tenderId}
      `);
      expectExactMoney(Number((rows as any[])[0].amount), 2170, 'tender.amount');
    });

    it('change given is correct', async () => {
      const rows = await adminDb.execute(sql`
        SELECT amount_given, change_given FROM tenders WHERE id = ${tenderId}
      `);
      const row = (rows as any[])[0];
      expectExactMoney(Number(row.change_given), Number(row.amount_given) - 2170, 'change calculation');
    });
  });

  // ─── Split Tender Flow ──────────────────────────────────

  describe('Split Tender (2-way)', () => {
    let orderId: string;

    beforeAll(async () => {
      orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'paid',
        subtotal: 5000,
        taxTotal: 425,
        total: 5425,
        businessDate: '2026-02-21',
      });

      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 5000,
        lineSubtotal: 5000,
        lineTax: 425,
        lineTotal: 5425,
      });

      // Tender 1: cash $30.00
      await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'cash',
        tenderSequence: 1,
        amount: 3000,
        amountGiven: 3000,
        businessDate: '2026-02-21',
      });

      // Tender 2: card $24.25
      await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'card',
        tenderSequence: 2,
        amount: 2425,
        amountGiven: 2425,
        businessDate: '2026-02-21',
      });
    });

    it('order totals are balanced', async () => {
      await expectOrderBalanced(orderId);
    });

    it('sum of tenders equals order total', async () => {
      const rows = await adminDb.execute(sql`
        SELECT COALESCE(SUM(amount), 0)::int AS total_tendered
        FROM tenders WHERE order_id = ${orderId}
      `);
      expectExactMoney(Number((rows as any[])[0].total_tendered), 5425, 'split tender sum');
    });

    it('payments reconcile with order total', async () => {
      await expectPaymentReconciled(orderId);
    });
  });

  // ─── Tender with All Categories ─────────────────────────

  describe('Tender with Tip, Discount, Service Charge', () => {
    let orderId: string;

    beforeAll(async () => {
      // Order: $100 subtotal - $10 discount + $5 svc charge + $8.08 tax = $103.08
      orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'paid',
        subtotal: 10000,
        taxTotal: 808,
        serviceChargeTotal: 500,
        discountTotal: 1000,
        total: 10308,
        businessDate: '2026-02-21',
      });

      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 10000,
        lineSubtotal: 10000,
        lineTax: 808,
        lineTotal: 10808,
      });

      await createTestOrderDiscount(t.tenantId, orderId, {
        type: 'fixed',
        value: 1000,
        amount: 1000,
        reason: 'Loyalty discount',
      });

      await createTestServiceCharge(t.tenantId, orderId, {
        name: 'Service Fee',
        amount: 500,
        isTaxable: false,
      });

      // Tender: $103.08 + $15 tip
      await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'card',
        amount: 10308,
        tipAmount: 1500,
        amountGiven: 10308,
        businessDate: '2026-02-21',
      });
    });

    it('order totals are balanced', async () => {
      await expectOrderBalanced(orderId);
    });

    it('payments reconcile (tip does not affect order total)', async () => {
      await expectPaymentReconciled(orderId);
    });

    it('tip is stored on tender, not order', async () => {
      const orderRows = await adminDb.execute(sql`
        SELECT total FROM orders WHERE id = ${orderId}
      `);
      const tenderRows = await adminDb.execute(sql`
        SELECT amount, tip_amount FROM tenders WHERE order_id = ${orderId}
      `);
      const order = (orderRows as any[])[0];
      const tender = (tenderRows as any[])[0];

      // Order total does NOT include tip
      expectExactMoney(Number(order.total), 10308, 'order.total excludes tip');
      // Tender amount = order total (tip is separate)
      expectExactMoney(Number(tender.amount), 10308, 'tender.amount = order.total');
      expectExactMoney(Number(tender.tip_amount), 1500, 'tender.tipAmount');
    });
  });

  // ─── Void Reversal Flow ─────────────────────────────────

  describe('Order Void with Tender Reversal', () => {
    let orderId: string;
    let tenderId: string;

    beforeAll(async () => {
      orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'voided',
        subtotal: 3000,
        taxTotal: 255,
        total: 3255,
        businessDate: '2026-02-21',
      });

      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 3000,
        lineSubtotal: 3000,
        lineTax: 255,
        lineTotal: 3255,
      });

      tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'cash',
        amount: 3255,
        businessDate: '2026-02-21',
      });

      await createTestTenderReversal(t.tenantId, orderId, tenderId, {
        reversalType: 'void',
        amount: 3255,
        reason: 'Order voided by manager',
      });
    });

    it('order is voided', async () => {
      const rows = await adminDb.execute(sql`
        SELECT status FROM orders WHERE id = ${orderId}
      `);
      expect((rows as any[])[0].status).toBe('voided');
    });

    it('reversal amount matches tender amount', async () => {
      const tenderRows = await adminDb.execute(sql`
        SELECT amount FROM tenders WHERE id = ${tenderId}
      `);
      const reversalRows = await adminDb.execute(sql`
        SELECT amount FROM tender_reversals WHERE original_tender_id = ${tenderId}
      `);
      expectExactMoney(
        Number((reversalRows as any[])[0].amount),
        Number((tenderRows as any[])[0].amount),
        'reversal matches tender',
      );
    });
  });

  // ─── Chargeback Flow ────────────────────────────────────

  describe('Chargeback Lifecycle', () => {
    let orderId: string;
    let tenderId: string;
    let chargebackId: string;

    beforeAll(async () => {
      orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'paid',
        subtotal: 7500,
        taxTotal: 638,
        total: 8138,
        businessDate: '2026-02-20',
      });

      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 7500,
        lineSubtotal: 7500,
        lineTax: 638,
        lineTotal: 8138,
      });

      tenderId = await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'card',
        amount: 8138,
        businessDate: '2026-02-20',
      });

      // Create chargeback
      chargebackId = testUlid();
      await adminDb.execute(sql`
        INSERT INTO chargebacks (
          id, tenant_id, location_id, tender_id, order_id,
          chargeback_reason, chargeback_amount_cents, fee_amount_cents,
          status, business_date, created_by
        ) VALUES (
          ${chargebackId}, ${t.tenantId}, ${t.locationId}, ${tenderId}, ${orderId},
          'Unauthorized transaction', 8138, 1500,
          'received', '2026-02-21', ${t.userId}
        )
      `);
    });

    it('chargeback is linked to tender', async () => {
      const rows = await adminDb.execute(sql`
        SELECT tender_id, order_id, status FROM chargebacks WHERE id = ${chargebackId}
      `);
      const cb = (rows as any[])[0];
      expect(cb.tender_id).toBe(tenderId);
      expect(cb.order_id).toBe(orderId);
      expect(cb.status).toBe('received');
    });

    it('chargeback amount does not exceed tender', async () => {
      const cbRows = await adminDb.execute(sql`
        SELECT chargeback_amount_cents FROM chargebacks WHERE id = ${chargebackId}
      `);
      const tenderRows = await adminDb.execute(sql`
        SELECT amount FROM tenders WHERE id = ${tenderId}
      `);
      expect(Number((cbRows as any[])[0].chargeback_amount_cents)).toBeLessThanOrEqual(
        Number((tenderRows as any[])[0].amount),
      );
    });

    it('chargeback fee is non-negative', async () => {
      const rows = await adminDb.execute(sql`
        SELECT fee_amount_cents FROM chargebacks WHERE id = ${chargebackId}
      `);
      expectNonNegativeMoney(Number((rows as any[])[0].fee_amount_cents), 'chargeback fee');
    });

    it('can resolve chargeback as won', async () => {
      await adminDb.execute(sql`
        UPDATE chargebacks SET
          status = 'won',
          resolution_reason = 'Evidence submitted',
          resolution_date = '2026-02-25',
          resolved_by = ${t.userId},
          updated_at = NOW()
        WHERE id = ${chargebackId}
      `);

      const rows = await adminDb.execute(sql`
        SELECT status, resolution_reason FROM chargebacks WHERE id = ${chargebackId}
      `);
      expect((rows as any[])[0].status).toBe('won');
      expect((rows as any[])[0].resolution_reason).toBe('Evidence submitted');
    });
  });

  // ─── Return Flow ────────────────────────────────────────

  describe('Line-Item Return', () => {
    let originalOrderId: string;
    let returnOrderId: string;

    beforeAll(async () => {
      // Original order
      originalOrderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'paid',
        subtotal: 5000,
        taxTotal: 425,
        total: 5425,
        businessDate: '2026-02-19',
      });

      await createTestOrderLine(t.tenantId, originalOrderId, t.locationId, {
        unitPrice: 2500,
        lineSubtotal: 2500,
        lineTax: 213,
        lineTotal: 2713,
        name: 'Item A',
      });

      await createTestOrderLine(t.tenantId, originalOrderId, t.locationId, {
        unitPrice: 2500,
        lineSubtotal: 2500,
        lineTax: 212,
        lineTotal: 2712,
        name: 'Item B',
        sortOrder: 2,
      });

      await createTestTender(t.tenantId, t.locationId, originalOrderId, {
        tenderType: 'card',
        amount: 5425,
        businessDate: '2026-02-19',
      });

      // Return order for Item A only (partial return)
      returnOrderId = testUlid();
      const returnNumber = `RET-${Date.now().toString(36)}`;
      await adminDb.execute(sql`
        INSERT INTO orders (
          id, tenant_id, location_id, order_number, status, source,
          business_date, version, subtotal, tax_total, total,
          return_type, return_order_id
        ) VALUES (
          ${returnOrderId}, ${t.tenantId}, ${t.locationId}, ${returnNumber},
          'paid', 'pos', '2026-02-21', 1,
          -2500, -213, -2713,
          'partial', ${originalOrderId}
        )
      `);
    });

    it('return order links to original', async () => {
      const rows = await adminDb.execute(sql`
        SELECT return_type, return_order_id FROM orders WHERE id = ${returnOrderId}
      `);
      const ret = (rows as any[])[0];
      expect(ret.return_type).toBe('partial');
      expect(ret.return_order_id).toBe(originalOrderId);
    });

    it('return totals are negative', async () => {
      const rows = await adminDb.execute(sql`
        SELECT subtotal, tax_total, total FROM orders WHERE id = ${returnOrderId}
      `);
      const ret = (rows as any[])[0];
      expect(Number(ret.subtotal)).toBeLessThan(0);
      expect(Number(ret.total)).toBeLessThan(0);
    });
  });

  // ─── 3-Way Split Tender ─────────────────────────────────

  describe('3-Way Split Tender', () => {
    let orderId: string;

    beforeAll(async () => {
      // $150.00 order
      orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'paid',
        subtotal: 15000,
        taxTotal: 1275,
        total: 16275,
        businessDate: '2026-02-21',
      });

      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 15000,
        lineSubtotal: 15000,
        lineTax: 1275,
        lineTotal: 16275,
      });

      // Tender 1: cash $50.00
      await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'cash',
        tenderSequence: 1,
        amount: 5000,
        amountGiven: 5000,
        businessDate: '2026-02-21',
      });

      // Tender 2: card $50.00
      await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'card',
        tenderSequence: 2,
        amount: 5000,
        amountGiven: 5000,
        businessDate: '2026-02-21',
      });

      // Tender 3: card $62.75 (remainder)
      await createTestTender(t.tenantId, t.locationId, orderId, {
        tenderType: 'card',
        tenderSequence: 3,
        amount: 6275,
        amountGiven: 6275,
        businessDate: '2026-02-21',
      });
    });

    it('3 tenders sum to order total exactly', async () => {
      const rows = await adminDb.execute(sql`
        SELECT COALESCE(SUM(amount), 0)::int AS total_tendered
        FROM tenders WHERE order_id = ${orderId}
      `);
      expectExactMoney(Number((rows as any[])[0].total_tendered), 16275, '3-way split sum');
    });

    it('each tender is non-negative', async () => {
      const rows = await adminDb.execute(sql`
        SELECT id, amount FROM tenders WHERE order_id = ${orderId}
      `);
      for (const row of rows as any[]) {
        expectNonNegativeMoney(Number(row.amount), `tender ${row.id}`);
      }
    });

    it('payments reconcile', async () => {
      await expectPaymentReconciled(orderId);
    });
  });

  // ─── INVARIANT Sweeps ───────────────────────────────────

  describe('INVARIANT sweeps across all test data', () => {
    it('all orders have non-negative totals', async () => {
      const rows = await adminDb.execute(sql`
        SELECT id, total FROM orders WHERE tenant_id = ${t.tenantId}
          AND return_type IS NULL
      `);
      for (const row of rows as any[]) {
        expectNonNegativeMoney(Number(row.total), `order ${row.id}`);
      }
    });

    it('all tenders have non-negative amounts', async () => {
      const rows = await adminDb.execute(sql`
        SELECT id, amount FROM tenders WHERE tenant_id = ${t.tenantId}
      `);
      for (const row of rows as any[]) {
        expectNonNegativeMoney(Number(row.amount), `tender ${row.id}`);
      }
    });

    it('no tender exceeds its order total', async () => {
      const rows = await adminDb.execute(sql`
        SELECT t.id AS tender_id, t.amount AS tender_amount,
               o.total AS order_total
        FROM tenders t
        JOIN orders o ON o.id = t.order_id
        WHERE t.tenant_id = ${t.tenantId}
      `);
      for (const row of rows as any[]) {
        expect(Number(row.tender_amount)).toBeLessThanOrEqual(
          Number(row.order_total),
        );
      }
    });

    it('all chargebacks have valid status', async () => {
      const rows = await adminDb.execute(sql`
        SELECT id, status FROM chargebacks WHERE tenant_id = ${t.tenantId}
      `);
      const validStatuses = ['received', 'under_review', 'won', 'lost'];
      for (const row of rows as any[]) {
        expect(validStatuses).toContain(row.status);
      }
    });

    it('chargeback amounts never exceed tender amounts', async () => {
      const rows = await adminDb.execute(sql`
        SELECT cb.id, cb.chargeback_amount_cents, t.amount AS tender_amount
        FROM chargebacks cb
        JOIN tenders t ON t.id = cb.tender_id
        WHERE cb.tenant_id = ${t.tenantId}
      `);
      for (const row of rows as any[]) {
        expect(Number(row.chargeback_amount_cents)).toBeLessThanOrEqual(
          Number(row.tender_amount),
        );
      }
    });
  });
});
