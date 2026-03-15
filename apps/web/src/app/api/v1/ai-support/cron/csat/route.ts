import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import {
  db,
  aiSupportCsatPredictions,
  aiAssistantMessages,
  aiAssistantThreads,
} from '@oppsera/db';
import { eq, and, isNull, lt, or, sql } from 'drizzle-orm';
import { predictCSAT } from '@oppsera/module-ai-support';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/v1/ai-support/cron/csat
 *
 * Vercel Cron — predicts CSAT scores for completed support threads.
 *
 * Eligibility criteria (threads without an existing CSAT prediction):
 *  - Status is 'closed', OR
 *  - No messages in the last 30 minutes (conversation has gone idle)
 *
 * Bounded to 10 threads per invocation to respect Vercel's serverless
 * execution constraints (§254: bounded iteration for serverless recovery flows).
 *
 * Schedule: every 30 minutes (configured in vercel.json).
 * Auth: CRON_SECRET bearer token (timing-safe comparison).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const secretBuf = Buffer.from(secret ?? '');
  const tokenBuf = Buffer.from(token);
  if (!secret || !token || secretBuf.length !== tokenBuf.length || !crypto.timingSafeEqual(secretBuf, tokenBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const BATCH_SIZE = 10;

  try {
    // Cutoff: threads with no activity in the last 30 minutes are considered idle
    const idleCutoff = new Date(Date.now() - 30 * 60 * 1000);

    // Find up to BATCH_SIZE threads that are closed or idle and have no CSAT prediction yet.
    // Uses a LEFT JOIN on csat_predictions and filters for NULL (no prediction row).
    const candidates = await db
      .select({
        id: aiAssistantThreads.id,
        tenantId: aiAssistantThreads.tenantId,
      })
      .from(aiAssistantThreads)
      .leftJoin(
        aiSupportCsatPredictions,
        eq(aiSupportCsatPredictions.threadId, aiAssistantThreads.id),
      )
      .where(
        and(
          // No prediction exists yet
          isNull(aiSupportCsatPredictions.id),
          // Thread is closed OR has no messages in the last 30 min
          or(
            eq(aiAssistantThreads.status, 'closed'),
            lt(
              aiAssistantThreads.updatedAt,
              idleCutoff,
            ),
          ),
        ),
      )
      .limit(BATCH_SIZE);

    let predicted = 0;

    for (const thread of candidates) {
      const result = await predictCSAT(thread.id, thread.tenantId);
      if (result !== null) {
        predicted++;
      }
    }

    console.log(`[ai-support/csat-cron] processed=${candidates.length} predicted=${predicted}`);

    return NextResponse.json({ processed: candidates.length, predicted });
  } catch (err) {
    console.error('[ai-support/csat]', 'Cron job failed:', err);
    return NextResponse.json(
      { error: 'CSAT cron failed' },
      { status: 500 },
    );
  }
}
