import { sql } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';

export interface KdsAutoClearResult {
  voidedItemCount: number;
  voidedTicketCount: number;
  locationsProcessed: number;
}

/**
 * Auto-clear (void) stale KDS ticket items from previous business dates
 * for locations that have stale_ticket_mode = 'auto_clear'.
 *
 * Called by the cron endpoint. Runs across all tenants (no user context).
 * Uses admin client (no RLS).
 */
export async function kdsAutoClearStale(): Promise<KdsAutoClearResult> {
  const adminDb = createAdminClient();

  // Find locations with auto_clear mode
  const locations = await adminDb.execute(sql`
    SELECT tenant_id, location_id, auto_clear_time
    FROM fnb_kds_location_settings
    WHERE stale_ticket_mode = 'auto_clear'
  `);
  const locationRows = Array.from(locations as Iterable<Record<string, unknown>>);

  if (locationRows.length === 0) {
    return { voidedItemCount: 0, voidedTicketCount: 0, locationsProcessed: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  let totalVoidedItems = 0;
  let totalVoidedTickets = 0;
  let locationsProcessed = 0;

  for (const loc of locationRows) {
    const tenantId = loc.tenant_id as string;
    const locationId = loc.location_id as string;

    // Void stale ticket items
    const voidedItems = await adminDb.execute(sql`
      UPDATE fnb_kitchen_ticket_items kti
      SET item_status = 'voided', voided_at = NOW(), updated_at = NOW()
      FROM fnb_kitchen_tickets kt
      WHERE kti.ticket_id = kt.id
        AND kti.tenant_id = ${tenantId}
        AND kt.location_id = ${locationId}
        AND kti.item_status IN ('pending', 'cooking')
        AND kt.business_date < ${today}
      RETURNING kti.id
    `);
    const voidedItemRows = Array.from(voidedItems as Iterable<Record<string, unknown>>);

    // Void parent tickets where all items are now terminal
    const voidedTickets = await adminDb.execute(sql`
      UPDATE fnb_kitchen_tickets kt
      SET status = 'voided', voided_at = NOW(), updated_at = NOW()
      WHERE kt.tenant_id = ${tenantId}
        AND kt.location_id = ${locationId}
        AND kt.business_date < ${today}
        AND kt.status IN ('pending', 'in_progress')
        AND NOT EXISTS (
          SELECT 1 FROM fnb_kitchen_ticket_items kti2
          WHERE kti2.ticket_id = kt.id
            AND kti2.item_status NOT IN ('voided', 'served', 'ready')
        )
      RETURNING kt.id
    `);
    const voidedTicketRows = Array.from(voidedTickets as Iterable<Record<string, unknown>>);

    if (voidedItemRows.length > 0 || voidedTicketRows.length > 0) {
      logger.info('[KDS-CRON] Auto-cleared stale tickets', {
        domain: 'kds',
        tenantId,
        locationId,
        voidedItems: voidedItemRows.length,
        voidedTickets: voidedTicketRows.length,
      });
    }

    totalVoidedItems += voidedItemRows.length;
    totalVoidedTickets += voidedTicketRows.length;
    locationsProcessed++;
  }

  return {
    voidedItemCount: totalVoidedItems,
    voidedTicketCount: totalVoidedTickets,
    locationsProcessed,
  };
}
