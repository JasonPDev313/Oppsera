/**
 * Enterprise Seed Validation: Verify data integrity after running seed-enterprise-transactions.ts
 *
 * Runs 12 validation queries covering:
 * 1. Total revenue / order count
 * 2. Revenue by department (F&B / Retail / Services)
 * 3. Monthly revenue trend
 * 4. Tax liability totals
 * 5. GL balance integrity (debits = credits)
 * 6. Inventory on-hand vs movements
 * 7. Tender type breakdown
 * 8. Discount summary
 * 9. Void rate
 * 10. Daily sales read model consistency
 * 11. Item sales distribution
 * 12. Tips summary
 *
 * Usage:
 *   npx tsx tools/scripts/validate-enterprise-seed.ts
 *   npx tsx tools/scripts/validate-enterprise-seed.ts --tenant=<ID>
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_ADMIN or DATABASE_URL required');

const client = postgres(connectionString, { max: 1, prepare: false });

const args = process.argv.slice(2);
const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];

function fmt$(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDollars(dollars: number): string {
  return '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  // Resolve tenant
  const tenantResult = tenantArg
    ? await client`SELECT id, name FROM tenants WHERE id = ${tenantArg}`
    : await client`SELECT id, name FROM tenants WHERE slug = 'sunset-golf'`;

  if (tenantResult.length === 0) {
    console.error('ERROR: Tenant not found.');
    process.exit(1);
  }

  const tenantId = tenantResult[0]!.id as string;
  const tenantName = tenantResult[0]!.name as string;

  console.log(`\n========================================`);
  console.log(`  Enterprise Seed Validation Report`);
  console.log(`  Tenant: ${tenantName}`);
  console.log(`  ID: ${tenantId}`);
  console.log(`========================================\n`);

  let passCount = 0;
  let failCount = 0;

  function check(name: string, condition: boolean, detail: string) {
    if (condition) {
      console.log(`  ✓ ${name}: ${detail}`);
      passCount++;
    } else {
      console.log(`  ✗ ${name}: ${detail}`);
      failCount++;
    }
  }

  // ── 1. Total Revenue & Order Count ───────────────────────────────
  console.log('1. TOTAL REVENUE & ORDER COUNT');
  const revenueResult = await client`
    SELECT
      COUNT(*) AS total_orders,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_orders,
      COUNT(*) FILTER (WHERE status = 'voided') AS voided_orders,
      COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS total_revenue_cents,
      COALESCE(SUM(subtotal) FILTER (WHERE status = 'paid'), 0) AS total_subtotal_cents,
      COALESCE(SUM(tax_total) FILTER (WHERE status = 'paid'), 0) AS total_tax_cents,
      COALESCE(SUM(discount_total) FILTER (WHERE status = 'paid'), 0) AS total_discount_cents
    FROM orders
    WHERE tenant_id = ${tenantId} AND source = 'seed'
  `;
  const rev = revenueResult[0]!;
  const totalRevCents = Number(rev.total_revenue_cents);
  const totalOrders = Number(rev.total_orders);
  const paidOrders = Number(rev.paid_orders);
  const voidedOrders = Number(rev.voided_orders);

  console.log(`  Total Orders:     ${totalOrders.toLocaleString()}`);
  console.log(`  Paid Orders:      ${paidOrders.toLocaleString()}`);
  console.log(`  Voided Orders:    ${voidedOrders.toLocaleString()}`);
  console.log(`  Total Revenue:    ${fmt$(totalRevCents)}`);

  check('Revenue range', totalRevCents >= 95000000 && totalRevCents <= 110000000,
    `${fmt$(totalRevCents)} (target: $950K–$1.1M)`);
  check('Order count', totalOrders >= 3000 && totalOrders <= 15000,
    `${totalOrders} orders (target: 3K–15K)`);
  check('Void rate', voidedOrders / totalOrders < 0.03,
    `${((voidedOrders / totalOrders) * 100).toFixed(1)}% (target: <3%)`);

  // ── 2. Revenue by Item Type ──────────────────────────────────────
  console.log('\n2. REVENUE BY ITEM TYPE');
  const typeResult = await client`
    SELECT
      ol.item_type,
      COALESCE(SUM(ol.line_subtotal), 0) AS subtotal_cents,
      COUNT(DISTINCT o.id) AS order_count
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id
    WHERE ol.tenant_id = ${tenantId}
      AND o.source = 'seed'
      AND o.status = 'paid'
    GROUP BY ol.item_type
    ORDER BY subtotal_cents DESC
  `;

  let fnbCents = 0;
  let retailCents = 0;
  let serviceCents = 0;

  for (const row of typeResult) {
    const type = row.item_type as string;
    const cents = Number(row.subtotal_cents);
    console.log(`  ${type.padEnd(15)} ${fmt$(cents).padStart(15)}  (${Number(row.order_count)} orders)`);

    if (['food', 'beverage'].includes(type)) fnbCents += cents;
    else if (['retail', 'green_fee', 'rental'].includes(type)) retailCents += cents;
    else serviceCents += cents; // service
  }

  const totalTypeCents = fnbCents + retailCents + serviceCents;
  if (totalTypeCents > 0) {
    console.log(`\n  F&B:     ${((fnbCents / totalTypeCents) * 100).toFixed(1)}%`);
    console.log(`  Retail:  ${((retailCents / totalTypeCents) * 100).toFixed(1)}%`);
    console.log(`  Service: ${((serviceCents / totalTypeCents) * 100).toFixed(1)}%`);

    check('F&B ratio', fnbCents / totalTypeCents >= 0.40 && fnbCents / totalTypeCents <= 0.75,
      `${((fnbCents / totalTypeCents) * 100).toFixed(1)}% (target: 40–75%)`);
  }

  // ── 3. Monthly Revenue Trend ─────────────────────────────────────
  console.log('\n3. MONTHLY REVENUE TREND');
  const monthlyResult = await client`
    SELECT
      TO_CHAR(business_date::date, 'YYYY-MM') AS month,
      COUNT(*) FILTER (WHERE status = 'paid') AS order_count,
      COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS revenue_cents
    FROM orders
    WHERE tenant_id = ${tenantId} AND source = 'seed'
    GROUP BY TO_CHAR(business_date::date, 'YYYY-MM')
    ORDER BY month
  `;

  let peakMonth = '';
  let peakCents = 0;
  let troughMonth = '';
  let troughCents = Infinity;

  for (const row of monthlyResult) {
    const cents = Number(row.revenue_cents);
    const month = row.month as string;
    console.log(`  ${month}  ${fmt$(cents).padStart(15)}  (${row.order_count} orders)`);

    if (cents > peakCents) { peakCents = cents; peakMonth = month; }
    if (cents < troughCents) { troughCents = cents; troughMonth = month; }
  }

  console.log(`\n  Peak:   ${peakMonth} (${fmt$(peakCents)})`);
  console.log(`  Trough: ${troughMonth} (${fmt$(troughCents)})`);

  check('Seasonality ratio', peakCents / troughCents >= 1.5,
    `Peak/Trough = ${(peakCents / troughCents).toFixed(1)}x (target: ≥1.5x)`);

  // ── 4. Tax Liability ─────────────────────────────────────────────
  console.log('\n4. TAX LIABILITY');
  const taxResult = await client`
    SELECT
      COALESCE(SUM(tax_total), 0) AS total_tax_cents
    FROM orders
    WHERE tenant_id = ${tenantId} AND source = 'seed' AND status = 'paid'
  `;
  const totalTax = Number(taxResult[0]!.total_tax_cents);
  console.log(`  Total Tax Collected: ${fmt$(totalTax)}`);

  // Effective tax rate
  const totalSubtotal = Number(rev.total_subtotal_cents);
  const effectiveRate = totalSubtotal > 0 ? totalTax / totalSubtotal : 0;
  console.log(`  Effective Rate:     ${(effectiveRate * 100).toFixed(2)}%`);

  check('Tax rate', effectiveRate >= 0.02 && effectiveRate <= 0.10,
    `${(effectiveRate * 100).toFixed(2)}% (target: 2–10%)`);

  // ── 5. GL Balance Integrity ──────────────────────────────────────
  console.log('\n5. GL BALANCE INTEGRITY');
  const glBalanceResult = await client`
    SELECT
      COALESCE(SUM(CAST(jl.debit_amount AS NUMERIC)), 0) AS total_debits,
      COALESCE(SUM(CAST(jl.credit_amount AS NUMERIC)), 0) AS total_credits,
      COUNT(DISTINCT je.id) AS entry_count
    FROM gl_journal_entries je
    JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.tenant_id = ${tenantId}
      AND je.source_module = 'pos'
      AND je.status = 'posted'
  `;
  const glBal = glBalanceResult[0]!;
  const totalDebits = Number(glBal.total_debits);
  const totalCredits = Number(glBal.total_credits);
  const glEntryCount = Number(glBal.entry_count);
  const difference = Math.abs(totalDebits - totalCredits);

  console.log(`  GL Entries:    ${glEntryCount.toLocaleString()}`);
  console.log(`  Total Debits:  ${fmtDollars(totalDebits)}`);
  console.log(`  Total Credits: ${fmtDollars(totalCredits)}`);
  console.log(`  Difference:    ${fmtDollars(difference)}`);

  if (glEntryCount > 0) {
    check('GL balanced', difference < 0.02,
      `Difference = ${fmtDollars(difference)} (threshold: <$0.02)`);
  } else {
    console.log('  (No GL entries — accounting not configured)');
  }

  // ── 6. Inventory Balances ────────────────────────────────────────
  console.log('\n6. INVENTORY BALANCES');
  const invResult = await client`
    SELECT
      ii.name,
      ii.catalog_item_id,
      COALESCE(SUM(CAST(im.quantity_delta AS NUMERIC)), 0) AS computed_on_hand,
      COUNT(im.id) AS movement_count
    FROM inventory_items ii
    LEFT JOIN inventory_movements im ON im.inventory_item_id = ii.id AND im.tenant_id = ii.tenant_id
    WHERE ii.tenant_id = ${tenantId}
    GROUP BY ii.id, ii.name, ii.catalog_item_id
    ORDER BY ii.name
  `;

  for (const row of invResult) {
    const onHand = Number(row.computed_on_hand);
    console.log(`  ${(row.name as string).padEnd(25)} On-hand: ${String(onHand).padStart(6)}  (${row.movement_count} movements)`);
  }

  // Check no negative inventory (unless allowNegative)
  const negInv = invResult.filter((r: Record<string, unknown>) => Number(r.computed_on_hand) < 0);
  check('No negative inventory', negInv.length === 0,
    negInv.length === 0 ? 'All items have non-negative on-hand' : `${negInv.length} items with negative on-hand`);

  // ── 7. Tender Type Breakdown ─────────────────────────────────────
  console.log('\n7. TENDER TYPE BREAKDOWN');
  const tenderResult = await client`
    SELECT
      tender_type,
      COUNT(*) AS count,
      COALESCE(SUM(amount), 0) AS total_cents,
      COALESCE(SUM(tip_amount), 0) AS total_tips_cents
    FROM tenders
    WHERE tenant_id = ${tenantId}
    GROUP BY tender_type
    ORDER BY total_cents DESC
  `;

  for (const row of tenderResult) {
    console.log(`  ${(row.tender_type as string).padEnd(12)} ${String(row.count).padStart(6)} tenders  ${fmt$(Number(row.total_cents)).padStart(15)}  tips: ${fmt$(Number(row.total_tips_cents))}`);
  }

  // ── 8. Discount Summary ──────────────────────────────────────────
  console.log('\n8. DISCOUNT SUMMARY');
  const discountResult = await client`
    SELECT
      type,
      COUNT(*) AS count,
      COALESCE(SUM(amount), 0) AS total_cents,
      reason
    FROM order_discounts
    WHERE tenant_id = ${tenantId}
    GROUP BY type, reason
    ORDER BY total_cents DESC
  `;

  let totalDiscountsCents = 0;
  for (const row of discountResult) {
    const cents = Number(row.total_cents);
    totalDiscountsCents += cents;
    console.log(`  ${(row.type as string).padEnd(12)} ${(row.reason as string).padEnd(20)} ${String(row.count).padStart(4)}x  ${fmt$(cents)}`);
  }
  console.log(`  Total Discounts: ${fmt$(totalDiscountsCents)}`);

  const discountRate = totalSubtotal > 0 ? totalDiscountsCents / totalSubtotal : 0;
  check('Discount rate', discountRate <= 0.10,
    `${(discountRate * 100).toFixed(1)}% of subtotal (target: ≤10%)`);

  // ── 9. Void Analysis ─────────────────────────────────────────────
  console.log('\n9. VOID ANALYSIS');
  const voidResult = await client`
    SELECT
      void_reason,
      COUNT(*) AS count,
      COALESCE(SUM(total), 0) AS total_cents
    FROM orders
    WHERE tenant_id = ${tenantId} AND source = 'seed' AND status = 'voided'
    GROUP BY void_reason
    ORDER BY count DESC
  `;

  for (const row of voidResult) {
    console.log(`  ${(row.void_reason as string || 'Unknown').padEnd(25)} ${String(row.count).padStart(4)}x  ${fmt$(Number(row.total_cents))}`);
  }

  // ── 10. Daily Sales Read Model Consistency ───────────────────────
  console.log('\n10. DAILY SALES READ MODEL');
  const rmResult = await client`
    SELECT
      COUNT(*) AS day_count,
      COALESCE(SUM(CAST(net_sales AS NUMERIC)), 0) AS rm_net_sales,
      COALESCE(SUM(order_count), 0) AS rm_order_count,
      COALESCE(SUM(CAST(tax_total AS NUMERIC)), 0) AS rm_tax_total
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
  `;
  const rm = rmResult[0]!;
  const rmNetSales = Number(rm.rm_net_sales);
  const rmOrderCount = Number(rm.rm_order_count);

  console.log(`  Days with data:   ${rm.day_count}`);
  console.log(`  RM Net Sales:     ${fmtDollars(rmNetSales)}`);
  console.log(`  RM Order Count:   ${rmOrderCount}`);

  // Compare RM totals with actual orders
  const rmVsActualDiff = Math.abs(rmNetSales - totalRevCents / 100);
  check('RM consistency', rmVsActualDiff < 10,
    `RM vs Orders diff = ${fmtDollars(rmVsActualDiff)} (threshold: <$10)`);

  // ── 11. Item Sales Distribution ──────────────────────────────────
  console.log('\n11. TOP SELLING ITEMS');
  const itemSalesResult = await client`
    SELECT
      catalog_item_name,
      SUM(quantity_sold) AS total_qty,
      SUM(CAST(gross_revenue AS NUMERIC)) AS total_revenue
    FROM rm_item_sales
    WHERE tenant_id = ${tenantId}
    GROUP BY catalog_item_name
    ORDER BY total_revenue DESC
    LIMIT 15
  `;

  for (const row of itemSalesResult) {
    console.log(`  ${(row.catalog_item_name as string).padEnd(30)} ${String(row.total_qty).padStart(8)} sold  ${fmtDollars(Number(row.total_revenue)).padStart(15)}`);
  }

  const itemCount = itemSalesResult.length;
  check('Item coverage', itemCount >= 8,
    `${itemCount} items with sales (target: ≥8 of 10 catalog items)`);

  // ── 12. Tips Summary ─────────────────────────────────────────────
  console.log('\n12. TIPS SUMMARY');
  const tipsResult = await client`
    SELECT
      COALESCE(SUM(tip_amount), 0) AS total_tips_cents,
      COUNT(*) FILTER (WHERE tip_amount > 0) AS tipped_count,
      COUNT(*) AS total_count
    FROM tenders
    WHERE tenant_id = ${tenantId}
  `;
  const tips = tipsResult[0]!;
  const totalTips = Number(tips.total_tips_cents);
  const tippedCount = Number(tips.tipped_count);
  const totalTenderCount = Number(tips.total_count);

  console.log(`  Total Tips:    ${fmt$(totalTips)}`);
  console.log(`  Tipped Orders: ${tippedCount} / ${totalTenderCount} (${((tippedCount / totalTenderCount) * 100).toFixed(1)}%)`);

  const tipRate = totalRevCents > 0 ? totalTips / totalRevCents : 0;
  console.log(`  Tip Rate:      ${(tipRate * 100).toFixed(1)}% of revenue`);

  check('Tip presence', tippedCount > 0,
    `${tippedCount} tenders with tips`);

  // ── Final Report ─────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`  VALIDATION RESULTS: ${passCount} passed, ${failCount} failed`);
  console.log('========================================\n');

  if (failCount > 0) {
    console.log('⚠  Some validations failed. Review output above.\n');
  } else {
    console.log('All validations passed.\n');
  }

  await client.end();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
