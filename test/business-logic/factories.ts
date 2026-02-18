/**
 * Test Data Factories
 *
 * Create test data via admin connection (bypasses RLS).
 * Each factory returns the full created record.
 * All IDs are ULIDs for consistency with production.
 */

import { sql } from 'drizzle-orm';
import { adminDb, registerTestTenant, testUlid } from './setup';

// ────────────────────────────────────────────────────────
// Tenant & Auth
// ────────────────────────────────────────────────────────

export interface TestTenantData {
  tenantId: string;
  locationId: string;
  location2Id: string;
  userId: string;
  slug: string;
}

let tenantCounter = 0;

export async function createTestTenant(
  overrides: Partial<{ name: string; slug: string }> = {},
): Promise<TestTenantData> {
  const suffix = ++tenantCounter;
  const tenantId = testUlid();
  const slug = overrides.slug || `test-tenant-${suffix}-${Date.now()}`;
  const locationId = testUlid();
  const location2Id = testUlid();
  const userId = testUlid();

  // Create tenant
  await adminDb.execute(sql`
    INSERT INTO tenants (id, name, slug, status)
    VALUES (${tenantId}, ${overrides.name || `Test Tenant ${suffix}`}, ${slug}, 'active')
  `);

  registerTestTenant(tenantId);

  // Create two locations
  await adminDb.execute(sql`
    INSERT INTO locations (id, tenant_id, name, slug, status, timezone)
    VALUES
      (${locationId}, ${tenantId}, 'Location A', ${'loc-a-' + slug}, 'active', 'America/New_York'),
      (${location2Id}, ${tenantId}, 'Location B', ${'loc-b-' + slug}, 'active', 'America/New_York')
  `);

  // Create user
  await adminDb.execute(sql`
    INSERT INTO users (id, tenant_id, email, display_name, status)
    VALUES (${userId}, ${tenantId}, ${'test@' + slug + '.test'}, 'Test User', 'active')
  `);

  // Create role assignment
  await adminDb.execute(sql`
    INSERT INTO user_roles (id, tenant_id, user_id, role)
    VALUES (${testUlid()}, ${tenantId}, ${userId}, 'owner')
  `);

  // Create entitlements for all modules
  for (const module of ['catalog', 'orders', 'payments', 'inventory', 'customers']) {
    await adminDb.execute(sql`
      INSERT INTO entitlements (id, tenant_id, module_key, is_enabled)
      VALUES (${testUlid()}, ${tenantId}, ${module}, true)
      ON CONFLICT DO NOTHING
    `);
  }

  return { tenantId, locationId, location2Id, userId, slug };
}

// ────────────────────────────────────────────────────────
// Tax Configuration
// ────────────────────────────────────────────────────────

export interface TestTaxConfig {
  taxRateId: string;
  taxGroupId: string;
}

export async function createTestTaxConfig(
  tenantId: string,
  locationId: string,
  options: {
    rateName?: string;
    rateDecimal?: string;
    groupName?: string;
    calculationMode?: 'exclusive' | 'inclusive';
  } = {},
): Promise<TestTaxConfig> {
  const taxRateId = testUlid();
  const taxGroupId = testUlid();
  const rateDecimal = options.rateDecimal || '0.0850';
  const calculationMode = options.calculationMode || 'exclusive';

  // Create tax rate
  await adminDb.execute(sql`
    INSERT INTO tax_rates (id, tenant_id, name, rate_decimal, is_active)
    VALUES (${taxRateId}, ${tenantId}, ${options.rateName || 'Test Tax'}, ${rateDecimal}, true)
  `);

  // Create tax group
  await adminDb.execute(sql`
    INSERT INTO tax_groups (id, tenant_id, location_id, name, calculation_mode, is_active)
    VALUES (${taxGroupId}, ${tenantId}, ${locationId}, ${options.groupName || 'Test Tax Group'}, ${calculationMode}, true)
  `);

  // Link rate to group
  await adminDb.execute(sql`
    INSERT INTO tax_group_rates (id, tenant_id, tax_group_id, tax_rate_id, sort_order)
    VALUES (${testUlid()}, ${tenantId}, ${taxGroupId}, ${taxRateId}, 0)
  `);

  return { taxRateId, taxGroupId };
}

