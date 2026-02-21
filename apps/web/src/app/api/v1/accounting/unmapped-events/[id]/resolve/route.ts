import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, sql } from '@oppsera/db';

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

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        UPDATE gl_unmapped_events
        SET resolved_at = NOW(),
            resolved_by = ${ctx.user.id}
        WHERE id = ${id}
          AND tenant_id = ${ctx.tenantId}
          AND resolved_at IS NULL
        RETURNING id, resolved_at, resolved_by
      `);

      const updated = Array.from(rows as Iterable<Record<string, unknown>>);
      if (updated.length === 0) {
        return null;
      }

      return {
        id: String(updated[0]!.id),
        resolvedAt: String(updated[0]!.resolved_at),
        resolvedBy: String(updated[0]!.resolved_by),
      };
    });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unmapped event '${id}' not found or already resolved` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
