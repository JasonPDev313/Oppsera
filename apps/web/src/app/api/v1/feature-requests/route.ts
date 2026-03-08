import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, desc, and, sql, lt } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { auditLogDeferred } from '@oppsera/core/audit';

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Defense-in-depth sanitizer for stored user text.
 * React auto-escapes on render, but we strip dangerous patterns before storage
 * to protect against non-React consumers (email templates, admin CSV exports, etc.).
 */
function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')              // strip HTML tags
    .replace(/javascript\s*:/gi, '')      // strip JS protocol
    .replace(/on\w+\s*=/gi, '')           // strip inline event handlers
    .replace(/data\s*:\s*text\/html/gi, '') // strip data:text/html URIs
    .trim();
}

// ── Validation ──────────────────────────────────────────────────

const createFeatureRequestSchema = z.object({
  requestType: z.enum(['feature', 'enhancement', 'bug']),
  module: z.string().min(1).max(100).transform(sanitize),
  submodule: z.string().max(100).transform(sanitize).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200).transform(sanitize),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000).transform(sanitize),
  businessImpact: z.string().max(1000).transform(sanitize).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  additionalNotes: z.string().max(1000).transform(sanitize).optional(),
  currentWorkaround: z.string().max(500).transform(sanitize).optional(),
});

// ── GET: list my feature requests ───────────────────────────────

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawCursor = url.searchParams.get('cursor');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);

    // Validate cursor is a valid ISO date if provided
    let cursor: Date | null = null;
    if (rawCursor) {
      const parsed = new Date(rawCursor);
      if (!Number.isNaN(parsed.getTime())) cursor = parsed;
    }

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      const conditions = [
        eq(featureRequests.tenantId, ctx.tenantId),
        eq(featureRequests.submittedBy, ctx.user.id),
      ];

      if (cursor) {
        conditions.push(lt(featureRequests.createdAt, cursor));
      }

      return tx
        .select({
          id: featureRequests.id,
          requestType: featureRequests.requestType,
          module: featureRequests.module,
          submodule: featureRequests.submodule,
          title: featureRequests.title,
          description: featureRequests.description,
          businessImpact: featureRequests.businessImpact,
          priority: featureRequests.priority,
          additionalNotes: featureRequests.additionalNotes,
          currentWorkaround: featureRequests.currentWorkaround,
          status: featureRequests.status,
          // adminNotes intentionally excluded — internal only
          createdAt: featureRequests.createdAt,
          updatedAt: featureRequests.updatedAt,
        })
        .from(featureRequests)
        .where(and(...conditions))
        .orderBy(desc(featureRequests.createdAt))
        .limit(limit + 1);
    });

    const data = Array.from(rows as Iterable<(typeof rows)[number]>);
    const hasMore = data.length > limit;
    if (hasMore) data.pop();

    return NextResponse.json({
      data,
      meta: {
        cursor: data.length > 0 ? data[data.length - 1]!.createdAt.toISOString() : null,
        hasMore,
      },
    });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);

// ── POST: submit a feature request ──────────────────────────────

/** Max submissions per user per day — prevents spam. */
const DAILY_LIMIT = 10;

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Safe JSON parse
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }

    const parsed = createFeatureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }

    // ── Atomic rate limit + dedup + insert inside a transaction ──
    const id = generateUlid();
    const now = new Date();

    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Rate limit: max N per user per day
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            eq(featureRequests.submittedBy, ctx.user.id),
            sql`${featureRequests.createdAt} >= ${todayStart.toISOString()}`,
          ),
        );

      if ((countResult?.count ?? 0) >= DAILY_LIMIT) {
        return { error: 'RATE_LIMITED' as const };
      }

      // Duplicate detection: same title + module within 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
      const [duplicate] = await tx
        .select({ id: featureRequests.id })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            eq(featureRequests.submittedBy, ctx.user.id),
            eq(featureRequests.title, parsed.data.title),
            eq(featureRequests.module, parsed.data.module),
            sql`${featureRequests.createdAt} >= ${fiveMinAgo.toISOString()}`,
          ),
        )
        .limit(1);

      if (duplicate) {
        return { error: 'DUPLICATE' as const };
      }

      // Insert — inside the same transaction so rate limit can't be raced
      await tx.insert(featureRequests).values({
        id,
        tenantId: ctx.tenantId,
        locationId: ctx.locationId ?? null,
        submittedBy: ctx.user.id,
        submittedByName: ctx.user.name ?? null,
        submittedByEmail: ctx.user.email ?? null,
        requestType: parsed.data.requestType,
        module: parsed.data.module,
        submodule: parsed.data.submodule ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        businessImpact: parsed.data.businessImpact ?? null,
        priority: parsed.data.priority,
        additionalNotes: parsed.data.additionalNotes ?? null,
        currentWorkaround: parsed.data.currentWorkaround ?? null,
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });

      return { error: null };
    });

    if (result.error === 'RATE_LIMITED') {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: `You can submit up to ${DAILY_LIMIT} requests per day. Please try again tomorrow.` } },
        { status: 429 },
      );
    }

    if (result.error === 'DUPLICATE') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'A similar request was submitted moments ago. Please wait before resubmitting.' } },
        { status: 409 },
      );
    }

    // Audit deferred — runs after the HTTP response is sent via next/server after()
    auditLogDeferred(
      ctx,
      'feature_request.created',
      'feature_request',
      id,
      undefined,
      {
        requestType: parsed.data.requestType,
        module: parsed.data.module,
        priority: parsed.data.priority,
        title: parsed.data.title,
      },
    );

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
