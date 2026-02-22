import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { billingCycleRuns } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetBillingCycleRunInput {
  tenantId: string;
  runId?: string; // If not provided, returns the active run
}

export interface BillingCycleRunData {
  id: string;
  cycleDate: string;
  status: string;
  previewSummary: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  totalDuesBilledCents: number;
  totalInitiationBilledCents: number;
  totalMinimumsChargedCents: number;
  totalLateFeesCents: number;
  totalStatementsGenerated: number;
  totalAutopayCollectedCents: number;
  exceptionsJson: Record<string, unknown>[] | null;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function getBillingCycleRun(
  input: GetBillingCycleRunInput,
): Promise<BillingCycleRunData | null> {
  return withTenant(input.tenantId, async (tx) => {
    let row: Record<string, unknown> | undefined;

    if (input.runId) {
      // Fetch specific run by ID
      const [found] = await (tx as any)
        .select({
          id: billingCycleRuns.id,
          cycleDate: billingCycleRuns.cycleDate,
          status: billingCycleRuns.status,
          previewSummary: billingCycleRuns.previewSummary,
          steps: billingCycleRuns.steps,
          totalDuesBilledCents: billingCycleRuns.totalDuesBilledCents,
          totalInitiationBilledCents: billingCycleRuns.totalInitiationBilledCents,
          totalMinimumsChargedCents: billingCycleRuns.totalMinimumsChargedCents,
          totalLateFeesCents: billingCycleRuns.totalLateFeesCents,
          totalStatementsGenerated: billingCycleRuns.totalStatementsGenerated,
          totalAutopayCollectedCents: billingCycleRuns.totalAutopayCollectedCents,
          exceptionsJson: billingCycleRuns.exceptionsJson,
          startedBy: billingCycleRuns.startedBy,
          startedAt: billingCycleRuns.startedAt,
          completedAt: billingCycleRuns.completedAt,
          createdAt: billingCycleRuns.createdAt,
        })
        .from(billingCycleRuns)
        .where(
          and(
            eq(billingCycleRuns.tenantId, input.tenantId),
            eq(billingCycleRuns.id, input.runId),
          ),
        )
        .limit(1);

      if (!found) {
        throw new NotFoundError('BillingCycleRun', input.runId);
      }
      row = found;
    } else {
      // Find the currently active run (preview or in_progress)
      const [found] = await (tx as any)
        .select({
          id: billingCycleRuns.id,
          cycleDate: billingCycleRuns.cycleDate,
          status: billingCycleRuns.status,
          previewSummary: billingCycleRuns.previewSummary,
          steps: billingCycleRuns.steps,
          totalDuesBilledCents: billingCycleRuns.totalDuesBilledCents,
          totalInitiationBilledCents: billingCycleRuns.totalInitiationBilledCents,
          totalMinimumsChargedCents: billingCycleRuns.totalMinimumsChargedCents,
          totalLateFeesCents: billingCycleRuns.totalLateFeesCents,
          totalStatementsGenerated: billingCycleRuns.totalStatementsGenerated,
          totalAutopayCollectedCents: billingCycleRuns.totalAutopayCollectedCents,
          exceptionsJson: billingCycleRuns.exceptionsJson,
          startedBy: billingCycleRuns.startedBy,
          startedAt: billingCycleRuns.startedAt,
          completedAt: billingCycleRuns.completedAt,
          createdAt: billingCycleRuns.createdAt,
        })
        .from(billingCycleRuns)
        .where(
          and(
            eq(billingCycleRuns.tenantId, input.tenantId),
            inArray(billingCycleRuns.status, ['preview', 'in_progress']),
          ),
        )
        .limit(1);

      if (!found) {
        return null;
      }
      row = found;
    }

    if (!row) return null;

    return {
      id: String(row.id),
      cycleDate: row.cycleDate instanceof Date
        ? (row.cycleDate as Date).toISOString().slice(0, 10)
        : String(row.cycleDate ?? ''),
      status: String(row.status),
      previewSummary: (row.previewSummary as Record<string, unknown>) ?? null,
      steps: Array.isArray(row.steps)
        ? (row.steps as Record<string, unknown>[])
        : [],
      totalDuesBilledCents: Number(row.totalDuesBilledCents ?? 0),
      totalInitiationBilledCents: Number(row.totalInitiationBilledCents ?? 0),
      totalMinimumsChargedCents: Number(row.totalMinimumsChargedCents ?? 0),
      totalLateFeesCents: Number(row.totalLateFeesCents ?? 0),
      totalStatementsGenerated: Number(row.totalStatementsGenerated ?? 0),
      totalAutopayCollectedCents: Number(row.totalAutopayCollectedCents ?? 0),
      exceptionsJson: Array.isArray(row.exceptionsJson)
        ? (row.exceptionsJson as Record<string, unknown>[])
        : null,
      startedBy: row.startedBy ? String(row.startedBy) : null,
      startedAt: row.startedAt instanceof Date
        ? (row.startedAt as Date).toISOString()
        : (row.startedAt ? String(row.startedAt) : null),
      completedAt: row.completedAt instanceof Date
        ? (row.completedAt as Date).toISOString()
        : (row.completedAt ? String(row.completedAt) : null),
      createdAt: row.createdAt instanceof Date
        ? (row.createdAt as Date).toISOString()
        : String(row.createdAt ?? ''),
    };
  });
}
