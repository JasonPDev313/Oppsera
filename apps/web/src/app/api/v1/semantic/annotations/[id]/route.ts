import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAnnotations } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateAnnotationSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  annotationType: z.enum(['note', 'flag', 'milestone', 'alert']).optional(),
  isShared: z.boolean().optional(),
});

// ── PATCH /api/v1/semantic/annotations/[id] ───────────────────────
// Update an annotation's text, type, or sharing status.
// Only the owner can update their annotation.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateAnnotationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.text !== undefined) updates.text = parsed.data.text;
    if (parsed.data.annotationType !== undefined) updates.annotationType = parsed.data.annotationType;
    if (parsed.data.isShared !== undefined) updates.isShared = parsed.data.isShared;

    const [row] = await db
      .update(semanticAnnotations)
      .set(updates)
      .where(
        and(
          eq(semanticAnnotations.id, id),
          eq(semanticAnnotations.tenantId, ctx.tenantId),
          eq(semanticAnnotations.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Annotation not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        userId: row.userId,
        metricSlug: row.metricSlug ?? null,
        dimensionValue: row.dimensionValue ?? null,
        annotationDate: row.annotationDate ?? null,
        text: row.text,
        annotationType: row.annotationType,
        isShared: row.isShared,
        metadata: row.metadata ?? {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);

// ── DELETE /api/v1/semantic/annotations/[id] ──────────────────────
// Delete an annotation. Only the owner can delete their annotation.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const [row] = await db
      .delete(semanticAnnotations)
      .where(
        and(
          eq(semanticAnnotations.id, id),
          eq(semanticAnnotations.tenantId, ctx.tenantId),
          eq(semanticAnnotations.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Annotation not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
