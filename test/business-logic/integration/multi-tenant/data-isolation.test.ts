/**
 * Phase 3 — Multi-Tenant Data Isolation Tests
 *
 * Verifies RLS enforcement against a real Postgres database.
 * Two tenants are created; queries run within each tenant's context
 * must see ONLY that tenant's data.
 *
 * Defense-in-depth: app-level filtering + withTenant() + Postgres RLS.
 */

import { sql } from 'drizzle-orm';
import { adminDb, withTestTenant } from '../../setup';
import {
  createTestTenant,
  createTestOrder,
  createTestOrderLine,
  createTestTender,
  createTestItem,
  createTestInventoryItem,
  createTestCustomer,
  type TestTenantData,
} from '../../factories';
import { expectTenantIsolated } from '../../assertions';

describe('Multi-Tenant Data Isolation', () => {
  let tenantA: TestTenantData;
  let tenantB: TestTenantData;

  beforeAll(async () => {
    tenantA = await createTestTenant({ name: 'Tenant A (Isolation Test)' });
    tenantB = await createTestTenant({ name: 'Tenant B (Isolation Test)' });

    // Seed data for both tenants
    // Tenant A: 2 orders, 1 customer, 1 catalog item
    const itemA = await createTestItem(tenantA.tenantId);
    await createTestCustomer(tenantA.tenantId);
    const orderA1 = await createTestOrder(tenantA.tenantId, tenantA.locationId, {
      subtotal: 1000, taxTotal: 85, total: 1085,
    });
    await createTestOrderLine(tenantA.tenantId, orderA1, tenantA.locationId, {
      unitPrice: 1000, lineSubtotal: 1000, lineTax: 85, lineTotal: 1085,
    });
    await createTestTender(tenantA.tenantId, tenantA.locationId, orderA1, {
      amount: 1085,
    });
    const orderA2 = await createTestOrder(tenantA.tenantId, tenantA.locationId, {
      subtotal: 2000, total: 2000,
    });

    // Tenant B: 1 order, 1 customer, 1 catalog item
    const itemB = await createTestItem(tenantB.tenantId);
    await createTestCustomer(tenantB.tenantId);
    const orderB1 = await createTestOrder(tenantB.tenantId, tenantB.locationId, {
      subtotal: 5000, taxTotal: 425, total: 5425,
    });
    await createTestOrderLine(tenantB.tenantId, orderB1, tenantB.locationId, {
      unitPrice: 5000, lineSubtotal: 5000, lineTax: 425, lineTotal: 5425,
    });
    await createTestTender(tenantB.tenantId, tenantB.locationId, orderB1, {
      amount: 5425,
    });

    // Inventory for both
    await createTestInventoryItem(tenantA.tenantId, tenantA.locationId, itemA.catalogItemId, {
      initialStock: 100,
    });
    await createTestInventoryItem(tenantB.tenantId, tenantB.locationId, itemB.catalogItemId, {
      initialStock: 50,
    });
  });

  // ── Order Isolation ──

  describe('Order Isolation', () => {
    it('tenant A sees only tenant A orders via RLS', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT id, tenant_id FROM orders`);
        const results = rows as any[];
        expect(results.length).toBeGreaterThanOrEqual(2);
        for (const row of results) {
          expect(row.tenant_id).toBe(tenantA.tenantId);
        }
      });
    });

    it('tenant B sees only tenant B orders via RLS', async () => {
      await withTestTenant(tenantB.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT id, tenant_id FROM orders`);
        const results = rows as any[];
        expect(results.length).toBeGreaterThanOrEqual(1);
        for (const row of results) {
          expect(row.tenant_id).toBe(tenantB.tenantId);
        }
      });
    });

    it('tenant A cannot see tenant B orders', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id FROM orders WHERE tenant_id = ${tenantB.tenantId}`,
        );
        expect((rows as any[]).length).toBe(0);
      });
    });
  });

  // ── Tender Isolation ──

  describe('Tender Isolation', () => {
    it('tenant A sees only its tenders', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT tenant_id FROM tenders`);
        for (const row of rows as any[]) {
          expect(row.tenant_id).toBe(tenantA.tenantId);
        }
      });
    });

    it('tenant B sees only its tenders', async () => {
      await withTestTenant(tenantB.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT tenant_id FROM tenders`);
        for (const row of rows as any[]) {
          expect(row.tenant_id).toBe(tenantB.tenantId);
        }
      });
    });
  });

  // ── Customer Isolation ──

  describe('Customer Isolation', () => {
    it('tenant A sees only its customers', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT tenant_id FROM customers`);
        for (const row of rows as any[]) {
          expect(row.tenant_id).toBe(tenantA.tenantId);
        }
      });
    });

    it('tenant B cannot access tenant A customers', async () => {
      await withTestTenant(tenantB.tenantId, async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id FROM customers WHERE tenant_id = ${tenantA.tenantId}`,
        );
        expect((rows as any[]).length).toBe(0);
      });
    });
  });

  // ── Catalog Isolation ──

  describe('Catalog Isolation', () => {
    it('tenant A sees only its catalog items', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT tenant_id FROM catalog_items`);
        for (const row of rows as any[]) {
          expect(row.tenant_id).toBe(tenantA.tenantId);
        }
      });
    });
  });

  // ── Inventory Isolation ──

  describe('Inventory Isolation', () => {
    it('tenant A sees only its inventory items', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT tenant_id FROM inventory_items`);
        for (const row of rows as any[]) {
          expect(row.tenant_id).toBe(tenantA.tenantId);
        }
      });
    });

    it('tenant A sees only its inventory movements', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`SELECT tenant_id FROM inventory_movements`);
        for (const row of rows as any[]) {
          expect(row.tenant_id).toBe(tenantA.tenantId);
        }
      });
    });
  });

  // ── Cross-Table Isolation ──

  describe('Cross-Table Consistency', () => {
    it('order + lines + tenders all scoped to same tenant', async () => {
      await withTestTenant(tenantA.tenantId, async (tx) => {
        const orders = await tx.execute(sql`SELECT id, tenant_id FROM orders`);
        for (const order of orders as any[]) {
          const lines = await tx.execute(
            sql`SELECT tenant_id FROM order_lines WHERE order_id = ${order.id}`,
          );
          for (const line of lines as any[]) {
            expect(line.tenant_id).toBe(tenantA.tenantId);
          }

          const tenders = await tx.execute(
            sql`SELECT tenant_id FROM tenders WHERE order_id = ${order.id}`,
          );
          for (const tender of tenders as any[]) {
            expect(tender.tenant_id).toBe(tenantA.tenantId);
          }
        }
      });
    });
  });

  // ── Aggregate Isolation ──

  describe('Aggregate Queries Are Scoped', () => {
    it('SUM(total) only includes tenant-scoped orders', async () => {
      const adminSum = await adminDb.execute(sql`
        SELECT COALESCE(SUM(total), 0)::int AS total
        FROM orders WHERE tenant_id = ${tenantA.tenantId}
      `);

      const rlsSum = await withTestTenant(tenantA.tenantId, async (tx) => {
        const rows = await tx.execute(sql`
          SELECT COALESCE(SUM(total), 0)::int AS total FROM orders
        `);
        return Number((rows as any[])[0]!.total);
      });

      expect(rlsSum).toBe(Number((adminSum as any[])[0]!.total));
    });
  });

  // ── Bidirectional Assertion ──

  describe('Bidirectional Isolation (assertion helper)', () => {
    const tablesToCheck = ['orders', 'catalog_items', 'customers', 'inventory_items'];

    for (const table of tablesToCheck) {
      it(`${table}: A cannot see B's data`, async () => {
        await expectTenantIsolated(tenantA.tenantId, tenantB.tenantId, table);
      });

      it(`${table}: B cannot see A's data`, async () => {
        await expectTenantIsolated(tenantB.tenantId, tenantA.tenantId, table);
      });
    }
  });
});
