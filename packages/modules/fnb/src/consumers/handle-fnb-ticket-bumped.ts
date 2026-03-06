import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { FnbTicketBumpedConsumerData, FnbItemBumpedConsumerData, FnbItemVoidedConsumerData, FnbItemRecalledConsumerData } from '../helpers/fnb-reporting-utils';

/**
 * Consumer: handles ticket bumped events.
 * Upserts into rm_fnb_kitchen_performance.
 */
export async function handleFnbTicketBumped(
  tenantId: string,
  data: FnbTicketBumpedConsumerData,
): Promise<void> {
  const pastThreshold = data.ticketTimeSeconds > data.thresholdSeconds ? 1 : 0;

  await withTenant(tenantId, async (tx) => {
    const fireToReady = data.fireToReadySeconds ?? null;
    const readyToServed = data.readyToServedSeconds ?? null;

    await tx.execute(sql`
      INSERT INTO rm_fnb_kitchen_performance (
        id, tenant_id, location_id, station_id, business_date,
        tickets_processed, avg_ticket_time_seconds, items_bumped, items_voided,
        tickets_past_threshold, peak_hour,
        avg_fire_to_ready_seconds, avg_ready_to_served_seconds, recall_count,
        updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.stationId}, ${data.businessDate},
        1, ${data.ticketTimeSeconds}, ${data.itemCount}, 0,
        ${pastThreshold}, ${data.hour},
        ${fireToReady}, ${readyToServed}, 0,
        NOW()
      )
      ON CONFLICT (tenant_id, location_id, station_id, business_date)
      DO UPDATE SET
        tickets_processed = rm_fnb_kitchen_performance.tickets_processed + 1,
        avg_ticket_time_seconds = ROUND(
          (COALESCE(rm_fnb_kitchen_performance.avg_ticket_time_seconds, 0) * rm_fnb_kitchen_performance.tickets_processed + ${data.ticketTimeSeconds})
          / (rm_fnb_kitchen_performance.tickets_processed + 1)
        ),
        items_bumped = rm_fnb_kitchen_performance.items_bumped + ${data.itemCount},
        tickets_past_threshold = rm_fnb_kitchen_performance.tickets_past_threshold + ${pastThreshold},
        -- peak_hour is set on INSERT; true peak is computed from ticket data at read time
        avg_fire_to_ready_seconds = CASE
          WHEN ${fireToReady} IS NOT NULL THEN ROUND(
            (COALESCE(rm_fnb_kitchen_performance.avg_fire_to_ready_seconds, 0) * rm_fnb_kitchen_performance.tickets_processed + ${fireToReady})
            / (rm_fnb_kitchen_performance.tickets_processed + 1)
          )
          ELSE rm_fnb_kitchen_performance.avg_fire_to_ready_seconds
        END,
        avg_ready_to_served_seconds = CASE
          WHEN ${readyToServed} IS NOT NULL THEN ROUND(
            (COALESCE(rm_fnb_kitchen_performance.avg_ready_to_served_seconds, 0) * rm_fnb_kitchen_performance.tickets_processed + ${readyToServed})
            / (rm_fnb_kitchen_performance.tickets_processed + 1)
          )
          ELSE rm_fnb_kitchen_performance.avg_ready_to_served_seconds
        END,
        updated_at = NOW()
    `);
  });
}

/**
 * Consumer: handles individual item bumped events.
 * Increments items_bumped counter.
 */
export async function handleFnbItemBumped(
  tenantId: string,
  data: FnbItemBumpedConsumerData,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO rm_fnb_kitchen_performance (
        id, tenant_id, location_id, station_id, business_date,
        tickets_processed, items_bumped, items_voided,
        tickets_past_threshold, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.stationId}, ${data.businessDate},
        0, 1, 0, 0, NOW()
      )
      ON CONFLICT (tenant_id, location_id, station_id, business_date)
      DO UPDATE SET
        items_bumped = rm_fnb_kitchen_performance.items_bumped + 1,
        updated_at = NOW()
    `);
  });
}

/**
 * Consumer: handles item recalled events.
 * Increments recall_count counter.
 */
export async function handleFnbItemRecalled(
  tenantId: string,
  data: FnbItemRecalledConsumerData,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO rm_fnb_kitchen_performance (
        id, tenant_id, location_id, station_id, business_date,
        tickets_processed, items_bumped, items_voided,
        tickets_past_threshold, recall_count, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.stationId}, ${data.businessDate},
        0, 0, 0, 0, 1, NOW()
      )
      ON CONFLICT (tenant_id, location_id, station_id, business_date)
      DO UPDATE SET
        recall_count = rm_fnb_kitchen_performance.recall_count + 1,
        updated_at = NOW()
    `);
  });
}

/**
 * Consumer: handles item voided events.
 * Increments items_voided counter.
 */
export async function handleFnbItemVoided(
  tenantId: string,
  data: FnbItemVoidedConsumerData,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO rm_fnb_kitchen_performance (
        id, tenant_id, location_id, station_id, business_date,
        tickets_processed, items_bumped, items_voided,
        tickets_past_threshold, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.stationId}, ${data.businessDate},
        0, 0, 1, 0, NOW()
      )
      ON CONFLICT (tenant_id, location_id, station_id, business_date)
      DO UPDATE SET
        items_voided = rm_fnb_kitchen_performance.items_voided + 1,
        updated_at = NOW()
    `);
  });
}
