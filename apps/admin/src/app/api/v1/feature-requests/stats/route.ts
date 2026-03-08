import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { createAdminClient, featureRequests } from '@oppsera/db';

// ── GET: aggregate stats for feature requests ────────────────────

export const GET = withAdminAuth(async (_req: NextRequest) => {
  const db = createAdminClient();

  // Count by status
  const statusRows = await db
    .select({
      status: featureRequests.status,
      count: sql<number>`count(*)::int`,
    })
    .from(featureRequests)
    .groupBy(featureRequests.status);

  const byStatus: Record<string, number> = {};
  for (const row of Array.from(statusRows as Iterable<(typeof statusRows)[number]>)) {
    byStatus[row.status] = row.count;
  }

  // Count by priority
  const priorityRows = await db
    .select({
      priority: featureRequests.priority,
      count: sql<number>`count(*)::int`,
    })
    .from(featureRequests)
    .groupBy(featureRequests.priority);

  const byPriority: Record<string, number> = {};
  for (const row of Array.from(priorityRows as Iterable<(typeof priorityRows)[number]>)) {
    byPriority[row.priority] = row.count;
  }

  // Count by requestType
  const typeRows = await db
    .select({
      requestType: featureRequests.requestType,
      count: sql<number>`count(*)::int`,
    })
    .from(featureRequests)
    .groupBy(featureRequests.requestType);

  const byType: Record<string, number> = {};
  for (const row of Array.from(typeRows as Iterable<(typeof typeRows)[number]>)) {
    byType[row.requestType] = row.count;
  }

  // Totals + avg resolution time
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unresolved: sql<number>`count(*) filter (where ${featureRequests.status} NOT IN ('completed', 'declined'))::int`,
      avgResolutionHours: sql<number>`
        COALESCE(
          ROUND(
            EXTRACT(EPOCH FROM AVG(${featureRequests.resolvedAt} - ${featureRequests.createdAt}))
            / 3600.0,
            1
          ),
          0
        )::float
      `,
    })
    .from(featureRequests);

  // Top 5 modules by request count
  const topModuleRows = await db
    .select({
      module: featureRequests.module,
      count: sql<number>`count(*)::int`,
    })
    .from(featureRequests)
    .groupBy(featureRequests.module)
    .orderBy(sql`count(*) DESC`)
    .limit(5);

  const topModules = Array.from(topModuleRows as Iterable<(typeof topModuleRows)[number]>).map(r => ({
    module: r.module,
    count: r.count,
  }));

  return NextResponse.json({
    data: {
      total: totals?.total ?? 0,
      unresolved: totals?.unresolved ?? 0,
      avgResolutionHours: totals?.avgResolutionHours ?? 0,
      byStatus,
      byPriority,
      byType,
      topModules,
    },
  });
}, 'viewer');
