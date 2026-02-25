import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, customers, membershipMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getInitiationSummary } from '@oppsera/module-membership';

/**
 * Resolve the authenticated user's membership account ID.
 * Path: user email -> customer -> membership_members -> membership_account.
 */
async function resolveAccountId(tenantId: string, userEmail: string): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const custRows = await (tx as any)
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.email, userEmail)))
      .limit(1);
    const custArr = Array.isArray(custRows) ? custRows : [];
    if (custArr.length === 0) return null;
    const customerId = String(custArr[0].id);

    const memRows = await (tx as any)
      .select({ accountId: membershipMembers.membershipAccountId })
      .from(membershipMembers)
      .where(
        and(
          eq(membershipMembers.tenantId, tenantId),
          eq(membershipMembers.customerId, customerId),
          eq(membershipMembers.status, 'active'),
        ),
      )
      .limit(1);
    const memArr = Array.isArray(memRows) ? memRows : [];
    return memArr.length > 0 ? String(memArr[0].accountId) : null;
  });
}

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const accountId = await resolveAccountId(ctx.tenantId, ctx.user.email);
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No active membership found' } },
        { status: 404 },
      );
    }

    const summary = await getInitiationSummary({
      tenantId: ctx.tenantId,
      membershipAccountId: accountId,
    });

    return NextResponse.json({ data: summary });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
