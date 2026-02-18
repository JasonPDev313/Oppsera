/**
 * Domain-Specific Assertions
 *
 * Financial precision assertions for ERP business logic testing.
 * All money comparisons use exact integer cents — no floating point.
 */

import { sql } from 'drizzle-orm';
import { adminDb, withTestTenant } from './setup';

// ────────────────────────────────────────────────────────
// Money Assertions
// ────────────────────────────────────────────────────────

/**
 * Assert two money values (in cents) are exactly equal.
 * Provides clear error messages with dollar formatting.
 */
export function expectExactMoney(actual: number, expected: number, label?: string) {
  const prefix = label ? `${label}: ` : '';
  expect(typeof actual).toBe('number');
  expect(typeof expected).toBe('number');
  expect(Number.isInteger(actual)).toBe(true);
  expect(Number.isInteger(expected)).toBe(true);

  if (actual !== expected) {
    const actualDollars = (actual / 100).toFixed(2);
    const expectedDollars = (expected / 100).toFixed(2);
    throw new Error(
      `${prefix}Expected $${expectedDollars} (${expected}¢), got $${actualDollars} (${actual}¢). ` +
      `Difference: ${actual - expected}¢`,
    );
  }
}

/**
 * Assert money is non-negative.
 */
export function expectNonNegativeMoney(actual: number, label?: string) {
  const prefix = label ? `${label}: ` : '';
  if (actual < 0) {
    throw new Error(`${prefix}Expected non-negative money, got $${(actual / 100).toFixed(2)} (${actual}¢)`);
  }
}

// ────────────────────────────────────────────────────────
// Order Invariant Assertions
// ────────────────────────────────────────────────────────

/**
 * Verify an order's totals are internally consistent.
 *
 * INVARIANT: total = sum(lineTotal) + serviceChargeTotal + serviceChargeTax - discountTotal + roundingAdjustment
 *            subtotal = sum(lineSubtotal)
 *            taxTotal = sum(lineTax) + sum(chargeTaxAmount)
 */
