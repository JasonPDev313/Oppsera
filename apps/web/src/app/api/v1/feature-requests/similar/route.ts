import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, notInArray, ilike, or } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests } from '@oppsera/db';

// ── Rate limit: 20 requests per user per minute ──────────────────
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const similarRateMap = new Map<string, { count: number; windowStart: number }>();

/** Lazily prune stale entries on each check — no setInterval on Vercel (gotcha #2) */
function pruneSimilarRateMap(now: number) {
  for (const [key, entry] of similarRateMap) {
    if (now - entry.windowStart > WINDOW_MS * 2) similarRateMap.delete(key);
  }
}

// ── GET: find similar requests for dedup hints ───────────────────

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Rate limit check (lazy prune instead of setInterval)
    const now = Date.now();
    pruneSimilarRateMap(now);
    const entry = similarRateMap.get(ctx.user.id);
    if (entry && now - entry.windowStart < WINDOW_MS) {
      if (entry.count >= MAX_PER_WINDOW) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' } },
          { status: 429 },
        );
      }
      entry.count++;
    } else {
      similarRateMap.set(ctx.user.id, { count: 1, windowStart: now });
    }
    const url = new URL(request.url);
    const module = url.searchParams.get('module');
    const title = url.searchParams.get('title');

    if (!module || !title) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Both module and title query params are required' } },
        { status: 400 },
      );
    }

    // Extract meaningful words from the title (> 2 chars)
    const words = title
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length > 2);

    if (words.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      // Build ilike conditions for each word
      const wordConditions = words.map((word) =>
        ilike(featureRequests.title, `%${word}%`),
      );

      return tx
        .select({
          id: featureRequests.id,
          title: featureRequests.title,
          requestType: featureRequests.requestType,
          status: featureRequests.status,
          voteCount: featureRequests.voteCount,
        })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            eq(featureRequests.module, module),
            notInArray(featureRequests.status, ['completed', 'declined']),
            or(...wordConditions),
          ),
        )
        .limit(5);
    });

    const data = Array.from(rows as Iterable<(typeof rows)[number]>);

    return NextResponse.json({ data });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
