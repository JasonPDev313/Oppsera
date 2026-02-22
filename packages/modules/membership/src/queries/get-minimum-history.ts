import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { minimumPeriodRollups } from '@oppsera/db';

export interface GetMinimumHistoryInput {
  tenantId: string;
  customerId: string;
  ruleId?: string;
  cursor?: string;
  limit?: number;
}

export interface MinimumHistoryEntry {
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
  createdAt: string;
}

export interface GetMinimumHistoryResult {
  items: MinimumHistoryEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getMinimumHistory(
  input: GetMinimumHistoryInput,
): Promise<GetMinimumHistoryResult> {
  const limit = Math.min(input.limit ?? 20, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(minimumPeriodRollups.tenantId, input.tenantId),
      eq(minimumPeriodRollups.customerId, input.customerId),
    ];

    if (input.ruleId) {
      conditions.push(eq(minimumPeriodRollups.minimumSpendRuleId, input.ruleId));
    }

    if (input.cursor) {
      conditions.push(lt(minimumPeriodRollups.id, input.cursor));
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
        createdAt: minimumPeriodRollups.createdAt,
      })
      .from(minimumPeriodRollups)
      .where(and(...conditions))
      .orderBy(desc(minimumPeriodRollups.periodEnd), desc(minimumPeriodRollups.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const mapped: MinimumHistoryEntry[] = (items as any[]).map((r) => {
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
        createdAt: r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      };
    });

    return {
      items: mapped,
      cursor: hasMore ? mapped[mapped.length - 1]!.id : null,
      hasMore,
    };
  });
}
