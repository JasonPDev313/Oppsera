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

    // Step 2: Look up original business_date and location_id from the revenue activity row
    // Decrementing today's rm_daily_sales is wrong — we must reverse the ORIGINAL posting date
    const origActivity = await (tx as any).execute(sql`
      SELECT business_date, location_id FROM rm_revenue_activity
      WHERE tenant_id = ${event.tenantId}
        AND source = 'ar_invoice'
        AND source_id = ${data.invoiceId}
      LIMIT 1
    `);
    const origRows = Array.from(origActivity as Iterable<Record<string, unknown>>);

    let businessDate: string;
    // Use original location_id from the revenue activity row when available
    const locationId = (origRows.length > 0 && origRows[0]!.location_id)
      ? String(origRows[0]!.location_id)
      : (event.locationId || '');
    if (origRows.length > 0 && origRows[0]!.business_date) {
      // Use the original posting's business date
      businessDate = String(origRows[0]!.business_date).slice(0, 10);
    } else {
      // Fallback: compute from event time (best effort)
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
      businessDate = computeBusinessDate(event.occurredAt, timezone);
    }

    // AR uses NUMERIC dollars (string or number), not cents
    const amountDollars = Number(data.totalAmount) || 0;

    // Step 3: Update rm_revenue_activity status to 'voided'
    await (tx as any).execute(sql`
      UPDATE rm_revenue_activity
      SET status = 'voided'
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
