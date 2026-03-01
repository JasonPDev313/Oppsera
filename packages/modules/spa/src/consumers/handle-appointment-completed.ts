import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const serviceItemSchema = z.object({
  serviceId: z.string(),
  addonId: z.string().optional(),
  finalPriceCents: z.number(),
  durationMinutes: z.number(),
});

const appointmentCompletedSchema = z.object({
  appointmentId: z.string(),
  locationId: z.string(),
  providerId: z.string(),
  customerId: z.string().optional(),
  businessDate: z.string(),
  durationMinutes: z.number(),
  serviceItems: z.array(serviceItemSchema).default([]),
  totalCents: z.number(),
  serviceCents: z.number(),
  addonCents: z.number().default(0),
  tipCents: z.number().default(0),
  commissionCents: z.number().default(0),
});

const CONSUMER_NAME = 'spa.appointmentCompleted';

/**
 * Handles spa.appointment.completed.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_spa_daily_operations — increment completed_count, add revenue, update avg duration
 * 4. Upsert rm_spa_provider_metrics — increment completed_count, add revenue/tips/commission, update avg duration
 * 5. Upsert rm_spa_service_metrics — increment completed_count, add revenue, update avg duration per service item
 * 6. Upsert rm_spa_client_metrics — increment visit_count, add spend/tips, update last_visit_date (if customerId present)
 */
export async function handleSpaAppointmentCompleted(event: EventEnvelope): Promise<void> {
  const parsed = appointmentCompletedSchema.safeParse(event.data);
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

    // Convert cents to dollars for NUMERIC(19,4) read model columns
    const serviceRevenue = data.serviceCents / 100;
    const addonRevenue = data.addonCents / 100;
    const totalRevenue = data.totalCents / 100;
    const tipTotal = data.tipCents / 100;
    const commissionTotal = data.commissionCents / 100;
    const durationMinutes = data.durationMinutes;

    // Step 2: Upsert rm_spa_daily_operations
    // Incremental average: new_avg = ((old_avg * old_count) + new_value) / (old_count + 1)
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_daily_operations (
        id, tenant_id, location_id, business_date,
        completed_count, service_revenue, addon_revenue, total_revenue, tip_total,
        avg_appointment_duration,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${1}, ${serviceRevenue}, ${addonRevenue}, ${totalRevenue}, ${tipTotal},
        ${durationMinutes},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, location_id, business_date)
      DO UPDATE SET
        completed_count = rm_spa_daily_operations.completed_count + 1,
        service_revenue = rm_spa_daily_operations.service_revenue + ${serviceRevenue},
        addon_revenue = rm_spa_daily_operations.addon_revenue + ${addonRevenue},
        total_revenue = rm_spa_daily_operations.total_revenue + ${totalRevenue},
        tip_total = rm_spa_daily_operations.tip_total + ${tipTotal},
        avg_appointment_duration = CASE
          WHEN (rm_spa_daily_operations.completed_count + 1) > 0
          THEN ((rm_spa_daily_operations.avg_appointment_duration * rm_spa_daily_operations.completed_count) + ${durationMinutes}) / (rm_spa_daily_operations.completed_count + 1)
          ELSE ${durationMinutes}
        END,
        updated_at = NOW()
    `);

    // Step 3: Upsert rm_spa_provider_metrics
    await (tx as any).execute(sql`
      INSERT INTO rm_spa_provider_metrics (
        id, tenant_id, provider_id, business_date,
        completed_count, total_revenue, tip_total, commission_total,
        avg_service_duration, client_count,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${data.providerId}, ${businessDate},
        ${1}, ${totalRevenue}, ${tipTotal}, ${commissionTotal},
        ${durationMinutes}, ${1},
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, provider_id, business_date)
      DO UPDATE SET
        completed_count = rm_spa_provider_metrics.completed_count + 1,
        total_revenue = rm_spa_provider_metrics.total_revenue + ${totalRevenue},
        tip_total = rm_spa_provider_metrics.tip_total + ${tipTotal},
        commission_total = rm_spa_provider_metrics.commission_total + ${commissionTotal},
        avg_service_duration = CASE
          WHEN (rm_spa_provider_metrics.completed_count + 1) > 0
          THEN ((rm_spa_provider_metrics.avg_service_duration * rm_spa_provider_metrics.completed_count) + ${durationMinutes}) / (rm_spa_provider_metrics.completed_count + 1)
          ELSE ${durationMinutes}
        END,
        client_count = rm_spa_provider_metrics.client_count + 1,
        updated_at = NOW()
    `);

    // Step 4: Upsert rm_spa_service_metrics per service item
    for (const item of data.serviceItems) {
      const itemRevenue = item.finalPriceCents / 100;
      const itemDuration = item.durationMinutes;
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_service_metrics (
          id, tenant_id, service_id, business_date,
          completed_count, total_revenue, avg_duration_minutes,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${item.serviceId}, ${businessDate},
          ${1}, ${itemRevenue}, ${itemDuration},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, service_id, business_date)
        DO UPDATE SET
          completed_count = rm_spa_service_metrics.completed_count + 1,
          total_revenue = rm_spa_service_metrics.total_revenue + ${itemRevenue},
          avg_duration_minutes = CASE
            WHEN (rm_spa_service_metrics.completed_count + 1) > 0
            THEN ((rm_spa_service_metrics.avg_duration_minutes * rm_spa_service_metrics.completed_count) + ${itemDuration}) / (rm_spa_service_metrics.completed_count + 1)
            ELSE ${itemDuration}
          END,
          updated_at = NOW()
      `);
    }

    // Step 5: Upsert rm_spa_client_metrics (if customerId present)
    if (data.customerId) {
      await (tx as any).execute(sql`
        INSERT INTO rm_spa_client_metrics (
          id, tenant_id, customer_id, business_date,
          visit_count, total_spend, tip_total, last_visit_date,
          created_at, updated_at
        )
        VALUES (
          ${generateUlid()}, ${event.tenantId}, ${data.customerId}, ${businessDate},
          ${1}, ${totalRevenue}, ${tipTotal}, ${businessDate},
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, customer_id, business_date)
        DO UPDATE SET
          visit_count = rm_spa_client_metrics.visit_count + 1,
          total_spend = rm_spa_client_metrics.total_spend + ${totalRevenue},
          tip_total = rm_spa_client_metrics.tip_total + ${tipTotal},
          last_visit_date = CASE
            WHEN ${businessDate}::date > COALESCE(rm_spa_client_metrics.last_visit_date, '1970-01-01'::date)
            THEN ${businessDate}::date
            ELSE rm_spa_client_metrics.last_visit_date
          END,
          updated_at = NOW()
      `);
    }
  });
}
