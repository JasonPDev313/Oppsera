import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { withTenant, membershipMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

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

export const GET = withPortalAuth(async (request: NextRequest, { session }) => {
  const accountId = await resolveAccountId(session.tenantId, session.customerId);
  if (!accountId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No active membership found' } },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const { listStatements } = await import('@oppsera/module-membership');
  const result = await listStatements({
    tenantId: session.tenantId,
    membershipAccountId: accountId,
    status: url.searchParams.get('status') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
    limit: url.searchParams.has('limit')
      ? parseInt(url.searchParams.get('limit')!, 10)
      : undefined,
  });

  return NextResponse.json({
    data: result.items,
    meta: { cursor: result.cursor, hasMore: result.hasMore },
  });
});
