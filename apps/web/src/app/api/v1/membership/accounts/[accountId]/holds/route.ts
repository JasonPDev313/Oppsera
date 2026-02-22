import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { withTenant, membershipHolds } from '@oppsera/db';
import {
  setChargingHold,
  setChargingHoldSchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const holds = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await (tx as any)
        .select({
          id: membershipHolds.id,
          membershipAccountId: membershipHolds.membershipAccountId,
          holdType: membershipHolds.holdType,
          reason: membershipHolds.reason,
          placedBy: membershipHolds.placedBy,
          placedAt: membershipHolds.placedAt,
        })
        .from(membershipHolds)
        .where(
          and(
            eq(membershipHolds.tenantId, ctx.tenantId),
            eq(membershipHolds.membershipAccountId, accountId),
            eq(membershipHolds.isActive, true),
          ),
        );

      return (rows as any[]).map((r: any) => ({
        id: String(r.id),
        membershipAccountId: String(r.membershipAccountId),
        holdType: String(r.holdType),
        reason: String(r.reason),
        placedBy: String(r.placedBy),
        placedAt: r.placedAt instanceof Date
          ? r.placedAt.toISOString()
          : String(r.placedAt ?? ''),
      }));
    });

    return NextResponse.json({ data: holds });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = setChargingHoldSchema.safeParse({
      ...body,
      membershipAccountId: accountId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setChargingHold(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);
