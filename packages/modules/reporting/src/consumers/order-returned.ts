import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const orderReturnedSchema = z.object({
  returnOrderId: z.string(),
  originalOrderId: z.string(),
  returnType: z.enum(['full', 'partial']),
  locationId: z.string(),
  businessDate: z.string().optional(),
  customerId: z.string().nullable().optional(),
  returnTotal: z.number(), // positive cents representing refund value
  lines: z.array(z.object({
    catalogItemId: z.string(),
    catalogItemName: z.string().optional(),
    qty: z.number(),
    returnedSubtotal: z.number(),
    returnedTax: z.number(),
    returnedTotal: z.number(),
    subDepartmentId: z.string().nullable().optional(),
  })).optional(),
});

type _OrderReturnedData = z.infer<typeof orderReturnedSchema>;

const CONSUMER_NAME = 'reporting.orderReturned';

/**
 * Handles order.returned.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_daily_sales — increment returnTotal, decrease netSales
 * 4. Insert rm_revenue_activity with source='pos_order', source_sub_type='pos_return', status='returned'
 *
 * NOTE: Returns are separate from voids. The original order already counted
 * the revenue via order.placed.v1. The return reduces daily revenue.
 * returnTotal in the event is positive cents (the refund amount).
 */
export async function handleOrderReturned(event: EventEnvelope): Promise<void> {
  const parsed = orderReturnedSchema.safeParse(event.data);
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
    const occurredAt = event.occurredAt;
    const businessDate = data.businessDate || computeBusinessDate(occurredAt, timezone);

    // Step 3: Upsert rm_daily_sales — returns decrease netSales
    // Event payload sends returnTotal in cents (INTEGER from orders table).
    // Read models store dollars (NUMERIC(19,4)). Convert at boundary.
    const returnAmount = (data.returnTotal ?? 0) / 100;
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, return_total, net_sales, avg_order_value, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${returnAmount}, ${-returnAmount}, ${0}, ${-returnAmount}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        return_total = rm_daily_sales.return_total + ${returnAmount},
        net_sales = rm_daily_sales.net_sales - ${returnAmount},
        avg_order_value = CASE
          WHEN rm_daily_sales.order_count > 0
          THEN (rm_daily_sales.net_sales - ${returnAmount}) / rm_daily_sales.order_count
          ELSE 0
        END,
        total_business_revenue = (rm_daily_sales.net_sales - ${returnAmount}) + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue,
        updated_at = NOW()
    `);

    // Step 4: Insert rm_revenue_activity with status='returned'
    const returnLabel = `Return #${data.returnOrderId.slice(-6)} (of ${data.originalOrderId.slice(-6)})`;
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        amount_dollars, status, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'pos_order'}, ${'pos_return'}, ${data.returnOrderId}, ${returnLabel},
        ${returnAmount}, ${'returned'}, ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${returnAmount},
        status = ${'returned'},
        occurred_at = ${occurredAt}::timestamptz
    `);
  });
}
