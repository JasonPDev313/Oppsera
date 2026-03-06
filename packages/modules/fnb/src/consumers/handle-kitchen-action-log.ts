import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export type KitchenActionType =
  | 'bump_item'
  | 'bump_ticket'
  | 'recall'
  | 'callback'
  | 'fire'
  | 'void'
  | 'refire';

export interface KitchenActionLogData {
  locationId: string;
  stationId: string | null;
  ticketId: string;
  ticketItemId: string | null;
  actionType: KitchenActionType;
  actorId: string;
  actorName: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  businessDate: string;
}

/**
 * Consumer: append-only log of every KDS action.
 * Used for accountability, debugging, and analytics.
 */
export async function logKitchenAction(
  tenantId: string,
  data: KitchenActionLogData,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO fnb_kitchen_actions (
        id, tenant_id, location_id, station_id,
        ticket_id, ticket_item_id,
        action_type, actor_id, actor_name,
        reason, metadata, business_date, created_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${data.locationId}, ${data.stationId},
        ${data.ticketId}, ${data.ticketItemId},
        ${data.actionType}, ${data.actorId}, ${data.actorName},
        ${data.reason}, ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb,
        ${data.businessDate}, NOW()
      )
    `);
  });
}
