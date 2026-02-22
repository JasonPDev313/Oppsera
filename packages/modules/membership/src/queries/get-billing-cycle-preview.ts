import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { billingCycleRuns } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetBillingCyclePreviewInput {
  tenantId: string;
  runId: string;
}

export interface BillingCyclePreview {
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

export async function getBillingCyclePreview(
  input: GetBillingCyclePreviewInput,
): Promise<BillingCyclePreview> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await (tx as any)
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

    if (!row) {
      throw new NotFoundError('BillingCycleRun', input.runId);
    }

    return {
      id: String(row.id),
      cycleDate: row.cycleDate instanceof Date
        ? row.cycleDate.toISOString().slice(0, 10)
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
        ? row.startedAt.toISOString()
        : (row.startedAt ? String(row.startedAt) : null),
      completedAt: row.completedAt instanceof Date
        ? row.completedAt.toISOString()
        : (row.completedAt ? String(row.completedAt) : null),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ''),
    };
  });
}
