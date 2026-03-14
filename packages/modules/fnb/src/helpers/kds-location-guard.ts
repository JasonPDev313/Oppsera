import { sql } from 'drizzle-orm';

/**
 * Checks whether the caller's location (ctx.locationId) is allowed to
 * interact with a ticket stored at ticketLocationId.
 *
 * Returns true when:
 *   - No ctx location (server-side / admin call)
 *   - Exact match (same location)
 *   - Venue→site: the caller's location is a child venue of the ticket's site
 *     (venue→site KDS fallback stores tickets at the parent site)
 */
export async function isLocationAllowedForTicket(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  tenantId: string,
  ctxLocationId: string | null | undefined,
  ticketLocationId: string | null,
): Promise<boolean> {
  // No location context → server-side call, allow
  if (!ctxLocationId || !ticketLocationId) return true;
  // Exact match
  if (ctxLocationId === ticketLocationId) return true;
  // Check if ctx location is a venue whose parent is the ticket's location
  const rows = await tx.execute(
    sql`SELECT parent_location_id FROM locations
        WHERE id = ${ctxLocationId} AND tenant_id = ${tenantId} LIMIT 1`,
  );
  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  return (row?.parent_location_id as string | null) === ticketLocationId;
}
