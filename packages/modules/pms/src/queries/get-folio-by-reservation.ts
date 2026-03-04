import { and, eq } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { pmsFolios } from '@oppsera/db';
import { getFolio } from './get-folio';

/**
 * Look up a folio by reservation ID, then delegate to getFolio for the full result.
 *
 * Uses `db` (not withTenant) for the lookup to avoid double-nesting
 * withTenant — getFolio internally calls withTenant, and nesting two
 * withTenant calls would exhaust the max:2 connection pool on Vercel.
 */
export async function getFolioByReservation(tenantId: string, reservationId: string) {
  const [folio] = await db
    .select({ id: pmsFolios.id })
    .from(pmsFolios)
    .where(
      and(eq(pmsFolios.reservationId, reservationId), eq(pmsFolios.tenantId, tenantId)),
    )
    .limit(1);

  if (!folio) return null;
  return getFolio(tenantId, folio.id);
}
