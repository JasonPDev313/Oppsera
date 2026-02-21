import { db, registerTabs } from '@oppsera/db';
import { eq, and, max } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';

export interface CreateRegisterTabInput {
  terminalId: string;
  orderId?: string | null;
  label?: string | null;
  employeeId?: string;
  employeeName?: string | null;
}

/**
 * Create a register tab with auto-incremented tab number per terminal.
 * Used by PMS check-in-to-POS and any future cross-module flows
 * that need to open a POS tab programmatically.
 */
export async function createRegisterTabWithAutoNumber(
  ctx: RequestContext,
  input: CreateRegisterTabInput,
) {
  const [tabAgg] = await db
    .select({ maxTab: max(registerTabs.tabNumber) })
    .from(registerTabs)
    .where(
      and(
        eq(registerTabs.tenantId, ctx.tenantId),
        eq(registerTabs.terminalId, input.terminalId),
      ),
    );

  const nextTabNumber = Number(tabAgg?.maxTab ?? 0) + 1;

  const [tab] = await db
    .insert(registerTabs)
    .values({
      tenantId: ctx.tenantId,
      terminalId: input.terminalId,
      tabNumber: nextTabNumber,
      orderId: input.orderId ?? null,
      label: input.label ?? null,
      employeeId: input.employeeId ?? ctx.user.id,
      employeeName: input.employeeName ?? ctx.user.name ?? null,
    })
    .returning();

  return tab!;
}
