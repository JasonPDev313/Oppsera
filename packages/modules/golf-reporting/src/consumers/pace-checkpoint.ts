import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import type { PaceCheckpointData } from '../events';

const CONSUMER_NAME = 'golf-reporting.paceCheckpoint';

/**
 * Handles pace.checkpoint.v1 events.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. INSERT rm_golf_pace_checkpoints ON CONFLICT UPDATE
 */
export async function handlePaceCheckpoint(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as PaceCheckpointData;

  // Must have reservationId to link checkpoint
  const reservationId = data.reservationId ?? data.roundId;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    // Step 2: Upsert checkpoint row
    await (tx as any).execute(sql`
      INSERT INTO rm_golf_pace_checkpoints (
        id, tenant_id, reservation_id, checkpoint,
        recorded_at, elapsed_minutes, expected_minutes, status, created_at
      ) VALUES (
        ${generateUlid()}, ${event.tenantId}, ${reservationId}, ${data.holeNumber},
        ${event.occurredAt}, ${data.elapsedMinutes}, ${data.expectedMinutes},
        ${data.status}, NOW()
      )
      ON CONFLICT (tenant_id, reservation_id, checkpoint)
      DO UPDATE SET
        recorded_at = ${event.occurredAt},
        elapsed_minutes = ${data.elapsedMinutes},
        expected_minutes = ${data.expectedMinutes},
        status = ${data.status}
    `);
  });
}
