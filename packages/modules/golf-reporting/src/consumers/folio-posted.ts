import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import type { GolfFolioPostedData } from '../events';

const CONSUMER_NAME = 'golf-reporting.folioPosted';

/**
 * Handles golf.folio.posted.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. SELECT fact row (get previous revenue values for delta computation)
 * 3. UPDATE fact (SET all revenue fields)
 * 4. UPSERT rm_golf_revenue_daily (increment by deltas, revPerRound recomputed)
 * 5. If customerId: UPSERT rm_golf_customer_play (totalRevenue += deltaTotal)
 */
export async function handleFolioPosted(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as GolfFolioPostedData;

  // Skip if no reservation link — can't attribute revenue to a tee time
  if (!data.reservationId) return;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    // Step 2: SELECT fact row for delta computation
    const factResult = await (tx as any).execute(sql`
      SELECT actual_green_fee, actual_cart_fee, actual_other_fees,
             food_bev, pro_shop, tax, total_revenue,
             customer_id, course_id, business_date
      FROM rm_golf_tee_time_fact
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.reservationId}
      LIMIT 1
    `);
    const factRows = Array.from(factResult as Iterable<{
      actual_green_fee: string;
      actual_cart_fee: string;
      actual_other_fees: string;
      food_bev: string;
      pro_shop: string;
      tax: string;
      total_revenue: string;
      customer_id: string | null;
      course_id: string;
      business_date: string;
    }>);
    if (factRows.length === 0) return; // No fact row — skip

    const fact = factRows[0]!;
    const newGreenFee = data.greenFee ?? 0;
    const newCartFee = data.cartFee ?? 0;
    const newRangeFee = data.rangeFee ?? 0;
    const newFoodBev = data.foodBev ?? 0;
    const newProShop = data.proShop ?? 0;
    const newTax = data.tax ?? 0;
    const newTotal = data.total ?? (newGreenFee + newCartFee + newRangeFee + newFoodBev + newProShop + newTax);

    // Step 3: UPDATE fact — SET revenue fields
    await (tx as any).execute(sql`
      UPDATE rm_golf_tee_time_fact
      SET actual_green_fee = ${newGreenFee},
          actual_cart_fee = ${newCartFee},
          actual_other_fees = ${newRangeFee},
          food_bev = ${newFoodBev},
          pro_shop = ${newProShop},
          tax = ${newTax},
          total_revenue = ${newTotal},
          updated_at = NOW()
      WHERE tenant_id = ${event.tenantId} AND reservation_id = ${data.reservationId}
    `);

    // Step 4: Compute deltas for daily aggregation (supports re-post)
    const deltaGreenFee = newGreenFee - Number(fact.actual_green_fee);
    const deltaCartFee = newCartFee - Number(fact.actual_cart_fee);
    const deltaRangeFee = newRangeFee - Number(fact.actual_other_fees);
    const deltaFoodBev = newFoodBev - Number(fact.food_bev);
    const deltaProShop = newProShop - Number(fact.pro_shop);
    const deltaTax = newTax - Number(fact.tax);
    const deltaTotal = newTotal - Number(fact.total_revenue);

    // Step 5: UPSERT rm_golf_revenue_daily
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_revenue_daily (
        id, tenant_id, course_id, business_date,
        green_fee_revenue, cart_fee_revenue, range_fee_revenue,
        food_bev_revenue, pro_shop_revenue, tax_total, total_revenue,
        rev_per_round, updated_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${fact.course_id}, ${fact.business_date},
        ${deltaGreenFee}, ${deltaCartFee}, ${deltaRangeFee},
        ${deltaFoodBev}, ${deltaProShop}, ${deltaTax}, ${deltaTotal},
        0, NOW()
      )
      ON CONFLICT (tenant_id, course_id, business_date)
      DO UPDATE SET
        green_fee_revenue = rm_golf_revenue_daily.green_fee_revenue + ${deltaGreenFee},
        cart_fee_revenue = rm_golf_revenue_daily.cart_fee_revenue + ${deltaCartFee},
        range_fee_revenue = rm_golf_revenue_daily.range_fee_revenue + ${deltaRangeFee},
        food_bev_revenue = rm_golf_revenue_daily.food_bev_revenue + ${deltaFoodBev},
        pro_shop_revenue = rm_golf_revenue_daily.pro_shop_revenue + ${deltaProShop},
        tax_total = rm_golf_revenue_daily.tax_total + ${deltaTax},
        total_revenue = rm_golf_revenue_daily.total_revenue + ${deltaTotal},
        rev_per_round = CASE WHEN rm_golf_revenue_daily.rounds_played > 0
          THEN (rm_golf_revenue_daily.total_revenue + ${deltaTotal}) / rm_golf_revenue_daily.rounds_played
          ELSE 0 END,
        updated_at = NOW()
    `);

    // Step 6: UPSERT rm_golf_customer_play — totalRevenue += deltaTotal
    const customerId = data.customerId ?? fact.customer_id;
    if (customerId && deltaTotal !== 0) {
      await (tx as any).execute(sql`
        INSERT INTO rm_golf_customer_play (
          id, tenant_id, customer_id, total_revenue, updated_at
        ) VALUES (
          ${generateUlid()}, ${event.tenantId}, ${customerId}, ${deltaTotal}, NOW()
        )
        ON CONFLICT (tenant_id, customer_id)
        DO UPDATE SET
          total_revenue = rm_golf_customer_play.total_revenue + ${deltaTotal},
          updated_at = NOW()
      `);
    }
  });
}
