import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRatePackage,
  updateRatePackage,
  deactivateRatePackage,
  updateRatePackageSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/rate-packages/[id] — get rate package detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const data = await getRatePackage(ctx.tenantId, id);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PACKAGES_VIEW },
);

// PATCH /api/v1/pms/rate-packages/[id] — update rate package
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const body = await request.json();
    const parsed = updateRatePackageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateRatePackage(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PACKAGES_MANAGE, writeAccess: true },
);

// DELETE /api/v1/pms/rate-packages/[id] — deactivate rate package
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const result = await deactivateRatePackage(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PACKAGES_MANAGE, writeAccess: true },
);
