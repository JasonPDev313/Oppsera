import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const guestPaySucceededSchema = z.object({
  sessionId: z.string(),
  tabId: z.string().optional(),
  orderId: z.string().nullish(),
  locationId: z.string(),
  amountCents: z.number(),
  tipCents: z.number().optional(),
  paymentMethod: z.string(),
  memberId: z.string().optional(),
  memberDisplayName: z.string().optional(),
  billingAccountId: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.guestPaySucceeded';

const KNOWN_TENDER_TYPES = new Set(['cash', 'card', 'gift_card', 'house_account', 'ach']);

/**
 * Handles fnb.guestpay.payment_succeeded.v1 events.
 *
 * Guest pay is a payment channel — the order itself is already recorded via
 * order.placed.v1 (which creates the rm_revenue_activity row with source='pos_order').
 * This consumer updates the tender breakdown in rm_daily_sales and enriches
 * the existing rm_revenue_activity row with the payment method.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_daily_sales tender columns
 * 4. Update rm_revenue_activity with payment_method + tip
 */
export async function handleGuestPaySucceeded(event: EventEnvelope): Promise<void> {
  const parsed = guestPaySucceededSchema.safeParse(event.data);
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

    // cents → dollars
    const amountDollars = (data.amountCents ?? 0) / 100;
    const tipDollars = (data.tipCents ?? 0) / 100;
    const paymentMethod = data.paymentMethod || 'card';

    const tenderCash = paymentMethod === 'cash' ? amountDollars : 0;
    const tenderCard = paymentMethod === 'card' ? amountDollars : 0;
    const tenderGiftCard = paymentMethod === 'gift_card' ? amountDollars : 0;
    const tenderHouseAccount = paymentMethod === 'house_account' ? amountDollars : 0;
    const tenderAch = paymentMethod === 'ach' ? amountDollars : 0;
    const tenderOther = !KNOWN_TENDER_TYPES.has(paymentMethod) ? amountDollars : 0;

    // Step 3: Upsert rm_daily_sales tender columns
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        tender_cash, tender_card, tender_gift_card, tender_house_account,
        tender_ach, tender_other, tip_total,
        updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${tenderCash}, ${tenderCard}, ${tenderGiftCard}, ${tenderHouseAccount},
        ${tenderAch}, ${tenderOther}, ${tipDollars},
        NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        tender_cash = rm_daily_sales.tender_cash + ${tenderCash},
        tender_card = rm_daily_sales.tender_card + ${tenderCard},
        tender_gift_card = rm_daily_sales.tender_gift_card + ${tenderGiftCard},
        tender_house_account = rm_daily_sales.tender_house_account + ${tenderHouseAccount},
        tender_ach = rm_daily_sales.tender_ach + ${tenderAch},
        tender_other = rm_daily_sales.tender_other + ${tenderOther},
        tip_total = rm_daily_sales.tip_total + ${tipDollars},
        updated_at = NOW()
    `);

    // Step 4: Update rm_revenue_activity with payment_method + tip on existing order row
    const orderId = data.orderId;
    if (orderId) {
      await (tx as any).execute(sql`
        UPDATE rm_revenue_activity
        SET payment_method = CASE
              WHEN payment_method IS NOT NULL AND payment_method != ${paymentMethod}
              THEN 'split'
              ELSE ${paymentMethod}
            END,
            tip_dollars = COALESCE(tip_dollars, 0) + ${tipDollars},
            updated_at = NOW()
        WHERE tenant_id = ${event.tenantId}
          AND source = 'pos_order'
          AND source_id = ${orderId}
      `);
    }
  });
}
