import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const orderVoidedSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string().optional(),
  locationId: z.string(),
  occurredAt: z.string().optional(),
  total: z.number(),
  lines: z.array(z.object({
    catalogItemId: z.string(),
    qty: z.number().optional(),
    lineTotal: z.number().optional(),
  })).optional(),
});

type _OrderVoidedData = z.infer<typeof orderVoidedSchema>;

const CONSUMER_NAME = 'reporting.orderVoided';

/**
 * Handles order.voided.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_daily_sales — increment voidCount/voidTotal, decrease netSales
 * 4. Upsert rm_item_sales — increment quantityVoided/voidRevenue per line
 *
 * NOTE: Voids do NOT decrement orderCount. avgOrderValue is recomputed
 * using the original orderCount but the adjusted netSales.
 */
export async function handleOrderVoided(event: EventEnvelope): Promise<void> {
  const parsed = orderVoidedSchema.safeParse(event.data);
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
    if (rows.length === 0) return;

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
    const businessDate = computeBusinessDate(occurredAt, timezone);

    // Step 3: Upsert rm_daily_sales — voids don't decrement orderCount
    // Event payloads send amounts in cents (INTEGER from orders table).
    // Read models store dollars (NUMERIC(19,4)). Convert at boundary.
    const voidAmount = (data.total ?? 0) / 100;
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, void_count, void_total, net_sales, avg_order_value, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${1}, ${voidAmount}, ${-voidAmount}, ${0}, ${-voidAmount}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        void_count = rm_daily_sales.void_count + 1,
        void_total = rm_daily_sales.void_total + ${voidAmount},
        net_sales = rm_daily_sales.net_sales - ${voidAmount},
        avg_order_value = CASE
          WHEN rm_daily_sales.order_count > 0
          THEN (rm_daily_sales.net_sales - ${voidAmount}) / rm_daily_sales.order_count
          ELSE 0
        END,
        total_business_revenue = (rm_daily_sales.net_sales - ${voidAmount}) + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue,
        updated_at = NOW()
    `);

    // Step 3b: Upsert rm_revenue_activity with status='voided'
    const orderLabel = data.orderNumber ? `Order #${data.orderNumber}` : `Order ${data.orderId.slice(-6)}`;
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_id, source_label,
        amount_dollars, status, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'pos_order'}, ${data.orderId}, ${orderLabel},
        ${voidAmount}, ${'voided'}, ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${voidAmount},
        status = ${'voided'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // Step 4: Upsert rm_item_sales per voided line (if lines present in payload)
    if (data.lines) {
      for (const line of data.lines) {
        const qty = line.qty ?? 1;
        const lineTotal = (line.lineTotal ?? 0) / 100;
        await (tx as any).execute(sql`
          INSERT INTO rm_item_sales (id, tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, quantity_voided, void_revenue, updated_at)
          VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${line.catalogItemId}, ${'Voided Item'}, ${qty}, ${lineTotal}, NOW())
          ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
          DO UPDATE SET
            quantity_voided = rm_item_sales.quantity_voided + ${qty},
            void_revenue = rm_item_sales.void_revenue + ${lineTotal},
            updated_at = NOW()
        `);
      }
    }
  });
}
