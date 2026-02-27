import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import {
  backfillGlFromTenders,
  getSmartResolutionSuggestions,
  applySmartResolutions,
  getGlPostingGaps,
} from '@oppsera/module-accounting';

// ── Per-tenant rate limiter (Fix 6: tenant fairness) ────────────
// Prevents a single tenant from hammering the backfill endpoint.
// Max 2 calls per 5 minutes per tenant, max 1 concurrent.
const _tenantBackfillState = new Map<string, { lastCalls: number[]; inProgress: boolean }>();
const RATE_WINDOW_MS = 5 * 60_000;
const MAX_CALLS_PER_WINDOW = 2;
// LRU cap — prevent unbounded Map growth
const MAX_TRACKED_TENANTS = 500;

function checkBackfillRate(tenantId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let state = _tenantBackfillState.get(tenantId);

  if (!state) {
    // Evict oldest if at capacity
    if (_tenantBackfillState.size >= MAX_TRACKED_TENANTS) {
      const firstKey = _tenantBackfillState.keys().next().value as string;
      _tenantBackfillState.delete(firstKey);
    }
    state = { lastCalls: [], inProgress: false };
    _tenantBackfillState.set(tenantId, state);
  }

  // Block concurrent backfills for same tenant
  if (state.inProgress) {
    return { allowed: false, retryAfterMs: 10_000 };
  }

  // Sliding window check
  state.lastCalls = state.lastCalls.filter((t) => now - t < RATE_WINDOW_MS);
  if (state.lastCalls.length >= MAX_CALLS_PER_WINDOW) {
    const oldestInWindow = state.lastCalls[0]!;
    const retryAfterMs = RATE_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, retryAfterMs };
  }

  state.lastCalls.push(now);
  state.inProgress = true;
  return { allowed: true };
}

function releaseBackfillLock(tenantId: string) {
  const state = _tenantBackfillState.get(tenantId);
  if (state) state.inProgress = false;
}

/**
 * POST /api/v1/accounting/gl-readiness/backfill
 *
 * Automatically backfills GL entries for unposted tenders, then
 * auto-applies high-confidence smart resolution suggestions.
 * Called by the GLReadinessBanner when gaps are detected.
 *
 * Accepts optional `afterTenderId` in body for cursor-based resume.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { tenantId } = ctx;

    // Rate limit (Fix 6)
    const rateCheck = checkBackfillRate(tenantId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Backfill rate limit exceeded. Try again shortly.' } },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rateCheck.retryAfterMs ?? 10_000) / 1000)) },
        },
      );
    }

    try {
      // Parse optional cursor from request body
      let afterTenderId: string | undefined;
      try {
        const body = await request.json();
        if (body?.afterTenderId && typeof body.afterTenderId === 'string') {
          afterTenderId = body.afterTenderId;
        }
      } catch {
        // Empty body or invalid JSON — proceed without cursor
      }

      // 1. Run backfill (limit 500 to stay within Vercel 30s timeout)
      const backfill = await withTenant(tenantId, async (tx) =>
        backfillGlFromTenders(tx, tenantId, { limit: 500, afterTenderId }),
      );

      // 2. Auto-apply high-confidence smart resolutions (only on last batch)
      let autoResolved = { applied: 0, remaining: 0 };
      if (!backfill.hasMore) {
        try {
          const suggestions = await getSmartResolutionSuggestions(tenantId);

          // Filter to high-confidence only
          const highConfidence = suggestions.suggestions.filter(
            (s) => s.confidence === 'high',
          );

          if (highConfidence.length > 0) {
            const result = await applySmartResolutions(ctx, {
              suggestions: highConfidence.map((s) => ({
                entityType: s.entityType,
                entityId: s.entityId,
                suggestedAccountId: s.suggestedAccountId,
              })),
            });
            autoResolved = {
              applied: result.mappingsCreated,
              remaining: suggestions.totalEvents - result.eventsResolved,
            };
          } else {
            autoResolved = {
              applied: 0,
              remaining: suggestions.totalEvents,
            };
          }
        } catch (err) {
          console.error('[gl-readiness] Smart resolution phase failed:', err);
        }
      }

      // 3. Re-check coverage after backfill + resolutions (only on last batch)
      let isFullyCovered = false;
      if (!backfill.hasMore) {
        const endDate = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
        const gapsAfter = await getGlPostingGaps({ tenantId, startDate, endDate }).catch(
          () => ({ isFullyCovered: false } as { isFullyCovered: boolean }),
        );
        isFullyCovered = gapsAfter.isFullyCovered && autoResolved.remaining === 0;
      }

      return NextResponse.json({
        data: {
          backfill,
          autoResolved,
          isFullyCovered,
        },
      });
    } finally {
      releaseBackfillLock(tenantId);
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
