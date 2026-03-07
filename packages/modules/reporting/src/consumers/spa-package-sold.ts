import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const spaPackageSoldSchema = z.object({
  balanceId: z.string(),
  customerId: z.string().nullish(),
  packageDefId: z.string().nullish(),
  packageName: z.string().nullish(),
  packageType: z.string().nullish(),
  sessionsTotal: z.number().nullish(),
  creditsTotal: z.number().nullish(),
  sellingPriceCents: z.number(),
  purchaseDate: z.string().nullish(),
  expirationDate: z.string().nullish(),
  orderId: z.string().nullish(),
});

const CONSUMER_NAME = 'reporting.spaPackageSold';

/**
 * Handles spa.package.sold.v1 events.
 *
 * Only processes STANDALONE spa package purchases (orderId == null).
 * POS-linked package purchases already flow through order.placed.v1.
 *
 * Atomically:
 * 1. Validate event payload
 * 2. Skip if orderId is present (POS sale — already counted)
 * 3. Insert processed_events (idempotency)
 * 4. Upsert rm_revenue_activity with source='spa', source_sub_type='spa_package'
 * 5. Upsert rm_daily_sales.spa_revenue + recalculate total_business_revenue
 */
export async function handleSpaPackageSold(event: EventEnvelope): Promise<void> {
  const parsed = spaPackageSoldSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  // Skip POS-linked package purchases — already counted via order.placed.v1
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

    const amountDollars = (data.sellingPriceCents ?? 0) / 100;
    const packageLabel = data.packageName
      ? `Spa Pkg: ${data.packageName}`
      : `Spa Pkg #${data.balanceId.slice(-6)}`;

    // Step 3: Upsert rm_revenue_activity
    await (tx as any).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        customer_id, amount_dollars,
        status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'spa'}, ${'spa_package'}, ${data.balanceId}, ${packageLabel},
        ${data.customerId ?? null}, ${amountDollars},
        ${'completed'}, ${JSON.stringify({ packageDefId: data.packageDefId, packageType: data.packageType })},
        ${event.occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${amountDollars},
        customer_id = COALESCE(${data.customerId ?? null}, rm_revenue_activity.customer_id),
        status = ${'completed'},
        occurred_at = ${event.occurredAt}::timestamptz
    `);

    // Step 4: Upsert rm_daily_sales.spa_revenue + recalculate total_business_revenue
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, spa_revenue, total_business_revenue, updated_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amountDollars}, ${amountDollars}, NOW())
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        spa_revenue = rm_daily_sales.spa_revenue + ${amountDollars},
        total_business_revenue = rm_daily_sales.net_sales + rm_daily_sales.pms_revenue + rm_daily_sales.ar_revenue + rm_daily_sales.membership_revenue + rm_daily_sales.voucher_revenue + (rm_daily_sales.spa_revenue + ${amountDollars}),
        updated_at = NOW()
    `);
  });
}
