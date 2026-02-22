import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  cancelInitiationContract,
  cancelInitiationContractSchema,
} from '@oppsera/module-membership';

function extractContractId(url: string): string {
  const parts = url.split('/initiation/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const contractId = extractContractId(request.url);
    if (!contractId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Contract ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = cancelInitiationContractSchema.safeParse({
      ...body,
      contractId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await cancelInitiationContract(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' },
);
