import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const appointmentCheckedOutSchema = z.object({
  appointmentId: z.string(),
  locationId: z.string(),
  providerId: z.string(),
  customerId: z.string().optional(),
  businessDate: z.string(),
  retailCents: z.number().default(0),
  isNewClient: z.boolean().default(false),
  didRebook: z.boolean().default(false),
});

const CONSUMER_NAME = 'spa.appointmentCheckedOut';

/**
 * Handles spa.appointment.checked_out.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_spa_daily_operations — add retail_revenue, update utilization_pct, rebooking_rate
 * 4. Upsert rm_spa_provider_metrics — update utilization_pct, rebooking_rate, add new_client_count if first visit
 */
export async function handleSpaAppointmentCheckedOut(event: EventEnvelope): Promise<void> {
  const parsed = appointmentCheckedOutSchema.safeParse(event.data);
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

    const locationId = data.locationId || event.locationId || '';
    const businessDate = data.businessDate;
    const retailRevenue = data.retailCents / 100;

    // Step 2: Upsert rm_spa_daily_operations
    // Rebooking rate: incremental running average
    // Track checked-out appointments to compute utilization and rebooking rate
    // rebooking_rate = running proportion of checked-out guests who rebooked
    // We use incremental average: new_rate = ((old_rate * completed_count) + (didRebook ? 1 : 0)) / (completed_count + 1)
    // NOTE: We use completed_count as the denominator since checkout happens after completion
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_daily_operations (
        id, tenant_id, location_id, business_date,
        retail_revenue, rebooking_rate,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${retailRevenue}, ${data.didRebook ? 100 : 0},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        retail_revenue = rm_spa_daily_operations.retail_revenue + ${retailRevenue},
        rebooking_rate = CASE
          WHEN rm_spa_daily_operations.completed_count > 0
          THEN ((rm_spa_daily_operations.rebooking_rate * rm_spa_daily_operations.completed_count) + ${data.didRebook ? 100 : 0}) / (rm_spa_daily_operations.completed_count + 1)
          ELSE ${data.didRebook ? 100 : 0}
        END,
        updated_at = NOW()
    `);

    // Step 3: Upsert rm_spa_provider_metrics
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_provider_metrics (
        id, tenant_id, provider_id, business_date,
        rebooking_rate, new_client_count,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.providerId}, ${businessDate},
        ${data.didRebook ? 100 : 0}, ${data.isNewClient ? 1 : 0},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, provider_id, business_date)
      DO UPDATE SET
        rebooking_rate = CASE
          WHEN rm_spa_provider_metrics.completed_count > 0
          THEN ((rm_spa_provider_metrics.rebooking_rate * rm_spa_provider_metrics.completed_count) + ${data.didRebook ? 100 : 0}) / (rm_spa_provider_metrics.completed_count + 1)
          ELSE ${data.didRebook ? 100 : 0}
        END,
        new_client_count = rm_spa_provider_metrics.new_client_count + ${data.isNewClient ? 1 : 0},
        updated_at = NOW()
    `);
  });
}
