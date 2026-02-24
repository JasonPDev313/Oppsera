import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';

interface TenderRecordedData {
  orderId: string;
  locationId: string;
  occurredAt?: string;
  tenderType: 'cash' | 'card';
  amount: number;
  tipAmount?: number;
  changeGiven?: number;
}

const CONSUMER_NAME = 'reporting.tenderRecorded';

/**
 * Handles tender.recorded.v1 events.
 *
 * Atomically:
 * 1. Insert processed_events (idempotency)
 * 2. Upsert rm_daily_sales — increment tenderCash or tenderCard
 */
export async function handleTenderRecorded(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as TenderRecordedData;

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

    // Step 3: Upsert rm_daily_sales — tender type determines which column
    // Event payloads send amounts in cents (INTEGER from tenders table).
    // Read models store dollars (NUMERIC(19,4)). Convert at boundary.
    const amount = (data.amount ?? 0) / 100;
    if (data.tenderType === 'cash') {
      await (tx as any).execute(sql`
        INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, tender_cash, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amount}, NOW())
        ON CONFLICT (tenant_id, location_id, business_date)
        DO UPDATE SET
          tender_cash = rm_daily_sales.tender_cash + ${amount},
          updated_at = NOW()
      `);
    } else if (data.tenderType === 'card') {
      await (tx as any).execute(sql`
        INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, tender_card, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate}, ${amount}, NOW())
        ON CONFLICT (tenant_id, location_id, business_date)
        DO UPDATE SET
          tender_card = rm_daily_sales.tender_card + ${amount},
          updated_at = NOW()
      `);
    }
  });
}
