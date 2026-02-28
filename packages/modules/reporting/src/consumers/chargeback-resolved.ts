import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const chargebackResolvedSchema = z.object({
  chargebackId: z.string(),
  tenderId: z.string(),
  orderId: z.string(),
  tenderType: z.string().optional(),
  resolution: z.enum(['won', 'lost']),
  chargebackAmountCents: z.number(),
  feeAmountCents: z.number().optional().default(0),
  locationId: z.string(),
  businessDate: z.string().optional(),
  customerId: z.string().nullable().optional(),
  resolutionReason: z.string().optional(),
});

const CONSUMER_NAME = 'reporting.chargebackResolved';

/**
 * Handles chargeback.resolved.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Update rm_revenue_activity status for the chargeback
 *
 * If won: status → 'reversed' (money returned, chargeback effect undone)
 * If lost: status → 'completed' (chargeback stands, funds lost)
 */
export async function handleChargebackResolved(event: EventEnvelope): Promise<void> {
  const parsed = chargebackResolvedSchema.safeParse(event.data);
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

    // Step 2: Update the existing rm_revenue_activity row for this chargeback
    const newStatus = data.resolution === 'won' ? 'reversed' : 'completed';

    await (tx as any).execute(sql`
      UPDATE rm_revenue_activity
      SET
        status = ${newStatus},
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{resolution}',
          ${JSON.stringify(data.resolution)}::jsonb
        ) || jsonb_build_object(
          'resolutionReason', ${data.resolutionReason ?? null}::text,
          'feeAmountCents', ${data.feeAmountCents}::int
        ),
        updated_at = NOW()
      WHERE tenant_id = ${event.tenantId}
        AND source = 'chargeback'
        AND source_id = ${data.chargebackId}
    `);

    // If the chargeback was WON, the negative amount is effectively undone.
    // We zero out the amount so sales history shows net zero impact.
    if (data.resolution === 'won') {
      await (tx as any).execute(sql`
        UPDATE rm_revenue_activity
        SET amount_dollars = 0
        WHERE tenant_id = ${event.tenantId}
          AND source = 'chargeback'
          AND source_id = ${data.chargebackId}
      `);
    }
  });
}
