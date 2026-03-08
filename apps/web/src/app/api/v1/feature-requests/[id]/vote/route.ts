import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests, featureRequestVotes } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── POST: toggle vote ────────────────────────────────────────────

export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const segments = new URL(_request.url).pathname.split('/').filter(Boolean);
    const featureRequestId = segments[segments.indexOf('feature-requests') + 1]!;

    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Verify the feature request exists in this tenant
      const [fr] = await tx
        .select({ id: featureRequests.id, voteCount: featureRequests.voteCount })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.id, featureRequestId),
            eq(featureRequests.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!fr) {
        return { error: 'NOT_FOUND' as const, voted: false, voteCount: 0 };
      }

      // Check if user already voted
      const [existingVote] = await tx
        .select({ id: featureRequestVotes.id })
        .from(featureRequestVotes)
        .where(
          and(
            eq(featureRequestVotes.featureRequestId, featureRequestId),
            eq(featureRequestVotes.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (existingVote) {
        // Un-vote: delete and decrement
        await tx
          .delete(featureRequestVotes)
          .where(eq(featureRequestVotes.id, existingVote.id));

        const [updated] = await tx
          .update(featureRequests)
          .set({ voteCount: sql`GREATEST(${featureRequests.voteCount} - 1, 0)` })
          .where(eq(featureRequests.id, featureRequestId))
          .returning({ voteCount: featureRequests.voteCount });

        return { error: null, voted: false, voteCount: updated?.voteCount ?? 0 };
      } else {
        // Vote: insert and increment
        await tx.insert(featureRequestVotes).values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          featureRequestId,
          userId: ctx.user.id,
        });

        const [updated] = await tx
          .update(featureRequests)
          .set({ voteCount: sql`${featureRequests.voteCount} + 1` })
          .where(eq(featureRequests.id, featureRequestId))
          .returning({ voteCount: featureRequests.voteCount });

        return { error: null, voted: true, voteCount: updated?.voteCount ?? 0 };
      }
    });

    if (result.error === 'NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: { voted: result.voted, voteCount: result.voteCount },
    });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);

// ── GET: check vote status ───────────────────────────────────────

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const segments = new URL(_request.url).pathname.split('/').filter(Boolean);
    const featureRequestId = segments[segments.indexOf('feature-requests') + 1]!;

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select({ id: featureRequestVotes.id })
        .from(featureRequestVotes)
        .where(
          and(
            eq(featureRequestVotes.featureRequestId, featureRequestId),
            eq(featureRequestVotes.userId, ctx.user.id),
          ),
        )
        .limit(1);
    });

    const data = Array.from(rows as Iterable<(typeof rows)[number]>);

    return NextResponse.json({
      data: { voted: data.length > 0 },
    });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
