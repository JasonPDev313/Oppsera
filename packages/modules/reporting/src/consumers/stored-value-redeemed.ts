import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const storedValueRedeemedSchema = z.object({
  instrumentId: z.string(),
  customerId: z.string().optional(),
  instrumentType: z.string().optional(),
  code: z.string().optional(),
  amountCents: z.number(),
  newBalance: z.number().optional(),
  newStatus: z.string().optional(),
  sourceModule: z.string().optional(),
  sourceId: z.string().optional(),
  locationId: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.storedValueRedeemed';

/**
 * Handles customer.stored_value.redeemed.v1 events.
 *
 * Stored value redemption is a liability-to-revenue conversion, NOT new revenue.
 * Like voucher redemptions, we track it in rm_revenue_activity for visibility
 * but do NOT add to rm_daily_sales columns (the original issuance already counted).
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Insert rm_revenue_activity with source='stored_value', source_sub_type='stored_value_redemption'
 */
export async function handleStoredValueRedeemed(event: EventEnvelope): Promise<void> {
  const parsed = storedValueRedeemedSchema.safeParse(event.data);
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
    const businessDate = computeBusinessDate(occurredAt, timezone);

    // Stored value uses INTEGER cents
    const amountDollars = (data.amountCents ?? 0) / 100;
    const codeLabel = data.code ?? data.instrumentId.slice(-6);
    const sourceLabel = `Stored Value Redemption #${codeLabel}`;

    // Unique source_id per redemption event (same instrument can be redeemed multiple times)
    const sourceId = data.sourceId
      ? `sv-redeem-${data.instrumentId}-${data.sourceId}`
      : `sv-redeem-${data.instrumentId}-${event.eventId}`;

    // Step 3: Insert rm_revenue_activity (redemption visibility — not new revenue)
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_id, source_sub_type, source_label,
        customer_id,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'stored_value'}, ${sourceId}, ${'stored_value_redemption'}, ${sourceLabel},
        ${data.customerId ?? null},
        ${amountDollars}, ${'completed'},
        ${JSON.stringify({ instrumentId: data.instrumentId, instrumentType: data.instrumentType, code: data.code, sourceModule: data.sourceModule, newBalance: data.newBalance, newStatus: data.newStatus })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // NOTE: No rm_daily_sales update — stored value redemptions are liability-to-revenue
    // conversions, not new revenue. The original issuance already counted.
  });
}
