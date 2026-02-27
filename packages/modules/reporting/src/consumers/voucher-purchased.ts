import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const voucherPurchasedSchema = z.object({
  voucherId: z.string(),
  amountCents: z.number(),
  voucherNumber: z.string().optional(),
  orderId: z.string().nullish(),
  locationId: z.string(),
  customerName: z.string().optional(),
  occurredAt: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.voucherPurchased';

/**
 * Handles voucher.purchased.v1 events.
 *
 * Only processes STANDALONE voucher purchases (orderId == null).
 * POS voucher purchases already flow through order.placed.v1.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Skip if orderId is present (POS voucher — already counted)
 * 3. Insert processed_events (idempotency)
 * 4. Upsert rm_revenue_activity with source='voucher'
 * 5. Upsert rm_daily_sales.voucher_revenue + recalculate total_business_revenue
 */
export async function handleVoucherPurchased(event: EventEnvelope): Promise<void> {
  const parsed = voucherPurchasedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  // Skip POS voucher purchases — already counted via order.placed.v1
  if (data.orderId) return;

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

    // Voucher uses INTEGER cents
    const amountDollars = (data.amountCents ?? 0) / 100;
    const voucherLabel = data.voucherNumber ?? data.voucherId.slice(-6);
    const sourceLabel = `Voucher #${voucherLabel}`;

    // Step 3: Upsert rm_revenue_activity
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_id, source_label, customer_name,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'voucher'}, ${data.voucherId}, ${sourceLabel}, ${data.customerName ?? null},
        ${amountDollars}, ${'completed'}, ${JSON.stringify({ voucherNumber: data.voucherNumber })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // Step 4: Upsert rm_daily_sales.voucher_revenue + recalculate total_business_revenue
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, voucher_revenue, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amountDollars}, ${amountDollars}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        voucher_revenue = rm_daily_sales.voucher_revenue + ${amountDollars},
        total_business_revenue = rm_daily_sales.net_sales + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + (rm_daily_sales.voucher_revenue + ${amountDollars}),
        updated_at = NOW()
    `);
  });
}
