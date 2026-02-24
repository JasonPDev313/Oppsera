import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  authorizeDepositSchema,
  authorizeDeposit,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const POST = withMiddleware(
  async (req, ctx) => {
    const body = await req.json();
    const parsed = authorizeDepositSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }
    const result = await authorizeDeposit(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_CHARGE, writeAccess: true },
);
