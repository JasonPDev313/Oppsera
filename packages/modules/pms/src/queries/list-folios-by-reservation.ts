/**
 * List all folios for a reservation (multi-folio / split billing support).
 */
import { and, eq } from 'drizzle-orm';
import { withTenant, pmsFolios } from '@oppsera/db';

export interface FolioListItem {
  id: string;
  folioNumber: number | null;
  label: string | null;
  status: string;
  totalCents: number;
  balanceCents: number;
  createdAt: string;
}

export async function listFoliosByReservation(
  tenantId: string,
  reservationId: string,
): Promise<FolioListItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: pmsFolios.id,
        folioNumber: pmsFolios.folioNumber,
        label: pmsFolios.label,
        status: pmsFolios.status,
        totalCents: pmsFolios.totalCents,
        balanceCents: pmsFolios.balanceCents,
        createdAt: pmsFolios.createdAt,
      })
      .from(pmsFolios)
      .where(and(
        eq(pmsFolios.tenantId, tenantId),
        eq(pmsFolios.reservationId, reservationId),
      ))
      .orderBy(pmsFolios.folioNumber);

    return rows.map((r) => ({
      id: r.id,
      folioNumber: r.folioNumber,
      label: r.label,
      status: r.status,
      totalCents: r.totalCents,
      balanceCents: r.balanceCents,
      createdAt: String(r.createdAt),
    }));
  });
}
