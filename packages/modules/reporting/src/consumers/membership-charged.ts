import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const membershipChargedSchema = z.object({
  membershipId: z.string(),
  billingAccountId: z.string().optional(),
  amountCents: z.number(),
  customerName: z.string().optional(),
  locationId: z.string(),
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
  occurredAt: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.membershipCharged';

/**
 * Handles membership.billing.charged.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_revenue_activity with source='membership'
 * 4. Upsert rm_daily_sales.membership_revenue + recalculate total_business_revenue
 */
export async function handleMembershipCharged(event: EventEnvelope): Promise<void> {
  const parsed = membershipChargedSchema.safeParse(event.data);
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
    const occurredAt = data.occurredAt || event.occurredAt;
    const businessDate = computeBusinessDate(occurredAt, timezone);

    // Membership uses INTEGER cents
    const amountDollars = (data.amountCents ?? 0) / 100;
    const membershipIdShort = data.membershipId.slice(-6);
    const sourceLabel = `Membership #${membershipIdShort}`;

    // Step 3: Upsert rm_revenue_activity
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_id, source_label, customer_name,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'membership'}, ${data.membershipId}, ${sourceLabel}, ${data.customerName ?? null},
        ${amountDollars}, ${'completed'}, ${JSON.stringify({ billingAccountId: data.billingAccountId, billingPeriodStart: data.billingPeriodStart, billingPeriodEnd: data.billingPeriodEnd })},
        ${occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        status = ${'completed'},
        occurred_at = ${occurredAt}::timestamptz
    `);

    // Step 4: Upsert rm_daily_sales.membership_revenue + recalculate total_business_revenue
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, membership_revenue, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amountDollars}, ${amountDollars}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        membership_revenue = rm_daily_sales.membership_revenue + ${amountDollars},
        total_business_revenue = rm_daily_sales.net_sales + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + (rm_daily_sales.membership_revenue + ${amountDollars}) + rm_daily_sales.voucher_revenue,
        updated_at = NOW()
    `);
  });
}
