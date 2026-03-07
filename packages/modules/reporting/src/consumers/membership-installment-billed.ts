import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const installmentBilledSchema = z.object({
  contractId: z.string(),
  membershipAccountId: z.string().nullish(),
  scheduleEntryId: z.string(),
  periodIndex: z.number(),
  dueDate: z.string().nullish(),
  paymentCents: z.number(),
  principalCents: z.number().nullish(),
  interestCents: z.number().nullish(),
});

const CONSUMER_NAME = 'reporting.membershipInstallmentBilled';

/**
 * Handles membership.initiation.installment.billed.v1 events.
 *
 * Atomically:
 * 1. Validate event payload
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_revenue_activity with source='membership', source_sub_type='initiation_installment'
 * 4. Upsert rm_daily_sales.membership_revenue + recalculate total_business_revenue
 */
export async function handleMembershipInstallmentBilled(event: EventEnvelope): Promise<void> {
  const parsed = installmentBilledSchema.safeParse(event.data);
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
    let timezone = 'America/New_York';
    if (locationId) {
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
      timezone = location?.timezone ?? 'America/New_York';
    }
    const businessDate = computeBusinessDate(event.occurredAt, timezone);

    const amountDollars = (data.paymentCents ?? 0) / 100;
    const sourceLabel = `Initiation #${data.contractId.slice(-6)} P${data.periodIndex}`;

    // Step 3: Upsert rm_revenue_activity
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        amount_dollars, status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'membership'}, ${'initiation_installment'}, ${data.scheduleEntryId}, ${sourceLabel},
        ${amountDollars}, ${'completed'},
        ${JSON.stringify({ contractId: data.contractId, membershipAccountId: data.membershipAccountId, periodIndex: data.periodIndex, dueDate: data.dueDate })},
        ${event.occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        status = ${'completed'},
        occurred_at = ${event.occurredAt}::timestamptz
    `);

    // Step 4: Upsert rm_daily_sales.membership_revenue + recalculate total_business_revenue
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, membership_revenue, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amountDollars}, ${amountDollars}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        membership_revenue = rm_daily_sales.membership_revenue + ${amountDollars},
        total_business_revenue = rm_daily_sales.net_sales + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + (rm_daily_sales.membership_revenue + ${amountDollars}) + rm_daily_sales.voucher_revenue + rm_daily_sales.spa_revenue,
        updated_at = NOW()
    `);
  });
}
