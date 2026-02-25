import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { withTenant, membershipMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getInitiationSummary } from '@oppsera/module-membership';

async function resolveAccountId(tenantId: string, customerId: string): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await (tx as any)
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
    const arr = Array.isArray(rows) ? rows : [];
    return arr.length > 0 ? String(arr[0].accountId) : null;
  });
}

export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  const accountId = await resolveAccountId(session.tenantId, session.customerId);
  if (!accountId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No active membership found' } },
      { status: 404 },
    );
  }

  const summary = await getInitiationSummary({
    tenantId: session.tenantId,
    membershipAccountId: accountId,
  });

  return NextResponse.json({ data: summary });
});
