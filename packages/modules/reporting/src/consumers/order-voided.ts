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
    catalogItemName: z.string().optional(),
    categoryName: z.string().optional(),
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
        order_count = GREATEST(rm_daily_sales.order_count - 1, 0),
        net_sales = rm_daily_sales.net_sales - ${voidAmount},
        avg_order_value = CASE
          WHEN GREATEST(rm_daily_sales.order_count - 1, 0) > 0
          THEN (rm_daily_sales.net_sales - ${voidAmount}) / GREATEST(rm_daily_sales.order_count - 1, 0)
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
      // Batch-resolve item names and categories from order_lines if not in event payload
      let orderLineMap = new Map<string, { name: string; category: string | null }>();
      const needsLookup = data.lines.some((l) => !l.catalogItemName);
      if (needsLookup) {
        const olRows = await (tx as any).execute(sql`
          SELECT ol.catalog_item_id, ol.catalog_item_name, cc.name AS category_name
          FROM order_lines ol
          LEFT JOIN catalog_categories cc ON cc.id = ol.sub_department_id
          WHERE ol.order_id = ${data.orderId} AND ol.tenant_id = ${event.tenantId}
        `);
        for (const r of Array.from(olRows as Iterable<{ catalog_item_id: string; catalog_item_name: string; category_name: string | null }>)) {
          orderLineMap.set(r.catalog_item_id, { name: r.catalog_item_name, category: r.category_name });
        }
      }

      for (const line of data.lines) {
        const qty = line.qty ?? 1;
        const lineTotal = (line.lineTotal ?? 0) / 100;
        const itemName = line.catalogItemName ?? orderLineMap.get(line.catalogItemId)?.name ?? 'Voided Item';
        const categoryName = line.categoryName ?? orderLineMap.get(line.catalogItemId)?.category ?? null;
        await (tx as any).execute(sql`
          INSERT INTO rm_item_sales (id, tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, category_name, quantity_voided, void_revenue, updated_at)
          VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${line.catalogItemId}, ${itemName}, ${categoryName}, ${qty}, ${lineTotal}, NOW())
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
