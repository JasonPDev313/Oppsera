import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc, or } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAnnotations } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createAnnotationSchema = z.object({
  metricSlug: z.string().min(1).max(128).optional(),
  dimensionValue: z.string().max(256).optional(),
  annotationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  text: z.string().min(1).max(2000),
  annotationType: z.enum(['note', 'flag', 'milestone', 'alert']).default('note'),
  isShared: z.boolean().default(false),
});

// ── GET /api/v1/semantic/annotations ──────────────────────────────
// List annotations for the current tenant. Returns the user's own
// annotations plus shared annotations from other users.
// Supports:
//   ?metricSlug=net_sales  — filter by metric
//   ?limit=50&cursor=xxx   — cursor pagination

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const metricSlug = url.searchParams.get('metricSlug') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [
      eq(semanticAnnotations.tenantId, ctx.tenantId),
      // Show user's own annotations + shared annotations
      or(
        eq(semanticAnnotations.userId, ctx.user.id),
        eq(semanticAnnotations.isShared, true),
      ),
    ];

    if (metricSlug) {
      conditions.push(eq(semanticAnnotations.metricSlug, metricSlug));
    }
    if (cursor) {
      const { lt } = await import('drizzle-orm');
      conditions.push(lt(semanticAnnotations.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticAnnotations)
      .where(and(...conditions))
      .orderBy(desc(semanticAnnotations.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((a) => ({
        id: a.id,
        userId: a.userId,
        metricSlug: a.metricSlug ?? null,
        dimensionValue: a.dimensionValue ?? null,
        annotationDate: a.annotationDate ?? null,
        text: a.text,
        annotationType: a.annotationType,
        isShared: a.isShared,
        metadata: a.metadata ?? {},
        isOwn: a.userId === ctx.user.id,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/annotations ─────────────────────────────
// Create a new annotation on a data point.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createAnnotationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { metricSlug, dimensionValue, annotationDate, text, annotationType, isShared } = parsed.data;

    const [row] = await db
      .insert(semanticAnnotations)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        metricSlug: metricSlug ?? null,
        dimensionValue: dimensionValue ?? null,
        annotationDate,
        text,
        annotationType,
        isShared,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        userId: row!.userId,
        metricSlug: row!.metricSlug ?? null,
        dimensionValue: row!.dimensionValue ?? null,
        annotationDate: row!.annotationDate ?? null,
        text: row!.text,
        annotationType: row!.annotationType,
        isShared: row!.isShared,
        metadata: row!.metadata ?? {},
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
