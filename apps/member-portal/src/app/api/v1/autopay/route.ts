import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { withTenant, membershipMembers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getAutopayProfile, configureAutopayProfile, configureAutopayProfileSchema } from '@oppsera/module-membership';

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

  const profile = await getAutopayProfile({
    tenantId: session.tenantId,
    membershipAccountId: accountId,
  });

  return NextResponse.json({ data: profile });
});

export const PATCH = withPortalAuth(async (request: NextRequest, { session }) => {
  const accountId = await resolveAccountId(session.tenantId, session.customerId);
  if (!accountId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No active membership found' } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = configureAutopayProfileSchema.safeParse({
    ...body,
    membershipAccountId: accountId,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    );
  }

  // Build a minimal RequestContext for the command
  const ctx = {
    tenantId: session.tenantId,
    locationId: '',
    requestId: crypto.randomUUID(),
    user: { id: `customer:${session.customerId}`, email: session.email, role: 'member' as const },
  };

  const result = await configureAutopayProfile(ctx as any, parsed.data);
  return NextResponse.json({ data: result });
});
