import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const folioChargePostedSchema = z.object({
  folioId: z.string(),
  reservationId: z.string().optional(),
  entryId: z.string(),
  entryType: z.string(),
  amountCents: z.number(),
  guestName: z.string().optional(),
  locationId: z.string(),
  occurredAt: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.folioChargePosted';

// Non-revenue entry types that should NOT contribute to revenue totals.
// Everything else (ROOM_CHARGE, TAX, FEE, SERVICE_CHARGE, MINI_BAR, PARKING,
// SPA, RESTAURANT, LAUNDRY, PHONE, INTERNET, DAMAGE, INCIDENTAL, etc.) IS revenue.
const NON_REVENUE_ENTRY_TYPES = new Set([
  'PAYMENT', 'REFUND', 'CREDIT', 'ADJUSTMENT', 'DEPOSIT', 'TRANSFER',
]);

/**
 * Handles pms.folio.charge_posted.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Skip non-revenue entry types (payments, refunds, adjustments)
 * 3. Insert processed_events (idempotency)
 * 4. Upsert rm_revenue_activity with source='pms_folio'
 * 5. Upsert rm_daily_sales.pms_revenue + recalculate total_business_revenue
 */
export async function handleFolioChargePosted(event: EventEnvelope): Promise<void> {
  const parsed = folioChargePostedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  // Skip non-revenue entry types (payments, refunds, credits, adjustments)
  if (NON_REVENUE_ENTRY_TYPES.has(data.entryType)) return;

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

    // PMS uses INTEGER cents
    const amountDollars = (data.amountCents ?? 0) / 100;
    const entryIdShort = data.entryId.slice(-6);
    const sourceLabel = `Folio ${data.entryType} #${entryIdShort}`;

    // Step 3: Upsert rm_revenue_activity
    const folioIdShort = data.folioId.slice(-8);
    const referenceNumber = `F-${folioIdShort}`;
    // Classify amount into subtotal, tax, or service charge based on entry type
    const isTax = data.entryType === 'TAX';
    const isServiceCharge = data.entryType === 'FEE' || data.entryType === 'SERVICE_CHARGE';
    const subtotalDollars = (!isTax && !isServiceCharge) ? amountDollars : 0;
    const taxDollars = isTax ? amountDollars : 0;
    const serviceChargeFolio = isServiceCharge ? amountDollars : 0;

    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label, customer_name,
        reference_number, customer_id,
        amount_dollars, subtotal_dollars, tax_dollars, service_charge_dollars,
        status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'pms_folio'}, ${'pms_folio'}, ${data.entryId}, ${sourceLabel}, ${data.guestName ?? null},
        ${referenceNumber}, ${null},
        ${amountDollars}, ${subtotalDollars}, ${taxDollars}, ${serviceChargeFolio},
        ${'completed'}, ${JSON.stringify({ folioId: data.folioId, reservationId: data.reservationId, entryType: data.entryType })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        subtotal_dollars = ${subtotalDollars},
        tax_dollars = ${taxDollars},
        service_charge_dollars = ${serviceChargeFolio},
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // Step 4: Upsert rm_daily_sales.pms_revenue + recalculate total_business_revenue
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, pms_revenue, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amountDollars}, ${amountDollars}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        pms_revenue = rm_daily_sales.pms_revenue + ${amountDollars},
        total_business_revenue = rm_daily_sales.net_sales + (rm_daily_sales.pms_revenue + ${amountDollars}) + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue,
        updated_at = NOW()
    `);
  });
}
