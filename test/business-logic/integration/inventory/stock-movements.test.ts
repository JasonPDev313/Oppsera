/**
 * Phase 1B — Stock Movement Integration Tests
 *
 * Verifies inventory accuracy against a real Postgres database.
 * INVARIANT: on-hand = SUM(quantity_delta) from inventory_movements
 *
 * Movements are APPEND-ONLY — never updated or deleted.
 * On-hand is always computed, never stored as a mutable column.
 */

import { sql } from 'drizzle-orm';
import { adminDb } from '../../setup';
import { testUlid } from '../../setup';
import {
  createTestTenant,
  createTestItem,
  createTestInventoryItem,
  type TestTenantData,
} from '../../factories';

async function getOnHand(inventoryItemId: string): Promise<number> {
  const rows = await adminDb.execute(sql`
    SELECT COALESCE(SUM(quantity_delta::numeric), 0) AS on_hand
    FROM inventory_movements WHERE inventory_item_id = ${inventoryItemId}
  `);
  return Number((rows as any[])[0]!.on_hand);
}

async function addMovement(
  tenantId: string,
  locationId: string,
  inventoryItemId: string,
  movementType: string,
  quantityDelta: number,
  options: {
    referenceType?: string;
    referenceId?: string;
    batchId?: string;
    reason?: string;
  } = {},
): Promise<string> {
  const id = testUlid();
  await adminDb.execute(sql`
    INSERT INTO inventory_movements (
      id, tenant_id, location_id, inventory_item_id,
      movement_type, quantity_delta,
      reference_type, reference_id, batch_id,
      reason, source, business_date
    )
    VALUES (
      ${id}, ${tenantId}, ${locationId}, ${inventoryItemId},
      ${movementType}, ${quantityDelta.toString()},
      ${options.referenceType ?? null}, ${options.referenceId ?? null},
      ${options.batchId ?? null},
      ${options.reason ?? null}, 'system',
      ${new Date().toISOString().slice(0, 10)}
    )
  `);
  return id;
}

describe('Stock Movement Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Initial Stock ──

  it('initial stock sets correct on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );

    const onHand = await getOnHand(invId);
    expect(onHand).toBe(100);
  });

  // ── Receive ──

  it('receive increases on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 50 },
    );

    await addMovement(t.tenantId, t.locationId, invId, 'receive', 25, {
      referenceType: 'purchase_order',
    });

    expect(await getOnHand(invId)).toBe(75);
  });

  // ── Sale Deduction ──

  it('sale reduces on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );

    await addMovement(t.tenantId, t.locationId, invId, 'sale', -1, {
      referenceType: 'order', referenceId: 'test-order-1',
    });

    expect(await getOnHand(invId)).toBe(99);
  });

  it('multiple sales accumulate correctly', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );

    for (let i = 0; i < 10; i++) {
      await addMovement(t.tenantId, t.locationId, invId, 'sale', -1, {
        referenceType: 'order', referenceId: `order-${i}`,
      });
    }

    expect(await getOnHand(invId)).toBe(90);
  });

  // ── Void Reversal ──

  it('void_reversal restores on-hand after sale', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 50 },
    );

    // Sale
    await addMovement(t.tenantId, t.locationId, invId, 'sale', -3, {
      referenceType: 'order', referenceId: 'order-void-test',
    });
    expect(await getOnHand(invId)).toBe(47);

    // Void reversal
    await addMovement(t.tenantId, t.locationId, invId, 'void_reversal', 3, {
      referenceType: 'order', referenceId: 'order-void-test',
    });
    expect(await getOnHand(invId)).toBe(50);
  });

  // ── Adjustment ──

  it('positive adjustment increases on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );

    await addMovement(t.tenantId, t.locationId, invId, 'adjustment', 10, {
      reason: 'Recount found extra',
    });

    expect(await getOnHand(invId)).toBe(110);
  });

  it('negative adjustment decreases on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );

    await addMovement(t.tenantId, t.locationId, invId, 'adjustment', -5, {
      reason: 'Damaged goods',
    });

    expect(await getOnHand(invId)).toBe(95);
  });

  // ── Shrink ──

  it('shrink reduces on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );

    await addMovement(t.tenantId, t.locationId, invId, 'shrink', -2, {
      reason: 'Theft detected',
    });

    expect(await getOnHand(invId)).toBe(98);
  });

  // ── Fractional Quantities (F&B) ──

  it('handles fractional quantities for F&B items', async () => {
    const item = await createTestItem(t.tenantId, { itemType: 'fnb' });
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 10 },
    );

    await addMovement(t.tenantId, t.locationId, invId, 'sale', -0.5);
    await addMovement(t.tenantId, t.locationId, invId, 'sale', -1.5);

    expect(await getOnHand(invId)).toBe(8);
  });

  // ── INVARIANT: on-hand = SUM(delta) ──

  it('INVARIANT: on-hand = SUM(quantity_delta) across all movements', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 200 },
    );

    // Series of movements
    await addMovement(t.tenantId, t.locationId, invId, 'sale', -10);
    await addMovement(t.tenantId, t.locationId, invId, 'receive', 25);
    await addMovement(t.tenantId, t.locationId, invId, 'adjustment', -5);
    await addMovement(t.tenantId, t.locationId, invId, 'shrink', -3);
    await addMovement(t.tenantId, t.locationId, invId, 'sale', -7);
    await addMovement(t.tenantId, t.locationId, invId, 'void_reversal', 7);

    // 200 - 10 + 25 - 5 - 3 - 7 + 7 = 207
    const onHand = await getOnHand(invId);
    expect(onHand).toBe(207);

    // Double-check with raw sum
    const rows = await adminDb.execute(sql`
      SELECT COALESCE(SUM(quantity_delta::numeric), 0) AS computed
      FROM inventory_movements WHERE inventory_item_id = ${invId}
    `);
    expect(Number((rows as any[])[0]!.computed)).toBe(onHand);
  });

  // ── Zero Stock ──

  it('on-hand can reach zero', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 5 },
    );

    for (let i = 0; i < 5; i++) {
      await addMovement(t.tenantId, t.locationId, invId, 'sale', -1);
    }

    expect(await getOnHand(invId)).toBe(0);
  });

  // ── No Movements ──

  it('item with no movements has 0 on-hand', async () => {
    const item = await createTestItem(t.tenantId);
    const invId = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
    );

    expect(await getOnHand(invId)).toBe(0);
  });
});
