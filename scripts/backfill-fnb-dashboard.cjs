/**
 * Backfill FnB Manager Dashboard read models for today's closed tabs.
 *
 * Idempotent: deletes existing read model rows for the target date, then replays.
 * Safe to run multiple times — same result every time.
 *
 * Usage:
 *   node scripts/backfill-fnb-dashboard.cjs                  # today
 *   node scripts/backfill-fnb-dashboard.cjs --date 2026-03-12
 *   node scripts/backfill-fnb-dashboard.cjs --dry-run        # preview only
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const postgres = require('postgres');
const connStr = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connStr) {
  console.error('ERROR: DATABASE_URL not set. Check .env.remote or .env.local');
  process.exit(1);
}
const sql = postgres(connStr, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
const rawDate = dateIdx >= 0 && args[dateIdx + 1] ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);

// ── Input validation ──
if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
  console.error(`ERROR: Invalid date format "${rawDate}" — expected YYYY-MM-DD`);
  process.exit(1);
}
const parsed = new Date(rawDate + 'T00:00:00Z');
if (isNaN(parsed.getTime())) {
  console.error(`ERROR: Invalid date "${rawDate}"`);
  process.exit(1);
}
const targetDate = rawDate;

const READ_MODEL_TABLES = [
  'rm_fnb_server_performance',
  'rm_fnb_table_turns',
  'rm_fnb_daypart_sales',
  'rm_fnb_hourly_sales',
  'rm_fnb_menu_mix',
];

function computeDaypart(hour) {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'late_night';
}

(async () => {
  try {
    console.log(`Backfilling FnB dashboard read models for ${targetDate}${dryRun ? ' (DRY RUN)' : ''}...\n`);

    // 1. Find all closed tabs for the target date
    const tabs = await sql`
      SELECT t.id, t.tenant_id, t.location_id, t.table_id, t.server_user_id,
             t.business_date, t.party_size, t.opened_at, t.closed_at, t.primary_order_id
      FROM fnb_tabs t
      WHERE t.business_date = ${targetDate}
        AND t.status = 'closed'
        AND t.closed_at IS NOT NULL
      ORDER BY t.closed_at
    `;

    console.log(`Found ${tabs.length} closed tab(s) for ${targetDate}\n`);
    if (tabs.length === 0) { await sql.end(); return; }

    // 2. Collect distinct (tenant_id, location_id) pairs to clear read models
    const locKeys = new Set();
    for (const t of tabs) locKeys.add(`${t.tenant_id}|${t.location_id}`);

    // 3. Delete + replay inside a transaction for atomicity (no window of zeros)
    await sql.begin(async (tx) => {
      if (!dryRun) {
        console.log(`Clearing read models for ${locKeys.size} location(s)...\n`);
        for (const key of locKeys) {
          const [tid, lid] = key.split('|');
          for (const tbl of READ_MODEL_TABLES) {
            await tx.unsafe(
              `DELETE FROM ${tbl} WHERE tenant_id = $1 AND location_id = $2 AND business_date = $3`,
              [tid, lid, targetDate]
            );
          }
        }
        console.log('Read models cleared — replaying tabs...\n');
      } else {
        console.log(`Would clear read models for ${locKeys.size} location(s)\n`);
      }

      let processed = 0;
      let skipped = 0;
      const errors = [];

      for (const tab of tabs) {
        const tenantId = tab.tenant_id;
        const orderId = tab.primary_order_id;

        if (!orderId) {
          console.log(`  SKIP tab ${tab.id} — no primaryOrderId`);
          skipped++;
          continue;
        }

        try {
          // Fetch order totals
          const [order] = await tx`
            SELECT total, discount_total, subtotal FROM orders
            WHERE id = ${orderId} AND tenant_id = ${tenantId}
          `;
          if (!order) {
            console.log(`  SKIP tab ${tab.id} — order ${orderId} not found`);
            skipped++;
            continue;
          }

          const totalCents = Number(order.total ?? 0);
          const discountCents = Number(order.discount_total ?? 0);

          if (isNaN(totalCents) || isNaN(discountCents)) {
            console.log(`  SKIP tab ${tab.id} — non-numeric order totals (total=${order.total}, discount=${order.discount_total})`);
            skipped++;
            continue;
          }

          // Fetch tips
          const [tipRow] = await tx`
            SELECT COALESCE(SUM(tip_amount), 0) AS total_tips
            FROM tenders
            WHERE order_id = ${orderId} AND tenant_id = ${tenantId}
          `;
          const tipCents = Number(tipRow?.total_tips ?? 0);

          // Fetch order lines
          const lines = await tx`
            SELECT catalog_item_id, catalog_item_name, qty, line_total
            FROM order_lines
            WHERE order_id = ${orderId} AND tenant_id = ${tenantId}
          `;

          const closedAt = new Date(tab.closed_at);
          if (isNaN(closedAt.getTime())) {
            console.log(`  SKIP tab ${tab.id} — invalid closedAt: ${tab.closed_at}`);
            skipped++;
            continue;
          }

          const hour = closedAt.getHours();
          const partySize = Math.max(1, Number(tab.party_size ?? 1));
          const saleDollars = (totalCents / 100).toFixed(4);
          const tipDollars = (tipCents / 100).toFixed(4);
          const netSalesDollars = ((totalCents - discountCents) / 100).toFixed(4);
          const turnTimeMinutes = tab.opened_at && tab.closed_at
            ? Math.max(0, Math.round((closedAt.getTime() - new Date(tab.opened_at).getTime()) / 60000))
            : null;
          const daypart = computeDaypart(hour);

          console.log(`  Tab ${tab.id}: $${saleDollars} sales, ${partySize} covers, ${lines.length} items, ${daypart}`);

          if (dryRun) { processed++; continue; }

          // ── Upsert rm_fnb_server_performance ──
          await tx`
            INSERT INTO rm_fnb_server_performance (
              id, tenant_id, location_id, server_user_id, business_date,
              covers, total_sales, avg_check, tip_total, tables_turned,
              avg_turn_time_minutes, comps, voids, updated_at
            ) VALUES (
              gen_ulid(), ${tenantId}, ${tab.location_id}, ${tab.server_user_id}, ${tab.business_date},
              ${partySize}, ${saleDollars}, ${saleDollars}, ${tipDollars}, 1,
              ${turnTimeMinutes}, 0, 0, NOW()
            )
            ON CONFLICT (tenant_id, location_id, server_user_id, business_date)
            DO UPDATE SET
              covers = rm_fnb_server_performance.covers + EXCLUDED.covers,
              total_sales = rm_fnb_server_performance.total_sales + EXCLUDED.total_sales,
              avg_check = CASE
                WHEN rm_fnb_server_performance.tables_turned + 1 > 0
                THEN (rm_fnb_server_performance.total_sales + EXCLUDED.total_sales) / (rm_fnb_server_performance.tables_turned + 1)
                ELSE EXCLUDED.avg_check
              END,
              tip_total = rm_fnb_server_performance.tip_total + EXCLUDED.tip_total,
              tip_percentage = CASE
                WHEN (rm_fnb_server_performance.total_sales + EXCLUDED.total_sales) > 0
                THEN ROUND(((rm_fnb_server_performance.tip_total + EXCLUDED.tip_total) / (rm_fnb_server_performance.total_sales + EXCLUDED.total_sales)) * 100, 2)
                ELSE NULL
              END,
              tables_turned = rm_fnb_server_performance.tables_turned + 1,
              avg_turn_time_minutes = CASE
                WHEN ${turnTimeMinutes} IS NOT NULL AND rm_fnb_server_performance.avg_turn_time_minutes IS NOT NULL
                THEN ROUND((rm_fnb_server_performance.avg_turn_time_minutes * rm_fnb_server_performance.tables_turned + ${turnTimeMinutes}) / (rm_fnb_server_performance.tables_turned + 1))
                WHEN ${turnTimeMinutes} IS NOT NULL THEN ${turnTimeMinutes}
                ELSE rm_fnb_server_performance.avg_turn_time_minutes
              END,
              updated_at = NOW()
          `;

          // ── Upsert rm_fnb_table_turns (if dine-in) ──
          if (tab.table_id) {
            await tx`
              INSERT INTO rm_fnb_table_turns (
                id, tenant_id, location_id, table_id, business_date,
                turns_count, avg_party_size, avg_turn_time_minutes,
                avg_check_cents, total_revenue_cents, peak_hour_turns, updated_at
              ) VALUES (
                gen_ulid(), ${tenantId}, ${tab.location_id}, ${tab.table_id}, ${tab.business_date},
                1, ${partySize.toString()}, ${turnTimeMinutes},
                ${totalCents}, ${totalCents}, ${JSON.stringify([{ hour, turns: 1 }])}, NOW()
              )
              ON CONFLICT (tenant_id, location_id, table_id, business_date)
              DO UPDATE SET
                turns_count = rm_fnb_table_turns.turns_count + 1,
                avg_party_size = ROUND(
                  (COALESCE(rm_fnb_table_turns.avg_party_size, 0) * rm_fnb_table_turns.turns_count + ${partySize.toString()})
                  / (rm_fnb_table_turns.turns_count + 1), 2
                ),
                avg_turn_time_minutes = CASE
                  WHEN ${turnTimeMinutes} IS NOT NULL AND rm_fnb_table_turns.avg_turn_time_minutes IS NOT NULL
                  THEN ROUND((rm_fnb_table_turns.avg_turn_time_minutes * rm_fnb_table_turns.turns_count + ${turnTimeMinutes}) / (rm_fnb_table_turns.turns_count + 1))
                  WHEN ${turnTimeMinutes} IS NOT NULL THEN ${turnTimeMinutes}
                  ELSE rm_fnb_table_turns.avg_turn_time_minutes
                END,
                avg_check_cents = ROUND(
                  (rm_fnb_table_turns.total_revenue_cents + ${totalCents}) / (rm_fnb_table_turns.turns_count + 1)
                ),
                total_revenue_cents = rm_fnb_table_turns.total_revenue_cents + ${totalCents},
                updated_at = NOW()
            `;
          }

          // ── Upsert rm_fnb_daypart_sales ──
          await tx`
            INSERT INTO rm_fnb_daypart_sales (
              id, tenant_id, location_id, business_date, daypart,
              covers, order_count, gross_sales, net_sales, avg_check, updated_at
            ) VALUES (
              gen_ulid(), ${tenantId}, ${tab.location_id}, ${tab.business_date}, ${daypart},
              ${partySize}, 1, ${saleDollars}, ${netSalesDollars}, ${saleDollars}, NOW()
            )
            ON CONFLICT (tenant_id, location_id, business_date, daypart)
            DO UPDATE SET
              covers = rm_fnb_daypart_sales.covers + EXCLUDED.covers,
              order_count = rm_fnb_daypart_sales.order_count + 1,
              gross_sales = rm_fnb_daypart_sales.gross_sales + EXCLUDED.gross_sales,
              net_sales = rm_fnb_daypart_sales.net_sales + EXCLUDED.net_sales,
              avg_check = CASE
                WHEN rm_fnb_daypart_sales.order_count + 1 > 0
                THEN (rm_fnb_daypart_sales.gross_sales + EXCLUDED.gross_sales) / (rm_fnb_daypart_sales.order_count + 1)
                ELSE EXCLUDED.avg_check
              END,
              updated_at = NOW()
          `;

          // ── Upsert rm_fnb_hourly_sales ──
          await tx`
            INSERT INTO rm_fnb_hourly_sales (
              id, tenant_id, location_id, business_date, hour,
              covers, order_count, sales_cents, updated_at
            ) VALUES (
              gen_ulid(), ${tenantId}, ${tab.location_id}, ${tab.business_date}, ${hour},
              ${partySize}, 1, ${totalCents}, NOW()
            )
            ON CONFLICT (tenant_id, location_id, business_date, hour)
            DO UPDATE SET
              covers = rm_fnb_hourly_sales.covers + EXCLUDED.covers,
              order_count = rm_fnb_hourly_sales.order_count + 1,
              sales_cents = rm_fnb_hourly_sales.sales_cents + EXCLUDED.sales_cents,
              updated_at = NOW()
          `;

          // ── Upsert rm_fnb_menu_mix per line item ──
          for (const line of lines) {
            const qty = Number(line.qty ?? 1);
            const lineTotal = Number(line.line_total ?? 0);
            if (isNaN(qty) || isNaN(lineTotal)) continue; // skip corrupt lines
            const itemRevDollars = (lineTotal / 100).toFixed(4);
            await tx`
              INSERT INTO rm_fnb_menu_mix (
                id, tenant_id, location_id, business_date, catalog_item_id,
                catalog_item_name, category_name, department_name,
                quantity_sold, revenue, updated_at
              ) VALUES (
                gen_ulid(), ${tenantId}, ${tab.location_id}, ${tab.business_date}, ${line.catalog_item_id},
                ${line.catalog_item_name}, NULL, NULL,
                ${qty.toFixed(4)}, ${itemRevDollars}, NOW()
              )
              ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
              DO UPDATE SET
                quantity_sold = rm_fnb_menu_mix.quantity_sold + EXCLUDED.quantity_sold,
                revenue = rm_fnb_menu_mix.revenue + EXCLUDED.revenue,
                catalog_item_name = EXCLUDED.catalog_item_name,
                updated_at = NOW()
            `;
          }

          processed++;
        } catch (tabErr) {
          console.error(`  ERROR tab ${tab.id}: ${tabErr.message}`);
          errors.push({ tabId: tab.id, error: tabErr.message });
          // Don't throw — continue processing other tabs within the transaction.
          // The delete already happened, so we want to replay as many as possible.
        }
      }

      console.log(`\n${'─'.repeat(50)}`);
      console.log(`Done: ${processed} processed, ${skipped} skipped${dryRun ? ' (dry run — no writes)' : ''}`);
      if (errors.length > 0) {
        console.log(`Errors: ${errors.length}`);
        for (const e of errors) console.log(`  Tab ${e.tabId}: ${e.error}`);
      }
    }); // end transaction

    await sql.end();
  } catch (err) {
    console.error('FATAL:', err);
    await sql.end();
    process.exit(1);
  }
})();
