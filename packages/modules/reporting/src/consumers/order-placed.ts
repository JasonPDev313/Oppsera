import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';

interface OrderPlacedData {
  orderId: string;
  locationId: string;
  occurredAt?: string;
  customerId?: string;
  customerName?: string;
  lines: Array<{
    catalogItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
    discount: number;
    tax: number;
    lineTotal: number;
  }>;
  totals: {
    gross: number;
    discount: number;
    tax: number;
    net: number;
  };
}

const CONSUMER_NAME = 'reporting.orderPlaced';

/**
 * Handles order.placed.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Upsert rm_daily_sales aggregates
 * 3. Upsert rm_item_sales per line
 * 4. Upsert rm_customer_activity (if customerId present)
 */
export async function handleOrderPlaced(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as OrderPlacedData;

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

    // Step 4: Upsert rm_daily_sales
    const { gross, discount, tax, net } = data.totals;
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, order_count, gross_sales, discount_total, tax_total, net_sales, avg_order_value, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${1}, ${gross}, ${discount}, ${tax}, ${net}, ${net}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        order_count = rm_daily_sales.order_count + 1,
        gross_sales = rm_daily_sales.gross_sales + ${gross},
        discount_total = rm_daily_sales.discount_total + ${discount},
        tax_total = rm_daily_sales.tax_total + ${tax},
        net_sales = rm_daily_sales.net_sales + ${net},
        avg_order_value = CASE
          WHEN (rm_daily_sales.order_count + 1) > 0
          THEN (rm_daily_sales.net_sales + ${net}) / (rm_daily_sales.order_count + 1)
          ELSE 0
        END,
        updated_at = NOW()
    `);

    // Step 5: Upsert rm_item_sales per line
    for (const line of data.lines) {
      await (tx as any).execute(sql`
        INSERT INTO rm_item_sales (id, tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, quantity_sold, gross_revenue, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${line.catalogItemId}, ${line.name}, ${line.quantity}, ${line.lineTotal}, NOW())
        ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
        DO UPDATE SET
          quantity_sold = rm_item_sales.quantity_sold + ${line.quantity},
          gross_revenue = rm_item_sales.gross_revenue + ${line.lineTotal},
          catalog_item_name = ${line.name},
          updated_at = NOW()
      `);
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
