import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateMerchantAccountAch,
  updateMerchantAccountAchSchema,
} from '@oppsera/module-payments';

// PATCH /api/v1/settings/payment-processors/:id/ach
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const ppIdx = parts.indexOf('payment-processors');
    const merchantAccountId = parts[ppIdx + 1]!;

    const body = await request.json();
    const parsed = updateMerchantAccountAchSchema.safeParse({
      ...body,
      merchantAccountId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateMerchantAccountAch(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.settings.manage', writeAccess: true },
);
