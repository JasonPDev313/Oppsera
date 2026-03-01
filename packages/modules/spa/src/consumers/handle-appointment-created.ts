import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const serviceItemSchema = z.object({
  serviceId: z.string(),
  serviceName: z.string().optional(),
  addonId: z.string().optional(),
});

const appointmentCreatedSchema = z.object({
  appointmentId: z.string(),
  locationId: z.string(),
  providerId: z.string(),
  customerId: z.string().optional(),
  businessDate: z.string(),
  bookingSource: z.string().optional(),
  serviceItems: z.array(serviceItemSchema).default([]),
});

const CONSUMER_NAME = 'spa.appointmentCreated';

/**
 * Handles spa.appointment.created.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_spa_daily_operations — increment appointment_count, online_booking_count, walk_in_count
 * 4. Upsert rm_spa_service_metrics — increment booking_count per service item
 * 5. Upsert rm_spa_client_metrics — increment service_count (if customerId present)
 */
export async function handleSpaAppointmentCreated(event: EventEnvelope): Promise<void> {
  const parsed = appointmentCreatedSchema.safeParse(event.data);
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
    const isOnline = data.bookingSource === 'online';
    const isWalkIn = data.bookingSource === 'walk_in';

    // Step 2: Upsert rm_spa_daily_operations
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_daily_operations (
        id, tenant_id, location_id, business_date,
        appointment_count, online_booking_count, walk_in_count,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${1}, ${isOnline ? 1 : 0}, ${isWalkIn ? 1 : 0},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        appointment_count = rm_spa_daily_operations.appointment_count + 1,
        online_booking_count = rm_spa_daily_operations.online_booking_count + ${isOnline ? 1 : 0},
        walk_in_count = rm_spa_daily_operations.walk_in_count + ${isWalkIn ? 1 : 0},
        updated_at = NOW()
    `);

    // Step 3: Upsert rm_spa_service_metrics per service item
    for (const item of data.serviceItems) {
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_service_metrics (
          id, tenant_id, service_id, business_date,
          booking_count,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${item.serviceId}, ${businessDate},
          ${1},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, service_id, business_date)
        DO UPDATE SET
          booking_count = rm_spa_service_metrics.booking_count + 1,
          updated_at = NOW()
      `);
    }

    // Step 4: Upsert rm_spa_client_metrics (if customerId present)
    if (data.customerId) {
      const serviceCount = data.serviceItems.length;
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_client_metrics (
          id, tenant_id, customer_id, business_date,
          service_count,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${data.customerId}, ${businessDate},
          ${serviceCount},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, customer_id, business_date)
        DO UPDATE SET
          service_count = rm_spa_client_metrics.service_count + ${serviceCount},
          updated_at = NOW()
      `);
    }
  });
}