export async function createMultiRateTaxConfig(
  tenantId: string,
  locationId: string,
  rates: Array<{ name: string; rateDecimal: string }>,
  options: {
    groupName?: string;
    calculationMode?: 'exclusive' | 'inclusive';
  } = {},
): Promise<{ taxGroupId: string; taxRateIds: string[] }> {
  const taxGroupId = testUlid();
  const calculationMode = options.calculationMode || 'exclusive';

  await adminDb.execute(sql`
    INSERT INTO tax_groups (id, tenant_id, location_id, name, calculation_mode, is_active)
    VALUES (${taxGroupId}, ${tenantId}, ${locationId}, ${options.groupName || 'Multi-Rate Group'}, ${calculationMode}, true)
  `);

  const taxRateIds: string[] = [];

  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i]!;
    const taxRateId = testUlid();
    taxRateIds.push(taxRateId);

    await adminDb.execute(sql`
      INSERT INTO tax_rates (id, tenant_id, name, rate_decimal, is_active)
      VALUES (${taxRateId}, ${tenantId}, ${rate.name}, ${rate.rateDecimal}, true)
    `);

    await adminDb.execute(sql`
      INSERT INTO tax_group_rates (id, tenant_id, tax_group_id, tax_rate_id, sort_order)
      VALUES (${testUlid()}, ${tenantId}, ${taxGroupId}, ${taxRateId}, ${i})
    `);
  }

  return { taxGroupId, taxRateIds };
}

// ────────────────────────────────────────────────────────
// Catalog Items
// ────────────────────────────────────────────────────────

export interface TestItemData {
  catalogItemId: string;
  sku: string;
  name: string;
  defaultPrice: string;
}

let itemCounter = 0;

export async function createTestItem(
  tenantId: string,
  overrides: Partial<{
    name: string;
    sku: string;
    defaultPrice: string;
    itemType: string;
    isTrackable: boolean;
    taxGroupId: string;
    locationId: string;
  }> = {},
): Promise<TestItemData> {
  const suffix = ++itemCounter;
  const catalogItemId = testUlid();
  const sku = overrides.sku || `TEST_SKU_${suffix}`;
  const name = overrides.name || `Test Item ${suffix}`;
  const defaultPrice = overrides.defaultPrice || '10.00';

  await adminDb.execute(sql`
    INSERT INTO catalog_items (id, tenant_id, name, sku, item_type, default_price, is_active, is_trackable)
    VALUES (
      ${catalogItemId}, ${tenantId}, ${name}, ${sku},
      ${overrides.itemType || 'retail'}, ${defaultPrice},
      true, ${overrides.isTrackable ?? true}
    )
  `);

  // Assign tax group if provided
  if (overrides.taxGroupId && overrides.locationId) {
    await adminDb.execute(sql`
      INSERT INTO catalog_item_location_tax_groups (id, tenant_id, location_id, catalog_item_id, tax_group_id)
      VALUES (${testUlid()}, ${tenantId}, ${overrides.locationId}, ${catalogItemId}, ${overrides.taxGroupId})
    `);
  }

  return { catalogItemId, sku, name, defaultPrice };
}

// ────────────────────────────────────────────────────────
// Inventory
// ────────────────────────────────────────────────────────

