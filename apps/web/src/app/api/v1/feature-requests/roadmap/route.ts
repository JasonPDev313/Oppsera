import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, inArray, desc, asc, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests, featureRequestVotes } from '@oppsera/db';

// ── Shared column selection ──────────────────────────────────────
const ROADMAP_COLUMNS = {
  id: featureRequests.id,
  title: featureRequests.title,
  description: featureRequests.description,
  businessImpact: featureRequests.businessImpact,
  requestType: featureRequests.requestType,
  module: featureRequests.module,
  status: featureRequests.status,
  priority: featureRequests.priority,
  voteCount: featureRequests.voteCount,
  createdAt: featureRequests.createdAt,
} as const;

const PRIORITY_ORDER = sql`CASE ${featureRequests.priority}
  WHEN 'critical' THEN 4
  WHEN 'high' THEN 3
  WHEN 'medium' THEN 2
  WHEN 'low' THEN 1
  ELSE 0
END`;

// ── GET: roadmap items (active + recently completed) ─────────────

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    // Fetch active roadmap items
    const activeRows = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select(ROADMAP_COLUMNS)
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            inArray(featureRequests.status, ['under_review', 'planned', 'in_progress']),
          ),
        )
        .orderBy(desc(PRIORITY_ORDER), desc(featureRequests.voteCount), asc(featureRequests.createdAt));
    });

    // Fetch recently completed items (last 90 days, max 10)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const completedRows = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select(ROADMAP_COLUMNS)
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            eq(featureRequests.status, 'completed'),
            sql`${featureRequests.updatedAt} >= ${ninetyDaysAgo.toISOString()}`,
          ),
        )
        .orderBy(desc(featureRequests.updatedAt))
        .limit(10);
    });

    const activeData = Array.from(activeRows as Iterable<(typeof activeRows)[number]>);
    const completedData = Array.from(completedRows as Iterable<(typeof completedRows)[number]>);
    const allData = [...activeData, ...completedData];

    // Fetch which items the current user has voted on
    const votedIds = new Set<string>();
    if (allData.length > 0) {
      const itemIds = allData.map((r) => r.id);
      const votes = await withTenant(ctx.tenantId, async (tx) => {
        return tx
          .select({ featureRequestId: featureRequestVotes.featureRequestId })
          .from(featureRequestVotes)
          .where(
            and(
              eq(featureRequestVotes.userId, ctx.user.id),
              inArray(featureRequestVotes.featureRequestId, itemIds),
            ),
          );
      });

      const voteData = Array.from(votes as Iterable<(typeof votes)[number]>);
      for (const v of voteData) {
        votedIds.add(v.featureRequestId);
      }
    }

    const enrich = (item: (typeof allData)[number]) => ({ ...item, voted: votedIds.has(item.id) });

    return NextResponse.json({
      data: activeData.map(enrich),
      completed: completedData.map(enrich),
    });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
