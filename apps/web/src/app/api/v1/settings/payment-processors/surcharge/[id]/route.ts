import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  deleteSurchargeSettings,
  deleteSurchargeSettingsSchema,
} from '@oppsera/module-payments';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

/**
 * DELETE /api/v1/settings/payment-processors/surcharge/[id]
 * Delete a surcharge settings row.
 */
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const parsed = deleteSurchargeSettingsSchema.safeParse({ id });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await deleteSurchargeSettings(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'settings.manage', writeAccess: true },
);
