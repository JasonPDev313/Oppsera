import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const tenderRecordedSchema = z.object({
  orderId: z.string(),
  locationId: z.string(),
  occurredAt: z.string().optional(),
  tenderType: z.string(),
  amount: z.number(),
  tipAmount: z.number().optional(),
  changeGiven: z.number().optional(),
  surchargeAmountCents: z.number().optional(),
});

type _TenderRecordedData = z.infer<typeof tenderRecordedSchema>;

const CONSUMER_NAME = 'reporting.tenderRecorded';

const KNOWN_TENDER_TYPES = new Set(['cash', 'card', 'gift_card', 'house_account', 'ach']);

/**
 * Handles tender.recorded.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_daily_sales — increment the correct tender column + tips + surcharges
 *
 * Tender type mapping:
 * - cash → tender_cash
 * - card → tender_card
 * - gift_card → tender_gift_card
 * - house_account → tender_house_account
 * - ach → tender_ach
 * - anything else → tender_other
 */
export async function handleTenderRecorded(event: EventEnvelope): Promise<void> {
  const parsed = tenderRecordedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return; // Skip — corrupt payload would produce NaN in read models
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

    // Step 3: Compute per-column amounts (cents → dollars at boundary)
    // Only one tender column gets the amount; rest are 0.
    const amountDollars = (data.amount ?? 0) / 100;
    const tipDollars = (data.tipAmount ?? 0) / 100;
    const surchargeDollars = (data.surchargeAmountCents ?? 0) / 100;

    const tenderCash = data.tenderType === 'cash' ? amountDollars : 0;
    const tenderCard = data.tenderType === 'card' ? amountDollars : 0;
    const tenderGiftCard = data.tenderType === 'gift_card' ? amountDollars : 0;
    const tenderHouseAccount = data.tenderType === 'house_account' ? amountDollars : 0;
    const tenderAch = data.tenderType === 'ach' ? amountDollars : 0;
    const tenderOther = !KNOWN_TENDER_TYPES.has(data.tenderType) ? amountDollars : 0;

    // Step 4: Single upsert with all tender columns + tips + surcharges
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        tender_cash, tender_card, tender_gift_card, tender_house_account,
        tender_ach, tender_other, tip_total, surcharge_total,
        updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${tenderCash}, ${tenderCard}, ${tenderGiftCard}, ${tenderHouseAccount},
        ${tenderAch}, ${tenderOther}, ${tipDollars}, ${surchargeDollars},
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
        surcharge_total = rm_daily_sales.surcharge_total + ${surchargeDollars},
        updated_at = NOW()
    `);

    // Step 5: Update rm_revenue_activity with payment_method + tip
    // Smart 'split' detection: if a different payment method already recorded, mark as 'split'
    const tenderType = data.tenderType || 'unknown';
    await (tx as any).execute(sql`
      UPDATE rm_revenue_activity
      SET payment_method = CASE
            WHEN payment_method IS NOT NULL AND payment_method != ${tenderType}
            THEN 'split'
            ELSE ${tenderType}
          END,
          tip_dollars = COALESCE(tip_dollars, 0) + ${tipDollars},
          updated_at = NOW()
      WHERE tenant_id = ${event.tenantId}
        AND source = 'pos_order'
        AND source_id = ${data.orderId}
    `);
  });
}
