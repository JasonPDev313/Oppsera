import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  membershipAccounts,
  membershipHolds,
  lateFeeAssessments,
} from '@oppsera/db';

export interface GetRiskDashboardInput {
  tenantId: string;
}

export interface RiskHoldEntry {
  id: string;
  membershipAccountId: string;
  holdType: string;
  reason: string;
  placedBy: string;
  placedAt: string;
}

export interface RiskLateFeeEntry {
  id: string;
  membershipAccountId: string;
  assessmentDate: string;
  overdueAmountCents: number;
  feeAmountCents: number;
  waived: boolean;
}

export interface RiskDashboard {
  totalActiveAccounts: number;
  accountsWithHolds: number;
  frozenAccounts: number;
  suspendedAccounts: number;
  activeHolds: RiskHoldEntry[];
  recentLateFees: RiskLateFeeEntry[];
}

export async function getRiskDashboard(
  input: GetRiskDashboardInput,
): Promise<RiskDashboard> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Count membership accounts by status in a single query
    const statusCountResult = await tx.execute(
      sql`
        SELECT
          status,
          COUNT(*)::int AS cnt
        FROM ${membershipAccounts}
        WHERE tenant_id = ${input.tenantId}
        GROUP BY status
      `,
    );

    let totalActiveAccounts = 0;
    let frozenAccounts = 0;
    let suspendedAccounts = 0;

    for (const row of Array.from(statusCountResult as Iterable<Record<string, unknown>>)) {
      const status = String(row.status);
      const count = Number(row.cnt ?? 0);
      if (status === 'active') totalActiveAccounts = count;
      else if (status === 'frozen') frozenAccounts = count;
      else if (status === 'suspended') suspendedAccounts = count;
    }

    // 2. Count accounts with holdCharging = true
    const holdCountResult = await tx.execute(
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${membershipAccounts}
        WHERE tenant_id = ${input.tenantId}
          AND hold_charging = true
      `,
    );
    const accountsWithHolds = Number(
      (Array.from(holdCountResult as Iterable<Record<string, unknown>>)[0] as any)?.cnt ?? 0,
    );

    // 3. List active membership holds (limit 20)
    const holdRows = await (tx as any)
      .select({
        id: membershipHolds.id,
        membershipAccountId: membershipHolds.membershipAccountId,
        holdType: membershipHolds.holdType,
        reason: membershipHolds.reason,
        placedBy: membershipHolds.placedBy,
        placedAt: membershipHolds.placedAt,
      })
      .from(membershipHolds)
      .where(
        and(
          eq(membershipHolds.tenantId, input.tenantId),
          eq(membershipHolds.isActive, true),
        ),
      )
      .orderBy(desc(membershipHolds.placedAt))
      .limit(20);

    const activeHolds: RiskHoldEntry[] = (holdRows as any[]).map((r) => ({
      id: String(r.id),
      membershipAccountId: String(r.membershipAccountId),
      holdType: String(r.holdType),
      reason: String(r.reason),
      placedBy: String(r.placedBy),
      placedAt: r.placedAt instanceof Date
        ? r.placedAt.toISOString()
        : String(r.placedAt ?? ''),
    }));

    // 4. List recent late fee assessments (limit 20)
    const lateFeeRows = await (tx as any)
      .select({
        id: lateFeeAssessments.id,
        membershipAccountId: lateFeeAssessments.membershipAccountId,
        assessmentDate: lateFeeAssessments.assessmentDate,
        overdueAmountCents: lateFeeAssessments.overdueAmountCents,
        feeAmountCents: lateFeeAssessments.feeAmountCents,
        waived: lateFeeAssessments.waived,
      })
      .from(lateFeeAssessments)
      .where(eq(lateFeeAssessments.tenantId, input.tenantId))
      .orderBy(desc(lateFeeAssessments.assessmentDate))
      .limit(20);

    const recentLateFees: RiskLateFeeEntry[] = (lateFeeRows as any[]).map((r) => ({
      id: String(r.id),
      membershipAccountId: String(r.membershipAccountId),
      assessmentDate: r.assessmentDate instanceof Date
        ? r.assessmentDate.toISOString()
        : String(r.assessmentDate ?? ''),
      overdueAmountCents: Number(r.overdueAmountCents ?? 0),
      feeAmountCents: Number(r.feeAmountCents ?? 0),
      waived: Boolean(r.waived),
    }));

    return {
      totalActiveAccounts,
      accountsWithHolds,
      frozenAccounts,
      suspendedAccounts,
      activeHolds,
      recentLateFees,
    };
  });
}