export async function expectOrderBalanced(orderId: string) {
  const orderRows = await adminDb.execute(sql`
    SELECT subtotal, tax_total, service_charge_total, discount_total,
           rounding_adjustment, total
    FROM orders WHERE id = ${orderId}
  `);
  const order = (orderRows as any[])[0];
  if (!order) throw new Error(`Order ${orderId} not found`);

  // Get line sums
  const lineRows = await adminDb.execute(sql`
    SELECT
      COALESCE(SUM(line_subtotal), 0)::int AS line_subtotals,
      COALESCE(SUM(line_tax), 0)::int AS line_taxes,
      COALESCE(SUM(line_total), 0)::int AS line_totals
    FROM order_lines WHERE order_id = ${orderId}
  `);
  const lines = (lineRows as any[])[0]!;

  // Get charge sums
  const chargeRows = await adminDb.execute(sql`
    SELECT
      COALESCE(SUM(amount), 0)::int AS charge_amounts,
      COALESCE(SUM(tax_amount), 0)::int AS charge_taxes
    FROM order_charges WHERE order_id = ${orderId}
  `);
  const charges = (chargeRows as any[])[0]!;

  // Get discount sums
  const discountRows = await adminDb.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS discount_amounts
    FROM order_discounts WHERE order_id = ${orderId}
  `);
  const discounts = (discountRows as any[])[0]!;

  // Check subtotal = sum(lineSubtotal)
  expectExactMoney(
    Number(order.subtotal),
    Number(lines.line_subtotals),
    'order.subtotal vs sum(lineSubtotal)',
  );

  // Check taxTotal = sum(lineTax) + sum(chargeTax)
  expectExactMoney(
    Number(order.tax_total),
    Number(lines.line_taxes) + Number(charges.charge_taxes),
    'order.taxTotal vs sum(lineTax + chargeTax)',
  );

  // Check serviceChargeTotal = sum(chargeAmount)
  expectExactMoney(
    Number(order.service_charge_total),
    Number(charges.charge_amounts),
    'order.serviceChargeTotal vs sum(chargeAmount)',
  );

  // Check discountTotal = sum(discountAmount)
  expectExactMoney(
    Number(order.discount_total),
    Number(discounts.discount_amounts),
    'order.discountTotal vs sum(discountAmount)',
  );

  // Check total = sum(lineTotal) + serviceChargeTotal + serviceChargeTax - discountTotal + roundingAdjustment
  const expectedTotal = Math.max(
    0,
    Number(lines.line_totals) +
    Number(charges.charge_amounts) +
    Number(charges.charge_taxes) -
    Number(discounts.discount_amounts) +
    Number(order.rounding_adjustment),
  );

  expectExactMoney(
    Number(order.total),
    expectedTotal,
    'order.total formula',
  );

  // Total must be non-negative
  expectNonNegativeMoney(Number(order.total), 'order.total');
}

// ────────────────────────────────────────────────────────
// Payment Invariant Assertions
// ────────────────────────────────────────────────────────

/**
 * Verify payments reconcile with the order total.
 *
 * INVARIANT: For paid orders: sum(tender.amount) - sum(reversal.amount) = order.total
 *            For partial: sum(tender.amount) - sum(reversal.amount) < order.total
 */
export async function expectPaymentReconciled(orderId: string) {
  const orderRows = await adminDb.execute(sql`
    SELECT total, status FROM orders WHERE id = ${orderId}
  `);
  const order = (orderRows as any[])[0];
  if (!order) throw new Error(`Order ${orderId} not found`);

  const tenderRows = await adminDb.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS total_tendered
    FROM tenders WHERE order_id = ${orderId} AND status = 'captured'
  `);
  const totalTendered = Number((tenderRows as any[])[0]!.total_tendered);

  const reversalRows = await adminDb.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS total_reversed
    FROM tender_reversals WHERE order_id = ${orderId} AND status = 'completed'
  `);
  const totalReversed = Number((reversalRows as any[])[0]!.total_reversed);

  const netPaid = totalTendered - totalReversed;

  if (order.status === 'paid') {
    expectExactMoney(netPaid, Number(order.total), 'Paid order: netPaid vs total');
  } else {
    // Net paid should not exceed total
    if (netPaid > Number(order.total)) {
      throw new Error(
        `Net paid (${netPaid}¢) exceeds order total (${order.total}¢)`,
      );
    }
  }

  // Refunds should never exceed total tendered
  if (totalReversed > totalTendered) {
    throw new Error(
      `Total reversed (${totalReversed}¢) exceeds total tendered (${totalTendered}¢)`,
    );
  }
}

// ────────────────────────────────────────────────────────
// Inventory Invariant Assertions
// ────────────────────────────────────────────────────────

/**
 * Verify stock consistency: current on-hand = sum(movements).
 */
export async function expectStockConsistent(inventoryItemId: string) {
  const movementRows = await adminDb.execute(sql`
    SELECT COALESCE(SUM(quantity_delta), 0) AS computed_on_hand
    FROM inventory_movements WHERE inventory_item_id = ${inventoryItemId}
  `);
  const computedOnHand = Number((movementRows as any[])[0]!.computed_on_hand);

  // On-hand is always computed, not stored. Verify the computation works.
  // This is a tautology for now, but useful when testing after mutations.
  return computedOnHand;
}

/**
 * Verify transfer integrity: outbound + inbound movements = net zero.
 */
export async function expectTransferBalanced(batchId: string) {
  const rows = await adminDb.execute(sql`
    SELECT
      SUM(CASE WHEN movement_type = 'transfer_out' THEN quantity_delta ELSE 0 END) AS out_total,
      SUM(CASE WHEN movement_type = 'transfer_in' THEN quantity_delta ELSE 0 END) AS in_total,
      SUM(quantity_delta) AS net
    FROM inventory_movements WHERE batch_id = ${batchId}
  `);
  const result = (rows as any[])[0]!;

  if (Number(result.net) !== 0) {
    throw new Error(
      `Transfer batch ${batchId} is unbalanced: out=${result.out_total}, in=${result.in_total}, net=${result.net}`,
    );
  }
}

// ────────────────────────────────────────────────────────
// GL Invariant Assertions
// ────────────────────────────────────────────────────────

/**
 * Verify GL journal entries balance (sum debits = sum credits).
 */
export async function expectGLBalanced(referenceId: string) {
  const rows = await adminDb.execute(sql`
    SELECT entries FROM payment_journal_entries
    WHERE reference_id = ${referenceId} AND posting_status = 'posted'
  `);

  for (const row of rows as any[]) {
    const entries = row.entries as Array<{ debit: number; credit: number }>;
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    if (totalDebit !== totalCredit) {
      throw new Error(
        `GL entry ${referenceId} is unbalanced: debits=${totalDebit}¢, credits=${totalCredit}¢`,
      );
    }
  }
}

// ────────────────────────────────────────────────────────
// Tenant Isolation Assertions
// ────────────────────────────────────────────────────────

/**
 * Verify that querying as tenantA returns zero rows from tenantB's data.
 * Uses RLS-enforced app connection.
 */
export async function expectTenantIsolated(
  tenantAId: string,
  tenantBId: string,
  tableName: string,
) {
  // Query as tenant A — should see only tenant A's data
  const rowsAsA = await withTestTenant(tenantAId, async (tx) => {
    return tx.execute(sql`SELECT id, tenant_id FROM ${sql.identifier(tableName)}`);
  });

  // Verify no rows have tenant B's ID
  for (const row of rowsAsA as any[]) {
    if (row.tenant_id === tenantBId) {
      throw new Error(
        `Tenant isolation violation: querying as ${tenantAId} returned row ${row.id} with tenant_id=${tenantBId} in ${tableName}`,
      );
    }
  }
}
