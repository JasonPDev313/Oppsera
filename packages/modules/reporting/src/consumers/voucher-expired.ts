import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const voucherExpiredSchema = z.object({
  voucherId: z.string(),
  voucherNumber: z.string().optional(),
  expirationAmountCents: z.number(),
  expirationDate: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.voucherExpired';

/**
 * Handles voucher.expired.v1 events.
 *
 * Expiration is breakage income — the unredeemed balance that the business
 * recognizes as income. GL adapter handles the accounting (Dr Liability Cr Breakage Income).
 * This consumer provides visibility in the Sales History read model.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Insert rm_revenue_activity with source='voucher', source_sub_type='voucher_expiration'
 */
export async function handleVoucherExpired(event: EventEnvelope): Promise<void> {
  const parsed = voucherExpiredSchema.safeParse(event.data);
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
    // Voucher expiration is a background job — no locationId in payload
    const locationId = event.locationId || '';
    const [location] = locationId
      ? await (tx as any)
          .select({ timezone: locations.timezone })
          .from(locations)
          .where(
            and(
              eq(locations.tenantId, event.tenantId),
              eq(locations.id, locationId),
            ),
          )
          .limit(1)
      : [null];

    const timezone = location?.timezone ?? 'America/New_York';
    const occurredAt = data.expirationDate || event.occurredAt;
    const businessDate = computeBusinessDate(occurredAt, timezone);

    // Voucher uses INTEGER cents
    const amountDollars = (data.expirationAmountCents ?? 0) / 100;
    const voucherLabel = data.voucherNumber ?? data.voucherId.slice(-6);
    const sourceLabel = `Voucher Expired #${voucherLabel}`;

    // Unique source_id per expiration
    const sourceId = `expire-${data.voucherId}`;

    // Step 3: Insert rm_revenue_activity (expiration visibility — breakage income)
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_id, source_sub_type, source_label,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'voucher'}, ${sourceId}, ${'voucher_expiration'}, ${sourceLabel},
        ${amountDollars}, ${'completed'},
        ${JSON.stringify({ voucherId: data.voucherId, voucherNumber: data.voucherNumber })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // NOTE: No rm_daily_sales update — expiration is breakage income recognition,
    // not new operational revenue. GL adapter handles the accounting entry.
  });
}