export async function createTestInventoryItem(
  tenantId: string,
  locationId: string,
  catalogItemId: string,
  options: {
    allowNegative?: boolean;
    reorderPoint?: number;
    initialStock?: number;
  } = {},
): Promise<string> {
  const inventoryItemId = testUlid();

  await adminDb.execute(sql`
    INSERT INTO inventory_items (
      id, tenant_id, location_id, catalog_item_id,
      status, track_inventory, allow_negative,
      base_unit, purchase_unit, purchase_to_base_ratio,
      costing_method, reorder_point, reorder_qty
    )
    VALUES (
      ${inventoryItemId}, ${tenantId}, ${locationId}, ${catalogItemId},
      'active', true, ${options.allowNegative ?? false},
      'each', 'each', '1',
      'fifo', ${options.reorderPoint ?? 10}, 50
    )
  `);

  // Seed initial stock if specified
  if (options.initialStock && options.initialStock > 0) {
    await adminDb.execute(sql`
      INSERT INTO inventory_movements (
        id, tenant_id, location_id, inventory_item_id,
        movement_type, quantity_delta,
        reference_type, reference_id,
        source, business_date
      )
      VALUES (
        ${testUlid()}, ${tenantId}, ${locationId}, ${inventoryItemId},
        'initial', ${options.initialStock.toString()},
        'system', ${'seed_' + inventoryItemId},
        'system', ${new Date().toISOString().slice(0, 10)}
      )
    `);
  }

  return inventoryItemId;
}

// ────────────────────────────────────────────────────────
// Orders
// ────────────────────────────────────────────────────────

export async function createTestOrder(
  tenantId: string,
  locationId: string,
  options: {
    status?: string;
    customerId?: string;
    businessDate?: string;
    subtotal?: number;
    taxTotal?: number;
    serviceChargeTotal?: number;
    discountTotal?: number;
    total?: number;
    version?: number;
  } = {},
): Promise<string> {
  const orderId = testUlid();
  const orderNumber = `TEST-${Date.now().toString(36)}`;
  const businessDate = options.businessDate || new Date().toISOString().slice(0, 10);

  await adminDb.execute(sql`
    INSERT INTO orders (
      id, tenant_id, location_id, order_number, status, source,
      business_date, version,
      subtotal, tax_total, service_charge_total, discount_total, total,
      customer_id
    )
    VALUES (
      ${orderId}, ${tenantId}, ${locationId}, ${orderNumber},
      ${options.status || 'open'}, 'pos',
      ${businessDate}, ${options.version ?? 1},
      ${options.subtotal ?? 0}, ${options.taxTotal ?? 0},
      ${options.serviceChargeTotal ?? 0}, ${options.discountTotal ?? 0},
      ${options.total ?? 0},
      ${options.customerId ?? null}
    )
  `);

  return orderId;
}

export async function createTestOrderLine(
  tenantId: string,
  orderId: string,
  locationId: string,
  options: {
    catalogItemId?: string;
    name?: string;
    sku?: string;
    itemType?: string;
    qty?: string;
    unitPrice?: number;
    lineSubtotal?: number;
    lineTax?: number;
    lineTotal?: number;
    sortOrder?: number;
  } = {},
): Promise<string> {
  const lineId = testUlid();
  const qty = options.qty || '1';
  const unitPrice = options.unitPrice ?? 1000;
  const lineSubtotal = options.lineSubtotal ?? Math.round(Number(qty) * unitPrice);
  const lineTax = options.lineTax ?? 0;
  const lineTotal = options.lineTotal ?? (lineSubtotal + lineTax);

  await adminDb.execute(sql`
    INSERT INTO order_lines (
      id, tenant_id, order_id, location_id,
      catalog_item_id, catalog_item_name, catalog_item_sku,
      item_type, qty, unit_price,
      line_subtotal, line_tax, line_total,
      sort_order
    )
    VALUES (
      ${lineId}, ${tenantId}, ${orderId}, ${locationId},
      ${options.catalogItemId ?? testUlid()},
      ${options.name || 'Test Item'},
      ${options.sku || 'TEST_SKU'},
      ${options.itemType || 'retail'},
      ${qty}, ${unitPrice},
      ${lineSubtotal}, ${lineTax}, ${lineTotal},
      ${options.sortOrder ?? 1}
    )
  `);

  return lineId;
}

export async function createTestOrderDiscount(
  tenantId: string,
  orderId: string,
  options: {
    type?: 'percentage' | 'fixed';
    value?: number;
    amount?: number;
    reason?: string;
  } = {},
): Promise<string> {
  const discountId = testUlid();

  await adminDb.execute(sql`
    INSERT INTO order_discounts (id, tenant_id, order_id, type, value, amount, reason)
    VALUES (
      ${discountId}, ${tenantId}, ${orderId},
      ${options.type || 'fixed'}, ${options.value ?? 100},
      ${options.amount ?? 100}, ${options.reason || 'Test discount'}
    )
  `);

  return discountId;
}

