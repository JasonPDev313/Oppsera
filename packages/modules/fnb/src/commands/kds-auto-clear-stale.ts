import { sql } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';

export interface KdsAutoClearResult {
  voidedItemCount: number;
  voidedTicketCount: number;
  agedOutItemCount: number;
  agedOutTicketCount: number;
  locationsProcessed: number;
}

/**
 * Auto-clear (void) stale KDS ticket items from previous business dates
 * for locations that have stale_ticket_mode = 'auto_clear'.
 *
 * Also voids same-day tickets that exceed `autoVoidAfterHours` (default 8h)
 * to prevent ghost tickets from cluttering KDS indefinitely.
 *
 * Called by the cron endpoint. Runs across all tenants (no user context).
 * Uses admin client (no RLS).
 */
export async function kdsAutoClearStale(
  options?: { autoVoidAfterHours?: number },
): Promise<KdsAutoClearResult> {
  const maxAgeHours = options?.autoVoidAfterHours ?? 8;
  const adminDb = createAdminClient();

  // Find locations with auto_clear mode, joining to locations for timezone
  const locations = await adminDb.execute(sql`
    SELECT kls.tenant_id, kls.location_id, kls.auto_clear_time,
           COALESCE(l.timezone, 'America/New_York') AS timezone
    FROM fnb_kds_location_settings kls
    LEFT JOIN locations l ON l.id = kls.location_id AND l.tenant_id = kls.tenant_id
    WHERE kls.stale_ticket_mode = 'auto_clear'
  `);
  const locationRows = Array.from(locations as Iterable<Record<string, unknown>>);

  if (locationRows.length === 0) {
    return { voidedItemCount: 0, voidedTicketCount: 0, agedOutItemCount: 0, agedOutTicketCount: 0, locationsProcessed: 0 };
  }
  let totalVoidedItems = 0;
  let totalVoidedTickets = 0;
  let totalAgedOutItems = 0;
  let totalAgedOutTickets = 0;
  let locationsProcessed = 0;

  for (const loc of locationRows) {
    const tenantId = loc.tenant_id as string;
    const locationId = loc.location_id as string;
    const tz = (loc.timezone as string) || 'America/New_York';

    // Compute "today" in the location's local timezone
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

    // Void stale ticket items
    const voidedItems = await adminDb.execute(sql`
      UPDATE fnb_kitchen_ticket_items kti
      SET item_status = 'voided', voided_at = NOW(), updated_at = NOW()
      FROM fnb_kitchen_tickets kt
      WHERE kti.ticket_id = kt.id
        AND kti.tenant_id = ${tenantId}
        AND kt.location_id = ${locationId}
        AND kti.item_status IN ('pending', 'cooking', 'ready')
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
        AND kt.status IN ('pending', 'in_progress', 'ready')
        AND NOT EXISTS (
          SELECT 1 FROM fnb_kitchen_ticket_items kti2
          WHERE kti2.ticket_id = kt.id
            AND kti2.item_status NOT IN ('voided', 'served')
        )
      RETURNING kt.id
    `);
    const voidedTicketRows = Array.from(voidedTickets as Iterable<Record<string, unknown>>);

    // Auto-void same-day tickets that have been active longer than maxAgeHours.
    // Skip held tickets — operators deliberately parked them.
    const agedItems = await adminDb.execute(sql`
      UPDATE fnb_kitchen_ticket_items kti
      SET item_status = 'voided', voided_at = NOW(), updated_at = NOW()
      FROM fnb_kitchen_tickets kt
      WHERE kti.ticket_id = kt.id
        AND kti.tenant_id = ${tenantId}
        AND kt.location_id = ${locationId}
        AND kti.item_status IN ('pending', 'cooking', 'ready')
        AND kt.business_date = ${today}
        AND kt.is_held = false
        AND kt.sent_at < NOW() - INTERVAL '1 hour' * ${maxAgeHours}
      RETURNING kti.id
    `);
    const agedItemRows = Array.from(agedItems as Iterable<Record<string, unknown>>);

    const agedTickets = await adminDb.execute(sql`
      UPDATE fnb_kitchen_tickets kt
      SET status = 'voided', voided_at = NOW(), updated_at = NOW()
      WHERE kt.tenant_id = ${tenantId}
        AND kt.location_id = ${locationId}
        AND kt.business_date = ${today}
        AND kt.status IN ('pending', 'in_progress', 'ready')
        AND kt.is_held = false
        AND kt.sent_at < NOW() - INTERVAL '1 hour' * ${maxAgeHours}
        AND NOT EXISTS (
          SELECT 1 FROM fnb_kitchen_ticket_items kti2
          WHERE kti2.ticket_id = kt.id
            AND kti2.item_status NOT IN ('voided', 'served')
        )
      RETURNING kt.id
    `);
    const agedTicketRows = Array.from(agedTickets as Iterable<Record<string, unknown>>);

    if (voidedItemRows.length > 0 || voidedTicketRows.length > 0 || agedItemRows.length > 0 || agedTicketRows.length > 0) {
      logger.info('[KDS-CRON] Auto-cleared stale tickets', {
        domain: 'kds',
        tenantId,
        locationId,
        voidedItems: voidedItemRows.length,
        voidedTickets: voidedTicketRows.length,
        agedOutItems: agedItemRows.length,
        agedOutTickets: agedTicketRows.length,
      });
    }

    totalVoidedItems += voidedItemRows.length;
    totalVoidedTickets += voidedTicketRows.length;
    totalAgedOutItems += agedItemRows.length;
    totalAgedOutTickets += agedTicketRows.length;
    locationsProcessed++;
  }

  return {
    voidedItemCount: totalVoidedItems,
    voidedTicketCount: totalVoidedTickets,
    agedOutItemCount: totalAgedOutItems,
    agedOutTicketCount: totalAgedOutTickets,
    locationsProcessed,
  };
}
