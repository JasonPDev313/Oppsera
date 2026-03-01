import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const serviceItemSchema = z.object({
  serviceId: z.string(),
});

const appointmentCanceledSchema = z.object({
  appointmentId: z.string(),
  locationId: z.string(),
  providerId: z.string(),
  customerId: z.string().optional(),
  businessDate: z.string(),
  cancelReason: z.string().optional(),
  serviceItems: z.array(serviceItemSchema).default([]),
});

const CONSUMER_NAME = 'spa.appointmentCanceled';

/**
 * Handles spa.appointment.canceled.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_spa_daily_operations — increment canceled_count
 * 4. Upsert rm_spa_service_metrics — increment canceled_count per service item
 * 5. Upsert rm_spa_client_metrics — increment cancel_count (if customerId present)
 */
export async function handleSpaAppointmentCanceled(event: EventEnvelope): Promise<void> {
  const parsed = appointmentCanceledSchema.safeParse(event.data);
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

    // Step 2: Upsert rm_spa_daily_operations
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_daily_operations (
        id, tenant_id, location_id, business_date,
        canceled_count,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${1},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        canceled_count = rm_spa_daily_operations.canceled_count + 1,
        updated_at = NOW()
    `);

    // Step 3: Upsert rm_spa_service_metrics per service item
    for (const item of data.serviceItems) {
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_service_metrics (
          id, tenant_id, service_id, business_date,
          canceled_count,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${item.serviceId}, ${businessDate},
          ${1},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, service_id, business_date)
        DO UPDATE SET
          canceled_count = rm_spa_service_metrics.canceled_count + 1,
          updated_at = NOW()
      `);
    }

    // Step 4: Upsert rm_spa_client_metrics (if customerId present)
    if (data.customerId) {
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_client_metrics (
          id, tenant_id, customer_id, business_date,
          cancel_count,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${data.customerId}, ${businessDate},
          ${1},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, customer_id, business_date)
        DO UPDATE SET
          cancel_count = rm_spa_client_metrics.cancel_count + 1,
          updated_at = NOW()
      `);
    }
  });
}
