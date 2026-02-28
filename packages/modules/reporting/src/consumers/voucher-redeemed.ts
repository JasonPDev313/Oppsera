import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const voucherRedeemedSchema = z.object({
  voucherId: z.string(),
  voucherNumber: z.string().optional(),
  amountCents: z.number(),
  remainingBalanceCents: z.number().optional(),
  locationId: z.string().optional(),
  businessDate: z.string().optional(),
  orderId: z.string().nullish(),
  tenderId: z.string().nullish(),
});

const CONSUMER_NAME = 'reporting.voucherRedeemed';

/**
 * Handles voucher.redeemed.v1 events.
 *
 * Redemption is a liability-to-revenue conversion, NOT new revenue.
 * We track it in rm_revenue_activity for visibility but do NOT
 * add to rm_daily_sales.voucher_revenue (that tracks purchases/deferred revenue).
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Insert rm_revenue_activity with source='voucher', source_sub_type='voucher_redemption'
 */
export async function handleVoucherRedeemed(event: EventEnvelope): Promise<void> {
  const parsed = voucherRedeemedSchema.safeParse(event.data);
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

    // Voucher uses INTEGER cents
    const amountDollars = (data.amountCents ?? 0) / 100;
    const voucherLabel = data.voucherNumber ?? data.voucherId.slice(-6);
    const sourceLabel = `Voucher Redemption #${voucherLabel}`;

    // Use a unique source_id per redemption event (same voucher can be redeemed multiple times)
    const sourceId = data.tenderId
      ? `redeem-${data.voucherId}-${data.tenderId}`
      : `redeem-${data.voucherId}-${event.eventId}`;

    // Step 3: Insert rm_revenue_activity (redemption visibility — not new revenue)
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_id, source_sub_type, source_label,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'voucher'}, ${sourceId}, ${'voucher_redemption'}, ${sourceLabel},
        ${amountDollars}, ${'completed'},
        ${JSON.stringify({ voucherId: data.voucherId, voucherNumber: data.voucherNumber, orderId: data.orderId, tenderId: data.tenderId, remainingBalanceCents: data.remainingBalanceCents })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // NOTE: No rm_daily_sales update — redemptions are liability-to-revenue conversions,
    // not new revenue. The original voucher purchase already counted toward voucher_revenue.
  });
}
