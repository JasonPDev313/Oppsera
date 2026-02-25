import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanModifyAccounting } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import { lockAccountingPeriod, lockAccountingPeriodSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/settings/lock-period — lock an accounting period
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Impersonation safety: block period locking
    assertImpersonationCanModifyAccounting(ctx);

    const body = await request.json();
    const parsed = lockAccountingPeriodSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await lockAccountingPeriod(ctx, parsed.data.period);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
