import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { computeDaypart, computeTurnTimeMinutes } from '../helpers/fnb-reporting-utils';
import type { FnbTabClosedConsumerData } from '../helpers/fnb-reporting-utils';

/**
 * Consumer: handles F&B tab closed events.
 * Upserts into:
 *   - rm_fnb_server_performance
 *   - rm_fnb_table_turns
 *   - rm_fnb_daypart_sales
 *   - rm_fnb_hourly_sales
 *   - rm_fnb_menu_mix
 */
export async function handleFnbTabClosed(
  tenantId: string,
  data: FnbTabClosedConsumerData,
): Promise<void> {
  const saleDollars = (data.totalCents / 100).toFixed(4);
  const tipDollars = (data.tipCents / 100).toFixed(4);
  const compDollars = (data.compCents / 100).toFixed(4);
  const turnTimeMinutes = computeTurnTimeMinutes(data.openedAt, data.closedAt);
  const daypart = computeDaypart(data.hour);

  await withTenant(tenantId, async (tx) => {
    // 1. Server Performance
    await tx.execute(sql`
      INSERT INTO rm_fnb_server_performance (
        id, tenant_id, location_id, server_user_id, business_date,
        covers, total_sales, avg_check, tip_total, tables_turned,
        avg_turn_time_minutes, comps, voids, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.serverUserId}, ${data.businessDate},
        ${data.partySize}, ${saleDollars}, ${saleDollars}, ${tipDollars}, 1,
        ${turnTimeMinutes}, ${compDollars}, 0, NOW()
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
        comps = rm_fnb_server_performance.comps + EXCLUDED.comps,
        updated_at = NOW()
    `);

    // 2. Table Turns (only if we have a table)
    if (data.tableId) {
      const avgCheckCents = data.totalCents;
      await tx.execute(sql`
        INSERT INTO rm_fnb_table_turns (
          id, tenant_id, location_id, table_id, business_date,
          turns_count, avg_party_size, avg_turn_time_minutes,
          avg_check_cents, total_revenue_cents, peak_hour_turns, updated_at
        ) VALUES (
          gen_ulid(), ${tenantId}, ${data.locationId}, ${data.tableId}, ${data.businessDate},
          1, ${data.partySize.toString()}, ${turnTimeMinutes},
          ${avgCheckCents}, ${data.totalCents}, ${JSON.stringify([{ hour: data.hour, turns: 1 }])}, NOW()
        )
        ON CONFLICT (tenant_id, location_id, table_id, business_date)
        DO UPDATE SET
          turns_count = rm_fnb_table_turns.turns_count + 1,
          avg_party_size = ROUND(
            (COALESCE(rm_fnb_table_turns.avg_party_size, 0) * rm_fnb_table_turns.turns_count + ${data.partySize.toString()})
            / (rm_fnb_table_turns.turns_count + 1), 2
          ),
          avg_turn_time_minutes = CASE
            WHEN ${turnTimeMinutes} IS NOT NULL AND rm_fnb_table_turns.avg_turn_time_minutes IS NOT NULL
            THEN ROUND((rm_fnb_table_turns.avg_turn_time_minutes * rm_fnb_table_turns.turns_count + ${turnTimeMinutes}) / (rm_fnb_table_turns.turns_count + 1))
            WHEN ${turnTimeMinutes} IS NOT NULL THEN ${turnTimeMinutes}
            ELSE rm_fnb_table_turns.avg_turn_time_minutes
          END,
          avg_check_cents = ROUND(
            (rm_fnb_table_turns.total_revenue_cents + ${data.totalCents}) / (rm_fnb_table_turns.turns_count + 1)
          ),
          total_revenue_cents = rm_fnb_table_turns.total_revenue_cents + ${data.totalCents},
          updated_at = NOW()
      `);
    }

    // 3. Daypart Sales
    const netSalesDollars = ((data.totalCents - data.discountCents) / 100).toFixed(4);
    await tx.execute(sql`
      INSERT INTO rm_fnb_daypart_sales (
        id, tenant_id, location_id, business_date, daypart,
        covers, order_count, gross_sales, net_sales, avg_check, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.businessDate}, ${daypart},
        ${data.partySize}, 1, ${saleDollars}, ${netSalesDollars}, ${saleDollars}, NOW()
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
    `);

    // 4. Hourly Sales
    await tx.execute(sql`
      INSERT INTO rm_fnb_hourly_sales (
        id, tenant_id, location_id, business_date, hour,
        covers, order_count, sales_cents, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.businessDate}, ${data.hour},
        ${data.partySize}, 1, ${data.totalCents}, NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date, hour)
      DO UPDATE SET
        covers = rm_fnb_hourly_sales.covers + EXCLUDED.covers,
        order_count = rm_fnb_hourly_sales.order_count + 1,
        sales_cents = rm_fnb_hourly_sales.sales_cents + EXCLUDED.sales_cents,
        updated_at = NOW()
    `);

    // 5. Menu Mix — one upsert per item
    for (const item of data.items) {
      const itemRevDollars = (item.revenueCents / 100).toFixed(4);
      await tx.execute(sql`
        INSERT INTO rm_fnb_menu_mix (
          id, tenant_id, location_id, business_date, catalog_item_id,
          catalog_item_name, category_name, department_name,
          quantity_sold, revenue, updated_at
        ) VALUES (
          gen_ulid(), ${tenantId}, ${data.locationId}, ${data.businessDate}, ${item.catalogItemId},
          ${item.catalogItemName}, ${item.categoryName}, ${item.departmentName},
          ${item.quantity.toFixed(4)}, ${itemRevDollars}, NOW()
        )
        ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
        DO UPDATE SET
          quantity_sold = rm_fnb_menu_mix.quantity_sold + EXCLUDED.quantity_sold,
          revenue = rm_fnb_menu_mix.revenue + EXCLUDED.revenue,
          catalog_item_name = EXCLUDED.catalog_item_name,
          category_name = COALESCE(EXCLUDED.category_name, rm_fnb_menu_mix.category_name),
          department_name = COALESCE(EXCLUDED.department_name, rm_fnb_menu_mix.department_name),
          updated_at = NOW()
      `);
    }
  });
}
