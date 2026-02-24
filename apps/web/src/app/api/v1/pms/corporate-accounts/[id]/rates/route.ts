import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  setCorporateRateOverrides,
  setCorporateRateOverridesSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// POST /api/v1/pms/corporate-accounts/[id]/rates — set corporate rate overrides
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: .../corporate-accounts/{id}/rates
    const accountId = segments[segments.length - 2]!;

    const body = await request.json();
    const parsed = setCorporateRateOverridesSchema.safeParse({
      corporateAccountId: accountId,
      overrides: body.overrides,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setCorporateRateOverrides(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CORPORATE_MANAGE, writeAccess: true },
);
