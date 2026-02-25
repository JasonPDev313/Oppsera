import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, customers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getMemberPortalAccount } from '@oppsera/module-membership';

/**
 * Resolve the authenticated user's customer ID by matching email.
 * The customers table has no userId column; email is the link.
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
  async (_request: NextRequest, ctx) => {
    const customerId = await resolveCustomerId(ctx.tenantId, ctx.user.email);
    if (!customerId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No customer profile linked to this user' } },
        { status: 404 },
      );
    }

    const account = await getMemberPortalAccount({ tenantId: ctx.tenantId, customerId });
    if (!account) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No active membership found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: account });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
