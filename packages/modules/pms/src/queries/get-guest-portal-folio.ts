import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@oppsera/db';
import { pmsFolios, pmsFolioEntries } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export interface GuestPortalFolioEntry {
  id: string;
  entryDate: string;
  entryType: string;
  description: string | null;
  amountCents: number;
}

export interface GuestPortalFolio {
  folioId: string;
  status: string;
  totalChargesCents: number;
  totalPaymentsCents: number;
  balanceCents: number;
  entries: GuestPortalFolioEntry[];
}

/**
 * Get the folio for a portal session's reservation (limited view for guests).
 * Resolves tenantId from the session token.
 */
export async function getGuestPortalFolio(
  token: string,
): Promise<GuestPortalFolio | null> {
  // Find session + tenantId by token (cross-tenant lookup via unique index)
  const sessionRows = await db.execute(
    sql`SELECT s.id, s.tenant_id, s.reservation_id, s.status, s.expires_at
      FROM pms_guest_portal_sessions s
      WHERE s.token = ${token}
      LIMIT 1`,
  );

  const sessions = Array.from(sessionRows as Iterable<Record<string, unknown>>);
  if (sessions.length === 0) {
    throw new AppError('SESSION_NOT_FOUND', 'Guest portal session not found', 404);
  }

  const session = sessions[0]!;
  if (session.status !== 'active') {
    throw new AppError('SESSION_INACTIVE', `Session is ${session.status}`, 410);
  }
  if (new Date() > (session.expires_at as Date)) {
    throw new AppError('SESSION_EXPIRED', 'Session has expired', 410);
  }

  const tenantId = session.tenant_id as string;
  const reservationId = session.reservation_id as string;

  return withTenant(tenantId, async (tx) => {
    // Find folio for reservation
    const [folio] = await tx
      .select()
      .from(pmsFolios)
      .where(
        and(
          eq(pmsFolios.reservationId, reservationId),
          eq(pmsFolios.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!folio) return null;

    // Get entries
    const entries = await tx
      .select()
      .from(pmsFolioEntries)
      .where(
        and(
          eq(pmsFolioEntries.folioId, folio.id),
          eq(pmsFolioEntries.tenantId, tenantId),
        ),
      );

    let totalChargesCents = 0;
    let totalPaymentsCents = 0;
    const mappedEntries: GuestPortalFolioEntry[] = entries.map((e) => {
      const amount = e.amountCents;
      if (amount > 0) totalChargesCents += amount;
      else totalPaymentsCents += Math.abs(amount);

      return {
        id: e.id,
        entryDate: e.businessDate,
        entryType: e.entryType,
        description: e.description ?? null,
        amountCents: amount,
      };
    });

    return {
      folioId: folio.id,
      status: folio.status,
      totalChargesCents,
      totalPaymentsCents,
      balanceCents: totalChargesCents - totalPaymentsCents,
      entries: mappedEntries,
    };
  });
}
