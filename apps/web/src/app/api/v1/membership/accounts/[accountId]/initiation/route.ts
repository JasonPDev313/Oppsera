import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getInitiationSummary,
  createInitiationContract,
  createInitiationContractSchema,
} from '@oppsera/module-membership';

function extractAccountId(url: string): string {
  const parts = url.split('/accounts/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = extractAccountId(request.url);
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const contracts = await getInitiationSummary({
      tenantId: ctx.tenantId,
      membershipAccountId: accountId,
    });

    return NextResponse.json({ data: contracts });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = extractAccountId(request.url);
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Account ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = createInitiationContractSchema.safeParse({
      ...body,
      membershipAccountId: accountId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createInitiationContract(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
