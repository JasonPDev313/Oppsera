import { and, eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsFolios } from '@oppsera/db';
import { getFolio } from './get-folio';

export async function getFolioByReservation(tenantId: string, reservationId: string) {
  return withTenant(tenantId, async (tx) => {
    const [folio] = await tx
      .select({ id: pmsFolios.id })
      .from(pmsFolios)
      .where(
        and(eq(pmsFolios.reservationId, reservationId), eq(pmsFolios.tenantId, tenantId)),
      )
      .limit(1);

    if (!folio) return null;
    return getFolio(tenantId, folio.id);
  });
}
