import { withTenant } from '@oppsera/db';
import { drawerSessions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { DrawerSession } from '../types';

function mapRow(row: typeof drawerSessions.$inferSelect): DrawerSession {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    profitCenterId: row.profitCenterId,
    employeeId: row.employeeId,
    businessDate: row.businessDate,
    status: row.status as 'open' | 'closed',
    openingBalanceCents: row.openingBalanceCents,
    changeFundCents: row.changeFundCents,
    closingCountCents: row.closingCountCents,
    expectedCashCents: row.expectedCashCents,
    varianceCents: row.varianceCents,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedBy: row.closedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface GetActiveDrawerSessionInput {
  tenantId: string;
  terminalId: string;
}

export async function getActiveDrawerSession(
  input: GetActiveDrawerSessionInput,
): Promise<DrawerSession | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(drawerSessions)
      .where(
        and(
          eq(drawerSessions.tenantId, input.tenantId),
          eq(drawerSessions.terminalId, input.terminalId),
          eq(drawerSessions.status, 'open'),
        ),
      )
      .limit(1);

    return row ? mapRow(row) : null;
  });
}
