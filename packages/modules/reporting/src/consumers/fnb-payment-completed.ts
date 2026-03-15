import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const fnbPaymentCompletedSchema = z.object({
  paymentSessionId: z.string(),
  tabId: z.string(),
  orderId: z.string(),
  locationId: z.string(),
  totalTendersCents: z.number(),
  changeCents: z.number().nullish(),
});

const CONSUMER_NAME = 'reporting.fnbPaymentCompleted';

/**
 * Handles fnb.payment.completed.v1 events.
 *
 * F&B orders bypass the orders module's placeOrder command, so order.placed.v1
 * is never fired. This consumer fills the gap by reading the order details from
 * the orders table and populating the same reporting read models:
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Read order + order_lines + tab details from DB
 * 4. Upsert rm_revenue_activity with source='pos_order', source_sub_type='pos_fnb'
 * 5. Upsert rm_daily_sales aggregates
 * 6. Upsert rm_item_sales per order line
 * 7. Upsert rm_customer_activity (if customerId present)
 */
export async function handleFnbPaymentCompleted(event: EventEnvelope): Promise<void> {
  const parsed = fnbPaymentCompletedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

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

    // Step 2: Read order details from the orders table
    const orderResult = await (tx as any).execute(sql`
      SELECT id, order_number, location_id, customer_id, subtotal, tax_total,
             discount_total, service_charge_total, total, tab_name, table_number,
             employee_id, business_date, placed_at, created_at
      FROM orders
      WHERE id = ${data.orderId} AND tenant_id = ${event.tenantId}
    `);
    const orderRows = Array.from(orderResult as Iterable<Record<string, unknown>>);
    if (orderRows.length === 0) {
      console.warn(`[${CONSUMER_NAME}] Order ${data.orderId} not found for event ${event.eventId}`);
      return;
    }
    const order = orderRows[0]!;

    // Step 3: Read tab details for enrichment (server, customer)
    const tabResult = await (tx as any).execute(sql`
      SELECT server_user_id, customer_id, tab_number, tab_name, table_id
      FROM fnb_tabs
      WHERE id = ${data.tabId} AND tenant_id = ${event.tenantId}
    `);
    const tabRows = Array.from(tabResult as Iterable<Record<string, unknown>>);
    const tab = tabRows[0];

    // Step 4: Look up location timezone
    const locationId = data.locationId || (order.location_id as string) || '';
    const [location] = await (tx as any)
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, event.tenantId),
          eq(locations.id, locationId),
        ),
      )
      .limit(1);

    const timezone = location?.timezone ?? 'America/New_York';
    const occurredAt = (order.placed_at as string) || (order.created_at as string) || event.occurredAt;

    // Step 5: Compute business date — prefer order's stored business_date
    const businessDate = (order.business_date as string) || computeBusinessDate(occurredAt, timezone);

    // Step 6: Convert cents → dollars for read models
    const subtotalCents = Number(order.subtotal) || 0;
    const taxCents = Number(order.tax_total) || 0;
    const discountCents = Number(order.discount_total) || 0;
    const serviceChargeCents = Number(order.service_charge_total) || 0;
    const totalCents = Number(order.total) || 0;

    const gross = subtotalCents / 100;
    const tax = taxCents / 100;
    const discount = discountCents / 100;
    const serviceCharge = serviceChargeCents / 100;
    const net = totalCents / 100;

    // Resolve customer info — order table or tab
    const customerId = (order.customer_id as string) || (tab?.customer_id as string) || null;

    // Resolve employee — look up name if we have an ID
    const employeeId = (order.employee_id as string) || (tab?.server_user_id as string) || null;
    let employeeName: string | null = null;
    if (employeeId) {
      const empResult = await (tx as any).execute(sql`
        SELECT name FROM users WHERE id = ${employeeId} LIMIT 1
      `);
      const empRows = Array.from(empResult as Iterable<Record<string, unknown>>);
      employeeName = (empRows[0]?.name as string) || null;
    }

    // Resolve customer name
    let customerName: string | null = null;
    if (customerId) {
      const custResult = await (tx as any).execute(sql`
        SELECT
          COALESCE(first_name || ' ' || last_name, first_name, last_name, 'Guest') AS name
        FROM customers
        WHERE id = ${customerId} AND tenant_id = ${event.tenantId}
        LIMIT 1
      `);
      const custRows = Array.from(custResult as Iterable<Record<string, unknown>>);
      customerName = (custRows[0]?.name as string) || null;
    }

    const orderLabel = order.order_number
      ? `Order #${order.order_number}`
      : `Order ${data.orderId.slice(-6)}`;

    // Step 7: Upsert rm_revenue_activity
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        reference_number, customer_name, customer_id,
        employee_id, employee_name,
        amount_dollars, subtotal_dollars, tax_dollars,
        discount_dollars, service_charge_dollars,
        status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'pos_order'}, ${'pos_fnb'}, ${data.orderId}, ${orderLabel},
        ${(order.order_number as string) ?? null}, ${customerName}, ${customerId},
        ${employeeId}, ${employeeName},
        ${net}, ${gross}, ${tax},
        ${discount}, ${serviceCharge},
        ${'completed'}, ${JSON.stringify({ tabId: data.tabId, customerId })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${net},
        subtotal_dollars = ${gross},
        tax_dollars = ${tax},
        discount_dollars = ${discount},
        service_charge_dollars = ${serviceCharge},
        source_sub_type = ${'pos_fnb'},
        reference_number = COALESCE(${(order.order_number as string) ?? null}, rm_revenue_activity.reference_number),
        customer_name = COALESCE(${customerName}, rm_revenue_activity.customer_name),
        customer_id = COALESCE(${customerId}, rm_revenue_activity.customer_id),
        employee_id = COALESCE(${employeeId}, rm_revenue_activity.employee_id),
        employee_name = COALESCE(${employeeName}, rm_revenue_activity.employee_name),
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // Step 8: Upsert rm_daily_sales
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        order_count, gross_sales, discount_total, service_charge_total,
        tax_total, net_sales, avg_order_value, total_business_revenue, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${1}, ${gross}, ${discount}, ${serviceCharge},
        ${tax}, ${net}, ${net}, ${net}, NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        order_count = rm_daily_sales.order_count + 1,
        gross_sales = rm_daily_sales.gross_sales + ${gross},
        discount_total = rm_daily_sales.discount_total + ${discount},
        service_charge_total = rm_daily_sales.service_charge_total + ${serviceCharge},
        tax_total = rm_daily_sales.tax_total + ${tax},
        net_sales = rm_daily_sales.net_sales + ${net},
        avg_order_value = CASE
          WHEN (rm_daily_sales.order_count + 1) > 0
          THEN (rm_daily_sales.net_sales + ${net}) / (rm_daily_sales.order_count + 1)
          ELSE 0
        END,
        total_business_revenue = (rm_daily_sales.net_sales + ${net}) + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue + rm_daily_sales.spa_revenue,
        updated_at = NOW()
    `);

    // Step 9: Upsert rm_item_sales per order line
    const linesResult = await (tx as any).execute(sql`
      SELECT catalog_item_id, catalog_item_name, qty, line_total
      FROM order_lines
      WHERE order_id = ${data.orderId} AND tenant_id = ${event.tenantId}
    `);
    const lineRows = Array.from(linesResult as Iterable<Record<string, unknown>>);

    for (const line of lineRows) {
      const itemName = (line.catalog_item_name as string) || 'Unknown';
      const qty = Number(line.qty) || 1;
      const lineTotal = (Number(line.line_total) || 0) / 100;
      await (tx as any).execute(sql`
        INSERT INTO rm_item_sales (id, tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, quantity_sold, gross_revenue, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${line.catalog_item_id as string}, ${itemName}, ${qty}, ${lineTotal}, NOW())
        ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
        DO UPDATE SET
          quantity_sold = rm_item_sales.quantity_sold + ${qty},
          gross_revenue = rm_item_sales.gross_revenue + ${lineTotal},
          catalog_item_name = ${itemName},
          updated_at = NOW()
      `);
    }

    // Step 10: Upsert rm_customer_activity (if customerId present)
    if (customerId) {
      const custName = customerName ?? 'Unknown';
      await (tx as any).execute(sql`
        INSERT INTO rm_customer_activity (id, tenant_id, customer_id, customer_name, total_visits, total_spend, last_visit_at, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${customerId}, ${custName}, ${1}, ${net}, ${occurredAt}::timestamptz, NOW())
        ON CONFLICT (tenant_id, customer_id)
        DO UPDATE SET
          total_visits = rm_customer_activity.total_visits + 1,
          total_spend = rm_customer_activity.total_spend + ${net},
          last_visit_at = CASE
            WHEN ${occurredAt}::timestamptz > rm_customer_activity.last_visit_at
            THEN ${occurredAt}::timestamptz
            ELSE rm_customer_activity.last_visit_at
          END,
          customer_name = ${custName},
          updated_at = NOW()
      `);
    }
  });
}
