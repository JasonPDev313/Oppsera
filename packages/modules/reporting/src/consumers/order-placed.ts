import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const packageComponentSchema = z.object({
  catalogItemId: z.string(),
  itemName: z.string().optional(),
  catalogItemName: z.string().optional(),
  qty: z.number(),
  allocatedRevenueCents: z.number().optional(),
});

const orderPlacedSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string().optional(),
  locationId: z.string(),
  occurredAt: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  subtotal: z.number(),
  taxTotal: z.number(),
  discountTotal: z.number().optional(),
  serviceChargeTotal: z.number().optional(),
  total: z.number(),
  // Sales History enrichment
  tabName: z.string().nullish(),
  tableNumber: z.union([z.string(), z.number()]).nullish(),
  employeeId: z.string().nullish(),
  employeeName: z.string().nullish(),
  lines: z.array(z.object({
    catalogItemId: z.string(),
    catalogItemName: z.string().optional(),
    categoryName: z.string().nullish(),
    qty: z.number(),
    lineTotal: z.number().optional(),
    packageComponents: z.array(packageComponentSchema).nullish(),
  })),
});

type _OrderPlacedData = z.infer<typeof orderPlacedSchema>;

const CONSUMER_NAME = 'reporting.orderPlaced';

/**
 * Handles order.placed.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_daily_sales aggregates
 * 4. Upsert rm_item_sales per line
 * 5. Upsert rm_customer_activity (if customerId present)
 */
export async function handleOrderPlaced(event: EventEnvelope): Promise<void> {
  const parsed = orderPlacedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return; // Skip — corrupt payload would produce NaN in read models
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

    // Step 2: Look up location timezone
    const locationId = data.locationId || event.locationId || '';
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
    const occurredAt = data.occurredAt || event.occurredAt;

    // Step 3: Compute business date
    const businessDate = computeBusinessDate(occurredAt, timezone);

    // Step 4: Upsert rm_daily_sales — map from flat event payload
    // Event payloads send amounts in cents (INTEGER from orders table).
    // Read models store dollars (NUMERIC(19,4)). Convert at boundary.
    const gross = (data.subtotal ?? 0) / 100;
    const discount = (data.discountTotal ?? 0) / 100;
    const serviceCharge = (data.serviceChargeTotal ?? 0) / 100;
    const tax = (data.taxTotal ?? 0) / 100;
    const net = (data.total ?? 0) / 100;
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
        total_business_revenue = (rm_daily_sales.net_sales + ${net}) + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue,
        updated_at = NOW()
    `);

    // Step 4b: Upsert rm_revenue_activity with source='pos_order'
    // Detect F&B: if tabName or tableNumber present, this is an F&B order
    const isFnb = !!(data.tabName || data.tableNumber);
    const sourceSubType = isFnb ? 'pos_fnb' : 'pos_retail';
    const orderLabel = data.orderNumber ? `Order #${data.orderNumber}` : `Order ${data.orderId.slice(-6)}`;
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
        ${'pos_order'}, ${sourceSubType}, ${data.orderId}, ${orderLabel},
        ${data.orderNumber ?? null}, ${data.customerName ?? null}, ${data.customerId ?? null},
        ${data.employeeId ?? null}, ${data.employeeName ?? null},
        ${net}, ${gross}, ${tax},
        ${discount}, ${serviceCharge},
        ${'completed'}, ${JSON.stringify({ customerId: data.customerId })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${net},
        subtotal_dollars = ${gross},
        tax_dollars = ${tax},
        discount_dollars = ${discount},
        service_charge_dollars = ${serviceCharge},
        source_sub_type = ${sourceSubType},
        reference_number = COALESCE(${data.orderNumber ?? null}, rm_revenue_activity.reference_number),
        customer_name = COALESCE(${data.customerName ?? null}, rm_revenue_activity.customer_name),
        customer_id = COALESCE(${data.customerId ?? null}, rm_revenue_activity.customer_id),
        employee_id = COALESCE(${data.employeeId ?? null}, rm_revenue_activity.employee_id),
        employee_name = COALESCE(${data.employeeName ?? null}, rm_revenue_activity.employee_name),
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // Step 5: Upsert rm_item_sales per line (or per component for enriched packages)
    for (const line of data.lines) {
      const comps = line.packageComponents;
      const hasComponentAllocation =
        comps && comps.length > 0 && comps[0]!.allocatedRevenueCents != null;

      // Category name from the enriched event (null for older events)
      const lineCategoryName = line.categoryName ?? null;

      if (hasComponentAllocation) {
        // Package with allocation: record each component's revenue separately
        for (const comp of comps!) {
          const compName = comp.itemName ?? comp.catalogItemName ?? 'Unknown';
          const compQty = comp.qty ?? 1;
          const compRevenueDollars = (comp.allocatedRevenueCents ?? 0) / 100;
          await (tx as any).execute(sql`
            INSERT INTO rm_item_sales (id, tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, category_name, quantity_sold, gross_revenue, updated_at)
            VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${comp.catalogItemId}, ${compName}, ${lineCategoryName}, ${compQty}, ${compRevenueDollars}, NOW())
            ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
            DO UPDATE SET
              quantity_sold = rm_item_sales.quantity_sold + ${compQty},
              gross_revenue = rm_item_sales.gross_revenue + ${compRevenueDollars},
              catalog_item_name = ${compName},
              category_name = COALESCE(${lineCategoryName}, rm_item_sales.category_name),
              updated_at = NOW()
          `);
        }
      } else {
        // Regular item OR package without allocation (backward-compat): record line itself
        const itemName = line.catalogItemName ?? 'Unknown';
        const qty = line.qty ?? 1;
        const lineTotal = (line.lineTotal ?? 0) / 100;
        await (tx as any).execute(sql`
          INSERT INTO rm_item_sales (id, tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, category_name, quantity_sold, gross_revenue, updated_at)
          VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${line.catalogItemId}, ${itemName}, ${lineCategoryName}, ${qty}, ${lineTotal}, NOW())
          ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
          DO UPDATE SET
            quantity_sold = rm_item_sales.quantity_sold + ${qty},
            gross_revenue = rm_item_sales.gross_revenue + ${lineTotal},
            catalog_item_name = ${itemName},
            category_name = COALESCE(${lineCategoryName}, rm_item_sales.category_name),
            updated_at = NOW()
        `);
      }
    }

    // Step 6: Upsert rm_customer_activity (if customerId present)
    const customerId = data.customerId;
    if (customerId) {
      const customerName = data.customerName ?? 'Unknown';
      await (tx as any).execute(sql`
        INSERT INTO rm_customer_activity (id, tenant_id, customer_id, customer_name, total_visits, total_spend, last_visit_at, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${customerId}, ${customerName}, ${1}, ${net}, ${occurredAt}::timestamptz, NOW())
        ON CONFLICT (tenant_id, customer_id)
        DO UPDATE SET
          total_visits = rm_customer_activity.total_visits + 1,
          total_spend = rm_customer_activity.total_spend + ${net},
          last_visit_at = CASE
            WHEN ${occurredAt}::timestamptz > rm_customer_activity.last_visit_at
            THEN ${occurredAt}::timestamptz
            ELSE rm_customer_activity.last_visit_at
          END,
          customer_name = ${customerName},
          updated_at = NOW()
      `);
    }
  });
}
