import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, inArray, desc, asc, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests, featureRequestVotes } from '@oppsera/db';

// ── GET: roadmap items (under_review, planned, in_progress) ─────

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const rows = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select({
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
        })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            inArray(featureRequests.status, ['under_review', 'planned', 'in_progress']),
          ),
        )
        .orderBy(
          desc(
            sql`CASE ${featureRequests.priority}
              WHEN 'critical' THEN 4
              WHEN 'high' THEN 3
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 1
              ELSE 0
            END`,
          ),
          desc(featureRequests.voteCount),
          asc(featureRequests.createdAt),
        );
    });

    const data = Array.from(rows as Iterable<(typeof rows)[number]>);

    // Also fetch which items the current user has voted on
    const votedIds = new Set<string>();
    if (data.length > 0) {
      const itemIds = data.map((r) => r.id);
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

    const enriched = data.map((item) => ({
      ...item,
      voted: votedIds.has(item.id),
    }));

    return NextResponse.json({ data: enriched });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
