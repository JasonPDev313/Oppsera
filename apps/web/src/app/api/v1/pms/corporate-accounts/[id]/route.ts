import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCorporateAccount,
  updateCorporateAccount,
  updateCorporateAccountSchema,
  deactivateCorporateAccount,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/corporate-accounts/[id] — get corporate account detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const data = await getCorporateAccount(ctx.tenantId, id);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CORPORATE_VIEW },
);

// PATCH /api/v1/pms/corporate-accounts/[id] — update corporate account
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const body = await request.json();
    const parsed = updateCorporateAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateCorporateAccount(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CORPORATE_MANAGE, writeAccess: true },
);

// DELETE /api/v1/pms/corporate-accounts/[id] — deactivate corporate account
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const result = await deactivateCorporateAccount(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CORPORATE_MANAGE, writeAccess: true },
);
