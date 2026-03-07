import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';
import { computeBusinessDate } from '../business-date';

const tenderReversedSchema = z.object({
  reversalId: z.string(),
  originalTenderId: z.string(),
  orderId: z.string(),
  amount: z.number(), // cents
  reason: z.string().nullable().optional(),
  reversalType: z.string(),
  refundMethod: z.string(),
  tipAmount: z.number().nullish(),
  surchargeAmountCents: z.number().nullish(),
  locationId: z.string().nullish(),
});

const CONSUMER_NAME = 'reporting.tenderReversed';

const KNOWN_TENDER_TYPES = new Set(['cash', 'card', 'credit_card', 'debit_card', 'gift_card', 'house_account', 'ach']);

/**
 * Handles tender.reversed.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Upsert rm_daily_sales — DECREMENT the correct tender column + tips
 *
 * Mirrors tender-recorded.ts but subtracts instead of adding.
 */
export async function handleTenderReversed(event: EventEnvelope): Promise<void> {
  const parsed = tenderReversedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  // Zero-amount reversals have no effect on reporting
  if (data.amount === 0) return;

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

    // Step 2: Look up original business date from the order's revenue activity row
    // The reversal must decrement the ORIGINAL posting date, not today
    const locationId = data.locationId || event.locationId || '';
    const origActivity = await (tx as any).execute(sql`
      SELECT business_date FROM rm_revenue_activity
      WHERE tenant_id = ${event.tenantId}
        AND source = 'pos_order'
        AND source_id = ${data.orderId}
      LIMIT 1
    `);
    const origRows = Array.from(origActivity as Iterable<Record<string, unknown>>);

    let businessDate: string;
    if (origRows.length > 0 && origRows[0]!.business_date) {
      businessDate = String(origRows[0]!.business_date).slice(0, 10);
    } else {
      // Fallback: compute from event time (best effort)
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
      businessDate = computeBusinessDate(event.occurredAt, timezone);
    }

    // Step 3: Compute per-column amounts (cents → dollars at boundary)
    const amountDollars = (data.amount ?? 0) / 100;
    const tipDollars = (data.tipAmount ?? 0) / 100;
    const surchargeDollars = (data.surchargeAmountCents ?? 0) / 100;

    const tenderType = data.refundMethod || 'unknown';
    const tenderCash = tenderType === 'cash' ? amountDollars : 0;
    const isCard = tenderType === 'card' || tenderType === 'credit_card' || tenderType === 'debit_card';
    const tenderCard = isCard ? amountDollars : 0;
    const tenderGiftCard = tenderType === 'gift_card' ? amountDollars : 0;
    const tenderHouseAccount = tenderType === 'house_account' ? amountDollars : 0;
    const tenderAch = tenderType === 'ach' ? amountDollars : 0;
    const tenderOther = !KNOWN_TENDER_TYPES.has(tenderType) ? amountDollars : 0;

    // Step 4: Upsert — SUBTRACT tender columns + surcharge
    await (tx as any).execute(sql`
      INSERT INTO rm_daily_sales (
        id, tenant_id, location_id, business_date,
        tender_cash, tender_card, tender_gift_card, tender_house_account,
        tender_ach, tender_other, tip_total, surcharge_total,
        updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${-tenderCash}, ${-tenderCard}, ${-tenderGiftCard}, ${-tenderHouseAccount},
        ${-tenderAch}, ${-tenderOther}, ${-tipDollars}, ${-surchargeDollars},
        NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        tender_cash = rm_daily_sales.tender_cash - ${tenderCash},
        tender_card = rm_daily_sales.tender_card - ${tenderCard},
        tender_gift_card = rm_daily_sales.tender_gift_card - ${tenderGiftCard},
        tender_house_account = rm_daily_sales.tender_house_account - ${tenderHouseAccount},
        tender_ach = rm_daily_sales.tender_ach - ${tenderAch},
        tender_other = rm_daily_sales.tender_other - ${tenderOther},
        tip_total = rm_daily_sales.tip_total - ${tipDollars},
        surcharge_total = rm_daily_sales.surcharge_total - ${surchargeDollars},
        updated_at = NOW()
    `);
  });
}
