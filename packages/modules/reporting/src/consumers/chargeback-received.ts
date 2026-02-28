import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const chargebackReceivedSchema = z.object({
  chargebackId: z.string(),
  tenderId: z.string(),
  orderId: z.string(),
  tenderType: z.string().optional(),
  chargebackAmountCents: z.number(),
  feeAmountCents: z.number().optional().default(0),
  locationId: z.string(),
  businessDate: z.string().optional(),
  customerId: z.string().nullable().optional(),
  chargebackReason: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.chargebackReceived';

/**
 * Handles chargeback.received.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Insert rm_revenue_activity with source='chargeback', status='pending'
 *
 * Chargebacks are negative revenue events — they represent funds taken back by
 * the card network. The amount is recorded as negative in revenue activity to
 * provide visibility in sales history. Daily sales are NOT adjusted here because
 * the chargeback reduces the settlement, not the gross sales.
 */
export async function handleChargebackReceived(event: EventEnvelope): Promise<void> {
  const parsed = chargebackReceivedSchema.safeParse(event.data);
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

    // Chargeback uses INTEGER cents — convert to dollars
    const amountDollars = (data.chargebackAmountCents ?? 0) / 100;
    const sourceLabel = `Chargeback #${data.chargebackId.slice(-6)}`;

    // Step 3: Insert rm_revenue_activity (negative amount — funds removed)
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        reference_number, customer_id,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'chargeback'}, ${'chargeback_received'}, ${data.chargebackId}, ${sourceLabel},
        ${data.orderId}, ${data.customerId ?? null},
        ${-amountDollars}, ${'pending'},
        ${JSON.stringify({ tenderId: data.tenderId, tenderType: data.tenderType, reason: data.chargebackReason, feeAmountCents: data.feeAmountCents })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${-amountDollars},
        status = ${'pending'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // NOTE: No rm_daily_sales update — chargebacks reduce settlement proceeds,
    // not the operational gross/net sales figures. GL adapter handles the accounting.
  });
}
