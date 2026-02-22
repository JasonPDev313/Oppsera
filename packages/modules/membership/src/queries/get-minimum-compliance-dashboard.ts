import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { minimumPeriodRollups } from '@oppsera/db';

export interface GetMinimumComplianceDashboardInput {
  tenantId: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
}

export interface MinimumComplianceEntry {
  customerId: string;
  ruleId: string;
  periodStart: string;
  periodEnd: string;
  requiredCents: number;
  satisfiedCents: number;
  shortfallCents: number;
  progressPercent: number;
  status: string;
  trafficLight: 'green' | 'amber' | 'red';
}

export interface MinimumComplianceDashboard {
  totalMembers: number;
  metMinimum: number;
  atRisk: number;
  belowMinimum: number;
  totalRequiredCents: number;
  totalSatisfiedCents: number;
  totalShortfallCents: number;
  entries: MinimumComplianceEntry[];
}

function computeTrafficLight(progressPercent: number): 'green' | 'amber' | 'red' {
  if (progressPercent >= 100) return 'green';
  if (progressPercent >= 50) return 'amber';
  return 'red';
}

export async function getMinimumComplianceDashboard(
  input: GetMinimumComplianceDashboardInput,
): Promise<MinimumComplianceDashboard> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(minimumPeriodRollups.tenantId, input.tenantId),
    ];

    if (input.periodStart) {
      conditions.push(gte(minimumPeriodRollups.periodStart, input.periodStart));
    }

    if (input.periodEnd) {
      conditions.push(lte(minimumPeriodRollups.periodEnd, input.periodEnd));
    }

    if (input.status) {
      conditions.push(eq(minimumPeriodRollups.status, input.status));
    }

    const rows = await (tx as any)
      .select({
        customerId: minimumPeriodRollups.customerId,
        ruleId: minimumPeriodRollups.minimumSpendRuleId,
        periodStart: minimumPeriodRollups.periodStart,
        periodEnd: minimumPeriodRollups.periodEnd,
        requiredCents: minimumPeriodRollups.requiredCents,
        satisfiedCents: minimumPeriodRollups.satisfiedCents,
        shortfallCents: minimumPeriodRollups.shortfallCents,
        rolloverInCents: minimumPeriodRollups.rolloverInCents,
        status: minimumPeriodRollups.status,
      })
      .from(minimumPeriodRollups)
      .where(and(...conditions))
      .orderBy(desc(minimumPeriodRollups.periodEnd));

    // Compute aggregates in-app from the query results
    let totalRequiredCents = 0;
    let totalSatisfiedCents = 0;
    let totalShortfallCents = 0;
    let metMinimum = 0;
    let atRisk = 0;
    let belowMinimum = 0;

    const entries: MinimumComplianceEntry[] = (rows as any[]).map((r) => {
      const required = Number(r.requiredCents ?? 0);
      const satisfied = Number(r.satisfiedCents ?? 0);
      const rolloverIn = Number(r.rolloverInCents ?? 0);
      const shortfall = Number(r.shortfallCents ?? 0);

      const progressPercent =
        required > 0
          ? Math.min(100, Math.round(((satisfied + rolloverIn) / required) * 100))
          : 100;

      const trafficLight = computeTrafficLight(progressPercent);

      // Accumulate aggregates
      totalRequiredCents += required;
      totalSatisfiedCents += satisfied;
      totalShortfallCents += shortfall;

      if (trafficLight === 'green') {
        metMinimum += 1;
      } else if (trafficLight === 'amber') {
        atRisk += 1;
      } else {
        belowMinimum += 1;
      }

      return {
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
        progressPercent,
        status: String(r.status),
        trafficLight,
      };
    });

    return {
      totalMembers: entries.length,
      metMinimum,
      atRisk,
      belowMinimum,
      totalRequiredCents,
      totalSatisfiedCents,
      totalShortfallCents,
      entries,
    };
  });
}
