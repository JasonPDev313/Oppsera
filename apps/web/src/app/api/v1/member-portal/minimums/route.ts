import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, customers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

/**
 * Resolve the authenticated user's customer ID by matching email.
 * getMinimumProgress takes customerId directly (not membershipAccountId).
 */
async function resolveCustomerId(tenantId: string, userEmail: string): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await (tx as any)
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.email, userEmail)))
      .limit(1);
    const arr = Array.isArray(rows) ? rows : [];
    return arr.length > 0 ? String(arr[0].id) : null;
  });
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = await resolveCustomerId(ctx.tenantId, ctx.user.email);
    if (!customerId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No customer profile linked to this user' } },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const { getMinimumProgress } = await import('@oppsera/module-membership');
    const progress = await getMinimumProgress({
      tenantId: ctx.tenantId,
      customerId,
      periodStart: url.searchParams.get('periodStart') ?? undefined,
      periodEnd: url.searchParams.get('periodEnd') ?? undefined,
    });

    return NextResponse.json({ data: progress });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
