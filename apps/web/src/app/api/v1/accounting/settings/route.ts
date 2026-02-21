import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { withTenant } from '@oppsera/db';
import {
  getAccountingSettings,
  updateAccountingSettings,
  updateAccountingSettingsSchema,
} from '@oppsera/module-accounting';

// GET /api/v1/accounting/settings — get accounting settings
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const settings = await withTenant(ctx.tenantId, async (tx) => {
      return getAccountingSettings(tx, ctx.tenantId);
    });

    return NextResponse.json({ data: settings });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// PATCH /api/v1/accounting/settings — update accounting settings
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateAccountingSettingsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const settings = await updateAccountingSettings(ctx, parsed.data);
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
