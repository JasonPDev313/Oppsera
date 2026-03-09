import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';

/**
 * Records a delivery ACK from a KDS client — the client received the payload.
 */
export async function ackKdsSendDelivery(
  tenantId: string,
  locationId: string,
  sendToken: string,
): Promise<{ success: boolean }> {
  return withTenant(tenantId, async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND send_token = ${sendToken}
        AND status = 'sent'
      RETURNING id, ticket_id, station_id
    `);

    const rows = Array.from(updated as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      logger.debug('[kds] delivery ack ignored (not in sent status)', { sendToken });
      return { success: false };
    }

    const r = rows[0]!;
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        previous_status, new_status, created_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${locationId},
        ${r.id as string}, ${sendToken},
        ${r.ticket_id as string}, ${r.station_id as string},
        'delivery_ack', NOW(), 'kds_client', 'sent', 'delivered', NOW()
      )
    `);

    return { success: true };
  });
}

/**
 * Records a display ACK from a KDS client — the ticket was rendered on screen.
 */
export async function ackKdsSendDisplay(
  tenantId: string,
  locationId: string,
  sendToken: string,
): Promise<{ success: boolean }> {
  return withTenant(tenantId, async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET status = 'displayed', displayed_at = NOW(), updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND send_token = ${sendToken}
        AND status = 'delivered'
      RETURNING id, ticket_id, station_id
    `);

    const rows = Array.from(updated as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      logger.debug('[kds] display ack ignored (not in delivered status)', { sendToken });
      return { success: false };
    }

    const r = rows[0]!;
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        previous_status, new_status, created_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${locationId},
        ${r.id as string}, ${sendToken},
        ${r.ticket_id as string}, ${r.station_id as string},
        'display_ack', NOW(), 'kds_client', 'delivered', 'displayed', NOW()
      )
    `);

    return { success: true };
  });
}

/**
 * Records first kitchen interaction ACK (optional — when kitchen starts working on order).
 */
export async function ackKdsSendInteraction(
  tenantId: string,
  locationId: string,
  sendToken: string,
  actorId?: string,
  actorName?: string,
): Promise<{ success: boolean }> {
  return withTenant(tenantId, async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE fnb_kds_send_tracking
      SET first_interaction_at = COALESCE(first_interaction_at, NOW()),
          kds_operational_status = 'in_progress',
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND send_token = ${sendToken}
        AND first_interaction_at IS NULL
      RETURNING id, ticket_id, station_id
    `);

    const rows = Array.from(updated as Iterable<Record<string, unknown>>);
    if (rows.length === 0) return { success: false };

    const r = rows[0]!;
    await tx.execute(sql`
      INSERT INTO fnb_kds_send_events (
        id, tenant_id, location_id, send_tracking_id, send_token,
        ticket_id, station_id, event_type, event_at, actor_type,
        actor_id, actor_name, new_status, created_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${locationId},
        ${r.id as string}, ${sendToken},
        ${r.ticket_id as string}, ${r.station_id as string},
        'interaction', NOW(), 'employee',
        ${actorId ?? null}, ${actorName ?? null}, 'in_progress', NOW()
      )
    `);

    return { success: true };
  });
}
