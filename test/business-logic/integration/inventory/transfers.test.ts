/**
 * Phase 1B — Inventory Transfer Integration Tests
 *
 * Verifies transfer integrity against a real Postgres database.
 * INVARIANT: For every transfer batch: sum(outbound) + sum(inbound) = 0 (net zero)
 *
 * Transfers create paired movements:
 *   - transfer_out (negative delta at source)
 *   - transfer_in (positive delta at destination)
 *   - Linked by shared batchId
 */

import { sql } from 'drizzle-orm';
import { adminDb, testUlid } from '../../setup';
import {
  createTestTenant,
  createTestItem,
  createTestInventoryItem,
  type TestTenantData,
} from '../../factories';
import { expectTransferBalanced } from '../../assertions';

async function getOnHand(inventoryItemId: string): Promise<number> {
  const rows = await adminDb.execute(sql`
    SELECT COALESCE(SUM(quantity_delta::numeric), 0) AS on_hand
    FROM inventory_movements WHERE inventory_item_id = ${inventoryItemId}
  `);
  return Number((rows as any[])[0]!.on_hand);
}

async function createTransfer(
  tenantId: string,
  sourceLocationId: string,
  destLocationId: string,
  sourceInvItemId: string,
  destInvItemId: string,
  qty: number,
): Promise<string> {
  const batchId = testUlid();

  // Transfer out from source
  await adminDb.execute(sql`
    INSERT INTO inventory_movements (
      id, tenant_id, location_id, inventory_item_id,
      movement_type, quantity_delta,
      reference_type, batch_id, source, business_date
    )
    VALUES (
      ${testUlid()}, ${tenantId}, ${sourceLocationId}, ${sourceInvItemId},
      'transfer_out', ${(-qty).toString()},
      'transfer', ${batchId}, 'system',
      ${new Date().toISOString().slice(0, 10)}
    )
  `);

  // Transfer in to destination
  await adminDb.execute(sql`
    INSERT INTO inventory_movements (
      id, tenant_id, location_id, inventory_item_id,
      movement_type, quantity_delta,
      reference_type, batch_id, source, business_date
    )
    VALUES (
      ${testUlid()}, ${tenantId}, ${destLocationId}, ${destInvItemId},
      'transfer_in', ${qty.toString()},
      'transfer', ${batchId}, 'system',
      ${new Date().toISOString().slice(0, 10)}
    )
  `);

  return batchId;
}

describe('Inventory Transfer Integration', () => {
  let t: TestTenantData;

  beforeAll(async () => {
    t = await createTestTenant();
  });

  // ── Basic Transfer ──

  it('transfer moves stock between locations', async () => {
    const item = await createTestItem(t.tenantId);
    const sourceInv = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );
    const destInv = await createTestInventoryItem(
      t.tenantId, t.location2Id, item.catalogItemId,
      { initialStock: 0 },
    );

    await createTransfer(
      t.tenantId, t.locationId, t.location2Id,
      sourceInv, destInv, 25,
    );

    expect(await getOnHand(sourceInv)).toBe(75);
    expect(await getOnHand(destInv)).toBe(25);
  });

  // ── Net Zero Invariant ──

  it('INVARIANT: transfer batch is net zero', async () => {
    const item = await createTestItem(t.tenantId);
    const sourceInv = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 50 },
    );
    const destInv = await createTestInventoryItem(
      t.tenantId, t.location2Id, item.catalogItemId,
      { initialStock: 0 },
    );

    const batchId = await createTransfer(
      t.tenantId, t.locationId, t.location2Id,
      sourceInv, destInv, 10,
    );

    await expectTransferBalanced(batchId);
  });

  // ── Multiple Transfers ──

  it('multiple transfers accumulate correctly', async () => {
    const item = await createTestItem(t.tenantId);
    const sourceInv = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );
    const destInv = await createTestInventoryItem(
      t.tenantId, t.location2Id, item.catalogItemId,
      { initialStock: 0 },
    );

    const batch1 = await createTransfer(
      t.tenantId, t.locationId, t.location2Id, sourceInv, destInv, 10,
    );
    const batch2 = await createTransfer(
      t.tenantId, t.locationId, t.location2Id, sourceInv, destInv, 15,
    );
    const batch3 = await createTransfer(
      t.tenantId, t.locationId, t.location2Id, sourceInv, destInv, 5,
    );

    expect(await getOnHand(sourceInv)).toBe(70); // 100 - 10 - 15 - 5
    expect(await getOnHand(destInv)).toBe(30);    // 0 + 10 + 15 + 5

    // Each batch independently balanced
    await expectTransferBalanced(batch1);
    await expectTransferBalanced(batch2);
    await expectTransferBalanced(batch3);
  });

  // ── Bidirectional Transfers ──

  it('bidirectional transfers both balance', async () => {
    const item = await createTestItem(t.tenantId);
    const inv1 = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 50 },
    );
    const inv2 = await createTestInventoryItem(
      t.tenantId, t.location2Id, item.catalogItemId,
      { initialStock: 50 },
    );

    // Transfer 20 from loc1 → loc2
    const batch1 = await createTransfer(
      t.tenantId, t.locationId, t.location2Id, inv1, inv2, 20,
    );
    // Transfer 10 from loc2 → loc1
    const batch2 = await createTransfer(
      t.tenantId, t.location2Id, t.locationId, inv2, inv1, 10,
    );

    expect(await getOnHand(inv1)).toBe(40); // 50 - 20 + 10
    expect(await getOnHand(inv2)).toBe(60); // 50 + 20 - 10

    await expectTransferBalanced(batch1);
    await expectTransferBalanced(batch2);
  });

  // ── Fractional Transfer ──

  it('fractional quantity transfers balance', async () => {
    const item = await createTestItem(t.tenantId, { itemType: 'fnb' });
    const sourceInv = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 10 },
    );
    const destInv = await createTestInventoryItem(
      t.tenantId, t.location2Id, item.catalogItemId,
      { initialStock: 0 },
    );

    const batchId = await createTransfer(
      t.tenantId, t.locationId, t.location2Id,
      sourceInv, destInv, 2.5,
    );

    expect(await getOnHand(sourceInv)).toBe(7.5);
    expect(await getOnHand(destInv)).toBe(2.5);
    await expectTransferBalanced(batchId);
  });

  // ── INVARIANT: Global Stock Conservation ──

  it('INVARIANT: total stock across locations is conserved after transfers', async () => {
    const item = await createTestItem(t.tenantId);
    const inv1 = await createTestInventoryItem(
      t.tenantId, t.locationId, item.catalogItemId,
      { initialStock: 100 },
    );
    const inv2 = await createTestInventoryItem(
      t.tenantId, t.location2Id, item.catalogItemId,
      { initialStock: 50 },
    );

    const totalBefore = (await getOnHand(inv1)) + (await getOnHand(inv2));

    await createTransfer(t.tenantId, t.locationId, t.location2Id, inv1, inv2, 30);
    await createTransfer(t.tenantId, t.location2Id, t.locationId, inv2, inv1, 10);

    const totalAfter = (await getOnHand(inv1)) + (await getOnHand(inv2));
    expect(totalAfter).toBe(totalBefore); // Stock is conserved
  });
});
