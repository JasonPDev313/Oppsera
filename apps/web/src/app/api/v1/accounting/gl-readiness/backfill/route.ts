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
//
// VERCEL / SERVERLESS LIMITATION:
// This Map is process-local — each serverless instance maintains its own
// counters that reset on cold start. A tenant routed to a new instance
// gets a fresh counter, allowing up to MAX_CALLS_PER_WINDOW again.
// This is acceptable: backfills are idempotent and GL posting is designed
// to be re-run without duplication. The limit is a fairness guardrail, not
// a hard correctness constraint. Under high concurrency, multiple instances
// could each allow a backfill simultaneously — this is safe because the
// backfill command uses optimistic locking internally.
//
// The `inProgress` flag prevents concurrent backfills on the SAME instance.
// The try/finally in the handler guarantees the flag is always released,
// even on timeout or error.
//
// Stage 2+: Move state to Redis for cross-instance enforcement.
const _tenantBackfillState = new Map<string, { lastCalls: number[]; inProgress: boolean }>();
const RATE_WINDOW_MS = 5 * 60_000;
const MAX_CALLS_PER_WINDOW = 2;
// LRU cap — prevent unbounded Map growth on long-lived instances
const MAX_TRACKED_TENANTS = 500;

function checkBackfillRate(
  tenantId: string,
  isContinuation = false,
): { allowed: boolean; retryAfterMs?: number } {
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

  // Continuation batches (cursor-based) skip the sliding window —
  // they're sequential follow-ups from the same logical backfill run
  if (!isContinuation) {
    // Sliding window check (initial requests only)
    state.lastCalls = state.lastCalls.filter((t) => now - t < RATE_WINDOW_MS);
    if (state.lastCalls.length >= MAX_CALLS_PER_WINDOW) {
      const oldestInWindow = state.lastCalls[0]!;
      const retryAfterMs = RATE_WINDOW_MS - (now - oldestInWindow);
      return { allowed: false, retryAfterMs };
    }
    state.lastCalls.push(now);
  }

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

    // Parse optional cursor from request body (before rate check — cursor
    // presence determines whether this is an initial or continuation batch)
    let afterTenderId: string | undefined;
    try {
      const body = await request.json();
      if (body?.afterTenderId && typeof body.afterTenderId === 'string') {
        afterTenderId = body.afterTenderId;
      }
    } catch {
      // Empty body or invalid JSON — proceed without cursor
    }

    // Rate limit (Fix 6) — only initial requests (no cursor) count against
    // the sliding window. Continuation batches (with afterTenderId) are exempt
    // so multi-batch backfills can complete without being rate-limited mid-run.
    // The inProgress flag still prevents truly concurrent backfills.
    const isContinuation = !!afterTenderId;
    const rateCheck = checkBackfillRate(tenantId, isContinuation);
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
      // 1. Run backfill (limit 500 to stay within Vercel 30s timeout)
      let backfill;
      try {
        backfill = await withTenant(tenantId, async (tx) =>
          backfillGlFromTenders(tx, tenantId, { limit: 100, afterTenderId }),
        );
      } catch (err) {
        console.error('[gl-readiness] Backfill DB query failed:', err);
        return NextResponse.json(
          { error: { code: 'BACKFILL_FAILED', message: `GL backfill failed: ${err instanceof Error ? err.message : 'Unknown error'}` } },
          { status: 500 },
        );
      }

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
            // Exclude skippedErrors from remaining — they are non-actionable data issues
            // (zero_dollar_order, no_line_detail, etc.) that should not prevent isFullyCovered
            const actionableRemaining = suggestions.totalEvents - suggestions.skippedErrors - result.eventsResolved;
            autoResolved = {
              applied: result.mappingsCreated,
              remaining: Math.max(0, actionableRemaining),
            };
          } else {
            const actionableRemaining = suggestions.totalEvents - suggestions.skippedErrors;
            autoResolved = {
              applied: 0,
              remaining: Math.max(0, actionableRemaining),
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
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
