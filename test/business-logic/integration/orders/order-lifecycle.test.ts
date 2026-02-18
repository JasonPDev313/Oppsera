/**
 * Phase 1B — Order Lifecycle Integration Tests
 *
 * Tests order status transitions and timestamp management
 * against a real Postgres database.
 *
 * Order state machine:
 *   open → placed → paid
 *   open → voided
 *   placed → voided
 *   open → deleted
 *   Hold/recall: timestamps on open orders (not a status)
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  type TestTenantData,
} from '../../factories';

async function getOrder(orderId: string) {
  const rows = await adminDb.execute(
    sql`SELECT id, status, version, placed_at, paid_at,
               voided_at, void_reason, voided_by,
               held_at, held_by, subtotal, total
        FROM orders WHERE id = ${orderId}`,
  );
  return (rows as any[])[0]!;
}

describe('Order Lifecycle Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Valid Transitions ──

  describe('Valid Transitions', () => {
    it('open → placed: sets status and placedAt', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 1000, taxTotal: 85, total: 1085,
      });
      await createTestOrderLine(t.tenantId, orderId, t.locationId, {
        unitPrice: 1000, lineSubtotal: 1000, lineTax: 85, lineTotal: 1085,
      });

      await adminDb.execute(sql`
        UPDATE orders
        SET status = 'placed', placed_at = NOW(), version = version + 1
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('placed');
      expect(order.placed_at).not.toBeNull();
      expect(Number(order.version)).toBe(2);
    });

    it('placed → paid: sets status and paidAt', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'placed',
        subtotal: 1000, taxTotal: 85, total: 1085,
      });

      await adminDb.execute(sql`
        UPDATE orders
        SET status = 'paid', paid_at = NOW(), version = version + 1
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('paid');
      expect(order.paid_at).not.toBeNull();
    });

    it('open → voided: sets status, voidedAt, voidReason', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 500, taxTotal: 43, total: 543,
      });

      await adminDb.execute(sql`
        UPDATE orders
        SET status = 'voided', voided_at = NOW(), void_reason = 'Customer left',
            version = version + 1
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('voided');
      expect(order.voided_at).not.toBeNull();
      expect(order.void_reason).toBe('Customer left');
    });

    it('placed → voided: void after placing', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        status: 'placed',
        subtotal: 1000, total: 1000,
      });

      await adminDb.execute(sql`
        UPDATE orders
        SET status = 'voided', voided_at = NOW(), void_reason = 'Manager void',
            version = version + 1
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('voided');
    });

    it('open → deleted: removes order', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 0, total: 0,
      });

      await adminDb.execute(sql`
        UPDATE orders
        SET status = 'deleted', version = version + 1
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('deleted');
    });
  });

  // ── Hold/Recall (Timestamps, Not Status) ──

  describe('Hold / Recall', () => {
    it('hold sets heldAt and heldBy without changing status', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 1000, total: 1000,
      });

      await adminDb.execute(sql`
        UPDATE orders SET held_at = NOW(), held_by = ${t.userId}
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('open'); // Status unchanged
      expect(order.held_at).not.toBeNull();
      expect(order.held_by).toBe(t.userId);
    });

    it('recall clears heldAt and heldBy', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 1000, total: 1000,
      });
      await adminDb.execute(sql`
        UPDATE orders SET held_at = NOW(), held_by = ${t.userId}
        WHERE id = ${orderId}
      `);

      // Recall
      await adminDb.execute(sql`
        UPDATE orders SET held_at = NULL, held_by = NULL
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(order.status).toBe('open');
      expect(order.held_at).toBeNull();
      expect(order.held_by).toBeNull();
    });
  });

  // ── Version Tracking ──

  describe('Optimistic Locking', () => {
    it('version increments on each mutation', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 1000, taxTotal: 85, total: 1085,
      });

      let order = await getOrder(orderId);
      expect(Number(order.version)).toBe(1);

      // Place
      await adminDb.execute(sql`
        UPDATE orders SET status = 'placed', placed_at = NOW(), version = version + 1
        WHERE id = ${orderId}
      `);
      order = await getOrder(orderId);
      expect(Number(order.version)).toBe(2);

      // Pay
      await adminDb.execute(sql`
        UPDATE orders SET status = 'paid', paid_at = NOW(), version = version + 1
        WHERE id = ${orderId}
      `);
      order = await getOrder(orderId);
      expect(Number(order.version)).toBe(3);
    });

    it('conditional update with wrong version affects 0 rows', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 1000, total: 1000, version: 1,
      });

      // Try to update with wrong version
      const result = await adminDb.execute(sql`
        UPDATE orders SET status = 'placed', version = version + 1
        WHERE id = ${orderId} AND version = 99
      `);

      // Should affect 0 rows — order still at version 1
      const order = await getOrder(orderId);
      expect(Number(order.version)).toBe(1);
      expect(order.status).toBe('open');
    });
  });

  // ── Timestamp Integrity ──

  describe('Timestamp Integrity', () => {
    it('placedAt < paidAt when both set', async () => {
      const orderId = await createTestOrder(t.tenantId, t.locationId, {
        subtotal: 1000, total: 1000,
      });

      await adminDb.execute(sql`
        UPDATE orders SET status = 'placed', placed_at = NOW() - interval '1 minute'
        WHERE id = ${orderId}
      `);
      await adminDb.execute(sql`
        UPDATE orders SET status = 'paid', paid_at = NOW()
        WHERE id = ${orderId}
      `);

      const order = await getOrder(orderId);
      expect(new Date(order.placed_at).getTime())
        .toBeLessThan(new Date(order.paid_at).getTime());
    });
  });
});
