import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const arInvoiceVoidedSchema = z.object({
  invoiceId: z.string(),
  customerId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  totalAmount: z.union([z.string(), z.number()]),
  reason: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.arInvoiceVoided';

/**
 * Handles ar.invoice.voided.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Update rm_revenue_activity status to 'voided' for matching AR invoice
 * 4. Upsert rm_daily_sales — increment voidCount/voidTotal, decrease ar_revenue + total_business_revenue
 */
export async function handleArInvoiceVoided(event: EventEnvelope): Promise<void> {
  const parsed = arInvoiceVoidedSchema.safeParse(event.data);
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
    if (rows.length === 0) return;

    // Step 2: Look up location timezone
    const locationId = event.locationId || '';
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
    const businessDate = computeBusinessDate(occurredAt, timezone);

    // AR uses NUMERIC dollars (string or number), not cents
    const amountDollars = Number(data.totalAmount) || 0;

    // Step 3: Update rm_revenue_activity status to 'voided'
    await (tx as any).execute(sql`
      UPDATE rm_revenue_activity
      SET status = 'voided',
          occurred_at = ${occurredAt}::timestamptz
      WHERE tenant_id = ${event.tenantId}
        AND source = 'ar_invoice'
        AND source_id = ${data.invoiceId}
    `);

    // Step 4: Upsert rm_daily_sales — increment voidCount/voidTotal, decrease ar_revenue
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, void_count, void_total, ar_revenue, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${1}, ${amountDollars}, ${-amountDollars}, ${-amountDollars}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        void_count = rm_daily_sales.void_count + 1,
        void_total = rm_daily_sales.void_total + ${amountDollars},
        ar_revenue = rm_daily_sales.ar_revenue - ${amountDollars},
        total_business_revenue = rm_daily_sales.net_sales + rm_daily_sales.pms_revenue + (rm_daily_sales.ar_revenue - ${amountDollars}) + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue,
        updated_at = NOW()
    `);
  });
}