export async function createTestServiceCharge(
  tenantId: string,
  orderId: string,
  options: {
    chargeType?: string;
    name?: string;
    calculationType?: 'percentage' | 'fixed';
    value?: number;
    amount?: number;
    isTaxable?: boolean;
    taxAmount?: number;
  } = {},
): Promise<string> {
  const chargeId = testUlid();

  await adminDb.execute(sql`
    INSERT INTO order_charges (
      id, tenant_id, order_id, charge_type, name,
      calculation_type, value, amount, is_taxable, tax_amount
    )
    VALUES (
      ${chargeId}, ${tenantId}, ${orderId},
      ${options.chargeType || 'service_charge'},
      ${options.name || 'Test Charge'},
      ${options.calculationType || 'fixed'},
      ${options.value ?? 500}, ${options.amount ?? 500},
      ${options.isTaxable ?? false}, ${options.taxAmount ?? 0}
    )
  `);

  return chargeId;
}

// ────────────────────────────────────────────────────────
// Payments
// ────────────────────────────────────────────────────────

export async function createTestTender(
  tenantId: string,
  locationId: string,
  orderId: string,
  options: {
    tenderType?: string;
    tenderSequence?: number;
    amount?: number;
    tipAmount?: number;
    amountGiven?: number;
    changeGiven?: number;
    status?: string;
    businessDate?: string;
  } = {},
): Promise<string> {
  const tenderId = testUlid();
  const amount = options.amount ?? 1000;

  await adminDb.execute(sql`
    INSERT INTO tenders (
      id, tenant_id, location_id, order_id,
      tender_type, tender_sequence,
      amount, tip_amount, amount_given, change_given,
      status, business_date
    )
    VALUES (
      ${tenderId}, ${tenantId}, ${locationId}, ${orderId},
      ${options.tenderType || 'cash'}, ${options.tenderSequence ?? 1},
      ${amount}, ${options.tipAmount ?? 0},
      ${options.amountGiven ?? amount}, ${options.changeGiven ?? 0},
      ${options.status || 'captured'},
      ${options.businessDate || new Date().toISOString().slice(0, 10)}
    )
  `);

  return tenderId;
}

export async function createTestTenderReversal(
  tenantId: string,
  orderId: string,
  originalTenderId: string,
  options: {
    reversalType?: 'void' | 'refund';
    amount?: number;
    reason?: string;
  } = {},
): Promise<string> {
  const reversalId = testUlid();

  await adminDb.execute(sql`
    INSERT INTO tender_reversals (
      id, tenant_id, order_id, original_tender_id,
      reversal_type, amount, reason, status
    )
    VALUES (
      ${reversalId}, ${tenantId}, ${orderId}, ${originalTenderId},
      ${options.reversalType || 'void'}, ${options.amount ?? 1000},
      ${options.reason || 'Test reversal'}, 'completed'
    )
  `);

  return reversalId;
}

// ────────────────────────────────────────────────────────
// Customers
// ────────────────────────────────────────────────────────

export async function createTestCustomer(
  tenantId: string,
  overrides: Partial<{
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    type: string;
    taxExempt: boolean;
  }> = {},
): Promise<string> {
  const customerId = testUlid();

  await adminDb.execute(sql`
    INSERT INTO customers (
      id, tenant_id, type, email, first_name, last_name,
      display_name, status, tax_exempt
    )
    VALUES (
      ${customerId}, ${tenantId},
      ${overrides.type || 'person'},
      ${overrides.email || `customer-${Date.now()}@test.local`},
      ${overrides.firstName || 'Test'},
      ${overrides.lastName || 'Customer'},
      ${overrides.displayName || 'Test Customer'},
      'active',
      ${overrides.taxExempt ?? false}
    )
  `);

  return customerId;
}
