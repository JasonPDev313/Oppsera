import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, glUnmappedEvents } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';

const resolveBodySchema = z.object({
  resolutionMethod: z.enum(['manual', 'remapped']).optional().default('manual'),
}).strict();

function extractUnmappedEventId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/accounting/unmapped-events/:id/resolve → parts[-2] is the id
  return parts[parts.length - 2]!;
}

// PATCH /api/v1/accounting/unmapped-events/:id/resolve — resolve an unmapped event
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractUnmappedEventId(request);

    let body = {};
    try { body = await request.json(); } catch { /* empty body is valid */ }
    const parsed = resolveBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const [updated] = await tx
        .update(glUnmappedEvents)
        .set({
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          resolutionMethod: parsed.data.resolutionMethod,
        })
        .where(
          and(
            eq(glUnmappedEvents.id, id),
            eq(glUnmappedEvents.tenantId, ctx.tenantId),
            isNull(glUnmappedEvents.resolvedAt),
          ),
        )
        .returning({
          id: glUnmappedEvents.id,
          resolvedAt: glUnmappedEvents.resolvedAt,
          resolvedBy: glUnmappedEvents.resolvedBy,
        });

      return updated ?? null;
    });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unmapped event '${id}' not found or already resolved` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
