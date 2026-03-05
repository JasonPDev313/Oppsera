import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const spaCompletedSchema = z.object({
  appointmentId: z.string(),
  appointmentNumber: z.string().optional(),
  customerId: z.string().optional(),
  providerId: z.string().optional(),
  locationId: z.string(),
  businessDate: z.string(),
  totalCents: z.number(),
  serviceCents: z.number().default(0),
  addonCents: z.number().default(0),
  tipCents: z.number().default(0),
});

const CONSUMER_NAME = 'reporting.spaCompleted';

/**
 * Handles spa.appointment.completed.v1 events for revenue tracking.
 *
 * Writes to rm_revenue_activity with source='spa' so spa revenue
 * is visible in sales history even if checkout-to-POS is never called.
 *
 * If the appointment later goes through checkout-to-POS, the
 * spa-checked-out-revenue consumer will remove this row to prevent
 * double-counting (the POS order gets its own rm_revenue_activity row).
 */
export async function handleSpaCompletedRevenue(event: EventEnvelope): Promise<void> {
  const parsed = spaCompletedSchema.safeParse(event.data);
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
    const inserted = await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<Iterable<{ id: string }>> }).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted);
    if (rows.length === 0) return;

    const locationId = data.locationId || event.locationId || '';
    const businessDate = data.businessDate;
    const totalDollars = data.totalCents / 100;
    const serviceDollars = data.serviceCents / 100;
    const tipDollars = data.tipCents / 100;
    const apptLabel = data.appointmentNumber
      ? `Spa #${data.appointmentNumber}`
      : `Spa ${data.appointmentId.slice(-6)}`;

    // Step 2: Check if a POS order row already exists for this appointment (via checkout-to-POS bridge).
    // If so, skip insertion to prevent double-counting from race conditions where
    // spa.appointment.checked_out.v1 is processed before spa.appointment.completed.v1.
    const existingPosRow = await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<Iterable<{ id: string }>> }).execute(sql`
      SELECT id FROM rm_revenue_activity
      WHERE tenant_id = ${event.tenantId}
        AND source = 'pos_order'
        AND metadata::jsonb @> ${JSON.stringify({ spaAppointmentId: data.appointmentId })}::jsonb
      LIMIT 1
    `);
    const posRows = Array.from(existingPosRow);

    if (posRows.length > 0) {
      // POS order already owns this revenue — skip to prevent double-counting
      return;
    }

    // Step 3: Upsert rm_revenue_activity with source='spa'
    await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        amount_dollars, subtotal_dollars, tax_dollars,
        tip_dollars, customer_id,
        status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${businessDate},
        ${'spa'}, ${'spa_service'}, ${data.appointmentId}, ${apptLabel},
        ${totalDollars}, ${serviceDollars}, ${0},
        ${tipDollars}, ${data.customerId ?? null},
        ${'completed'}, ${JSON.stringify({ providerId: data.providerId })},
        ${event.occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${totalDollars},
        subtotal_dollars = ${serviceDollars},
        tip_dollars = ${tipDollars},
        customer_id = COALESCE(${data.customerId ?? null}, rm_revenue_activity.customer_id),
        status = ${'completed'},
        occurred_at = ${event.occurredAt}::timestamptz
    `);
  });
}

/**
 * Handles spa.appointment.checked_out.v1 events for revenue reconciliation.
 *
 * When a spa appointment is checked out through the POS bridge (orderId present),
 * removes the spa-source rm_revenue_activity row to prevent double-counting —
 * the order.placed.v1 consumer will create the pos_order row instead.
 */
export async function handleSpaCheckedOutRevenue(event: EventEnvelope): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const appointmentId = data.appointmentId as string | undefined;
  const orderId = data.orderId as string | undefined;

  if (!appointmentId || !orderId) return; // Only reconcile when POS order was created

  await withTenant(event.tenantId, async (tx) => {
    // Idempotency
    const inserted = await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<Iterable<{ id: string }>> }).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${'reporting.spaCheckedOutRevenue'}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted);
    if (rows.length === 0) return;

    // Remove the spa-source row — POS order will have its own row via order.placed.v1
    await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(sql`
      DELETE FROM rm_revenue_activity
      WHERE tenant_id = ${event.tenantId}
        AND source = 'spa'
        AND source_id = ${appointmentId}
    `);
  });
}
