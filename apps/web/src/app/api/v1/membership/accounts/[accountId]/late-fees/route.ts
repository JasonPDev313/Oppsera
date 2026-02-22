import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  applyLateFee,
  applyLateFeeSchema,
} from '@oppsera/module-membership';

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
    const parsed = applyLateFeeSchema.safeParse({
      ...body,
      membershipAccountId: accountId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await applyLateFee(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);
