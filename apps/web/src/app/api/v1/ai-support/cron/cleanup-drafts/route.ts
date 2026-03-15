import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db, aiSupportAnswerCards } from '@oppsera/db';
import { eq, and, sql, lt } from 'drizzle-orm';

/**
 * POST /api/v1/ai-support/cron/cleanup-drafts
 *
 * Vercel Cron trigger — archives stale auto-drafted answer cards that
 * have been sitting in 'draft' status for over 30 days without being
 * activated or edited by an admin.
 *
 * Schedule: daily at 04:30 UTC (configured in vercel.json).
 * Auth: CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[ai-draft-cleanup] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);

    // Archive auto-drafted cards that are still in 'draft' after 30 days.
    // version=1 ensures we don't touch drafts that an admin has already edited.
    const result = await db
      .update(aiSupportAnswerCards)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(aiSupportAnswerCards.status, 'draft'),
          eq(aiSupportAnswerCards.ownerUserId, '__auto_draft__'),
          eq(aiSupportAnswerCards.version, 1),
          lt(aiSupportAnswerCards.createdAt, cutoff),
        ),
      )
      .returning({ id: aiSupportAnswerCards.id });

    const archivedCount = result.length;

    if (archivedCount > 0) {
      console.log(
        `[ai-draft-cleanup] Archived ${archivedCount} stale auto-draft cards (>30 days in draft)`,
      );
    }

    return NextResponse.json({
      data: {
        ranAt: new Date().toISOString(),
        archivedCount,
      },
    });
  } catch (err) {
    console.error('[ai-draft-cleanup] Failed:', err);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
