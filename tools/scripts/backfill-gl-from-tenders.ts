/**
 * One-off script: For each tenant with accounting settings, find tenders that have
 * no corresponding GL journal entry and post them via the POS posting adapter.
 *
 * Idempotent via unique index on (tenant_id, source_module, source_reference_id).
 *
 * Usage:
 *   npx tsx tools/scripts/backfill-gl-from-tenders.ts
 *
 * Options:
 *   --dry-run     Log what would be posted without actually posting
 *   --tenant=ID   Only process a specific tenant
 *   --limit=N     Max tenders to process per tenant (default: 1000)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

// Parse CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];
const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : 1000;

async function main() {
  console.log(`Backfill GL from tenders${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Limit per tenant: ${LIMIT}`);

  // 1. Find tenants with accounting_settings
  const tenantFilter = tenantArg ? sql` AND s.tenant_id = ${tenantArg}` : sql``;
  const tenantsResult = await db.execute(sql`
    SELECT s.tenant_id, t.name AS tenant_name
    FROM accounting_settings s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE 1=1 ${tenantFilter}
  `);
  const tenants = Array.from(tenantsResult as Iterable<Record<string, unknown>>);
  console.log(`Found ${tenants.length} tenant(s) with accounting settings\n`);

  let totalPosted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const tenant of tenants) {
    const tenantId = String(tenant.tenant_id);
    const tenantName = String(tenant.tenant_name);
    console.log(`── Tenant: ${tenantName} (${tenantId}) ──`);

    // 2. Find tenders with no corresponding GL journal entry
    const unpostedResult = await db.execute(sql`
      SELECT t.id AS tender_id,
             t.order_id,
             t.tender_type,
             t.amount,
             t.tip_amount,
             t.business_date,
             t.location_id,
             t.terminal_id,
             t.tender_sequence,
             o.total AS order_total,
             o.subtotal,
             o.tax_total,
             o.discount_total,
             o.service_charge_total,
             o.customer_id
      FROM tenders t
      JOIN orders o ON o.id = t.order_id AND o.tenant_id = t.tenant_id
      WHERE t.tenant_id = ${tenantId}
        AND t.status = 'captured'
        AND NOT EXISTS (
          SELECT 1 FROM gl_journal_entries gje
          WHERE gje.tenant_id = ${tenantId}
            AND gje.source_module = 'pos'
            AND gje.source_reference_id = t.id
        )
      ORDER BY t.created_at ASC
      LIMIT ${LIMIT}
    `);
    const unposted = Array.from(unpostedResult as Iterable<Record<string, unknown>>);

    if (unposted.length === 0) {
      console.log(`  No unposted tenders found\n`);
      continue;
    }
    console.log(`  Found ${unposted.length} unposted tender(s)`);

    // Determine if this is the final tender for each order
    const orderTenderCounts = new Map<string, { total: number; cumulative: number }>();

    for (const t of unposted) {
      const orderId = String(t.order_id);
      const orderTotal = Number(t.order_total);

      if (!orderTenderCounts.has(orderId)) {
        // Count all tenders for this order
        const countResult = await db.execute(sql`
          SELECT COUNT(*) AS cnt, SUM(amount) AS total_tendered
          FROM tenders
          WHERE tenant_id = ${tenantId}
            AND order_id = ${orderId}
            AND status = 'captured'
        `);
        const countRows = Array.from(countResult as Iterable<Record<string, unknown>>);
        const totalTendered = Number(countRows[0]?.total_tendered ?? 0);
        orderTenderCounts.set(orderId, { total: orderTotal, cumulative: totalTendered });
      }
    }

    for (const t of unposted) {
      const tenderId = String(t.tender_id);
      const orderId = String(t.order_id);
      const tenderAmount = Number(t.amount);
      const orderTotal = Number(t.order_total);
      const orderInfo = orderTenderCounts.get(orderId)!;
      const isFullyPaid = orderInfo.cumulative >= orderInfo.total;

      // 3. Load order lines for this tender's order
      const linesResult = await db.execute(sql`
        SELECT catalog_item_id,
               catalog_item_name,
               sub_department_id,
               qty,
               line_subtotal,
               tax_group_id,
               line_tax,
               cost_price,
               package_components
        FROM order_lines
        WHERE tenant_id = ${tenantId}
          AND order_id = ${orderId}
      `);
      const lines = Array.from(linesResult as Iterable<Record<string, unknown>>);

      const enrichedLines = lines.map((l) => ({
        catalogItemId: String(l.catalog_item_id ?? ''),
        catalogItemName: String(l.catalog_item_name ?? ''),
        subDepartmentId: l.sub_department_id ? String(l.sub_department_id) : null,
        qty: Number(l.qty ?? 1),
        extendedPriceCents: Number(l.line_subtotal ?? 0),
        taxGroupId: l.tax_group_id ? String(l.tax_group_id) : null,
        taxAmountCents: Number(l.line_tax ?? 0),
        costCents: l.cost_price != null ? Number(l.cost_price) : null,
        packageComponents: l.package_components ?? null,
      }));

      if (dryRun) {
        console.log(`  [DRY RUN] Would post tender ${tenderId} ($${(tenderAmount / 100).toFixed(2)}) for order ${orderId} (${enrichedLines.length} lines, fullyPaid=${isFullyPaid})`);
        totalSkipped++;
        continue;
      }

      // 4. Reconstruct event payload and call handleTenderForAccounting
      try {
        // Lazy import to avoid loading module before DB is ready
        const { handleTenderForAccounting } = await import(
          '@oppsera/module-accounting'
        );

        const syntheticEvent = {
          id: `backfill-${tenderId}`,
          type: 'tender.recorded.v1',
          tenantId,
          data: {
            tenderId,
            orderId,
            tenantId,
            locationId: String(t.location_id ?? ''),
            tenderType: String(t.tender_type ?? 'cash'),
            paymentMethod: String(t.tender_type ?? 'cash'),
            amount: tenderAmount,
            tipAmount: Number(t.tip_amount ?? 0),
            orderTotal,
            subtotal: Number(t.subtotal ?? 0),
            taxTotal: Number(t.tax_total ?? 0),
            discountTotal: Number(t.discount_total ?? 0),
            serviceChargeTotal: Number(t.service_charge_total ?? 0),
            totalTendered: orderInfo.cumulative,
            isFullyPaid,
            customerId: t.customer_id ? String(t.customer_id) : null,
            terminalId: t.terminal_id ? String(t.terminal_id) : null,
            tenderSequence: Number(t.tender_sequence ?? 1),
            businessDate: String(t.business_date),
            lines: enrichedLines,
          },
          occurredAt: new Date().toISOString(),
        };

        await handleTenderForAccounting(syntheticEvent);
        totalPosted++;
        console.log(`  Posted tender ${tenderId} ($${(tenderAmount / 100).toFixed(2)})`);
      } catch (err) {
        totalErrors++;
        console.error(`  ERROR posting tender ${tenderId}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log('');
  }

  console.log(`\n── Summary ──`);
  console.log(`Posted:  ${totalPosted}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Errors:  ${totalErrors}`);

  await client.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
