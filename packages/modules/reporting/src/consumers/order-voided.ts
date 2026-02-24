import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';

interface OrderVoidedData {
  orderId: string;
  locationId: string;
  occurredAt?: string;
  total: number;
  lines?: Array<{
    catalogItemId: string;
    qty?: number;
    lineTotal?: number;
  }>;
}

const CONSUMER_NAME = 'reporting.orderVoided';

/**
 * Handles order.voided.v1 events.
 *
 * Atomically:
 * 1. Insert processed_events (idempotency)
 * 2. Upsert rm_daily_sales — increment voidCount/voidTotal, decrease netSales
 * 3. Upsert rm_item_sales — increment quantityVoided/voidRevenue per line
 *
 * NOTE: Voids do NOT decrement orderCount. avgOrderValue is recomputed
 * using the original orderCount but the adjusted netSales.
 */
export async function handleOrderVoided(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as OrderVoidedData;

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
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, void_count, void_total, net_sales, avg_order_value, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${1}, ${voidAmount}, ${-voidAmount}, ${0}, NOW())
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
        updated_at = NOW()
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
