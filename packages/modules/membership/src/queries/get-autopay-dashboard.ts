import { eq, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { autopayRuns, autopayProfiles, autopayAttempts } from '@oppsera/db';

export interface GetAutopayDashboardInput {
  tenantId: string;
  limit?: number;
}

export interface AutopayRunEntry {
  id: string;
  runDate: string;
  status: string;
  totalProfilesCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalCollectedCents: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AutopayDashboard {
  recentRuns: AutopayRunEntry[];
  activeProfilesCount: number;
  pendingRetriesCount: number;
}

export async function getAutopayDashboard(
  input: GetAutopayDashboardInput,
): Promise<AutopayDashboard> {
  const limit = Math.min(input.limit ?? 10, 50);

  return withTenant(input.tenantId, async (tx) => {
    // 1. Fetch recent autopay runs
    const runRows = await (tx as any)
      .select({
        id: autopayRuns.id,
        runDate: autopayRuns.runDate,
        status: autopayRuns.status,
        totalProfilesCount: autopayRuns.totalProfilesCount,
        successCount: autopayRuns.successCount,
        failedCount: autopayRuns.failedCount,
        skippedCount: autopayRuns.skippedCount,
        totalCollectedCents: autopayRuns.totalCollectedCents,
        startedAt: autopayRuns.startedAt,
        completedAt: autopayRuns.completedAt,
      })
      .from(autopayRuns)
      .where(eq(autopayRuns.tenantId, input.tenantId))
      .orderBy(desc(autopayRuns.runDate))
      .limit(limit);

    const recentRuns: AutopayRunEntry[] = (runRows as any[]).map((r) => ({
      id: String(r.id),
      runDate: r.runDate instanceof Date
        ? r.runDate.toISOString()
        : String(r.runDate ?? ''),
      status: String(r.status),
      totalProfilesCount: Number(r.totalProfilesCount ?? 0),
      successCount: Number(r.successCount ?? 0),
      failedCount: Number(r.failedCount ?? 0),
      skippedCount: Number(r.skippedCount ?? 0),
      totalCollectedCents: Number(r.totalCollectedCents ?? 0),
      startedAt: r.startedAt instanceof Date
        ? r.startedAt.toISOString()
        : (r.startedAt ? String(r.startedAt) : null),
      completedAt: r.completedAt instanceof Date
        ? r.completedAt.toISOString()
        : (r.completedAt ? String(r.completedAt) : null),
    }));

    // 2. Count active autopay profiles
    const activeProfileResult = await tx.execute(
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${autopayProfiles}
        WHERE tenant_id = ${input.tenantId}
          AND is_active = true
      `,
    );
    const activeProfilesCount = Number(
      (Array.from(activeProfileResult as Iterable<Record<string, unknown>>)[0] as any)?.cnt ?? 0,
    );

    // 3. Count autopay attempts with status='retry' (pending retries)
    const retryResult = await tx.execute(
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${autopayAttempts}
        WHERE tenant_id = ${input.tenantId}
          AND status = 'retry'
      `,
    );
    const pendingRetriesCount = Number(
      (Array.from(retryResult as Iterable<Record<string, unknown>>)[0] as any)?.cnt ?? 0,
    );

    return {
      recentRuns,
      activeProfilesCount,
      pendingRetriesCount,
    };
  });
}
