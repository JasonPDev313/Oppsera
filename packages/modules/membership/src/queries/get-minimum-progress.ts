import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { minimumPeriodRollups } from '@oppsera/db';

export interface GetMinimumProgressInput {
  tenantId: string;
  customerId: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface MinimumProgressEntry {
  id: string;
  customerId: string;
  ruleId: string;
  periodStart: string;
  periodEnd: string;
  requiredCents: number;
  satisfiedCents: number;
  shortfallCents: number;
  rolloverInCents: number;
  rolloverOutCents: number;
  progressPercent: number;
  isMetMinimum: boolean;
  status: string;
}

export async function getMinimumProgress(
  input: GetMinimumProgressInput,
): Promise<MinimumProgressEntry[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(minimumPeriodRollups.tenantId, input.tenantId),
      eq(minimumPeriodRollups.customerId, input.customerId),
    ];

    if (input.periodStart) {
      conditions.push(gte(minimumPeriodRollups.periodStart, input.periodStart));
    }

    if (input.periodEnd) {
      conditions.push(lte(minimumPeriodRollups.periodEnd, input.periodEnd));
    }

    const rows = await (tx as any)
      .select({
        id: minimumPeriodRollups.id,
        customerId: minimumPeriodRollups.customerId,
        ruleId: minimumPeriodRollups.minimumSpendRuleId,
        periodStart: minimumPeriodRollups.periodStart,
        periodEnd: minimumPeriodRollups.periodEnd,
        requiredCents: minimumPeriodRollups.requiredCents,
        satisfiedCents: minimumPeriodRollups.satisfiedCents,
        shortfallCents: minimumPeriodRollups.shortfallCents,
        rolloverInCents: minimumPeriodRollups.rolloverInCents,
        rolloverOutCents: minimumPeriodRollups.rolloverOutCents,
        status: minimumPeriodRollups.status,
      })
      .from(minimumPeriodRollups)
      .where(and(...conditions))
      .orderBy(desc(minimumPeriodRollups.periodEnd));

    return (rows as any[]).map((r) => {
      const required = Number(r.requiredCents ?? 0);
      const satisfied = Number(r.satisfiedCents ?? 0);
      const rolloverIn = Number(r.rolloverInCents ?? 0);
      const shortfall = Number(r.shortfallCents ?? 0);

      const progressPercent =
        required > 0
          ? Math.min(100, Math.round(((satisfied + rolloverIn) / required) * 100))
          : 100;

      return {
        id: String(r.id),
        customerId: String(r.customerId),
        ruleId: String(r.ruleId),
        periodStart: r.periodStart instanceof Date
          ? r.periodStart.toISOString()
          : String(r.periodStart ?? ''),
        periodEnd: r.periodEnd instanceof Date
          ? r.periodEnd.toISOString()
          : String(r.periodEnd ?? ''),
        requiredCents: required,
        satisfiedCents: satisfied,
        shortfallCents: shortfall,
        rolloverInCents: rolloverIn,
        rolloverOutCents: Number(r.rolloverOutCents ?? 0),
        progressPercent,
        isMetMinimum: shortfall === 0,
        status: String(r.status),
      };
    });
  });
}
