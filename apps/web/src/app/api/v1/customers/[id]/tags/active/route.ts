import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { tags, customerTags } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/{id}/tags/active → id is at parts.length - 3
  return parts[parts.length - 3]!;
}

// GET /api/v1/customers/:id/tags/active
// Lightweight POS-optimized endpoint — returns only display-relevant fields
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await (tx as any)
        .select({
          id: customerTags.id,
          tagId: customerTags.tagId,
          tagName: tags.name,
          tagColor: tags.color,
          tagIcon: tags.icon,
          tagType: tags.tagType,
          tagGroup: tags.tagGroup,
          priority: tags.priority,
          source: customerTags.source,
          expiresAt: customerTags.expiresAt,
        })
        .from(customerTags)
        .innerJoin(tags, eq(customerTags.tagId, tags.id))
        .where(
          and(
            eq(customerTags.tenantId, ctx.tenantId),
            eq(customerTags.customerId, customerId),
            isNull(customerTags.removedAt),
          ),
        );

      return rows.map((r: any) => ({
        id: r.id,
        tagId: r.tagId,
        tagName: r.tagName,
        tagColor: r.tagColor,
        tagIcon: r.tagIcon ?? null,
        tagType: r.tagType,
        tagGroup: r.tagGroup ?? null,
        priority: r.priority ?? 999,
        source: r.source,
        expiresAt: r.expiresAt ?? null,
      }));
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
