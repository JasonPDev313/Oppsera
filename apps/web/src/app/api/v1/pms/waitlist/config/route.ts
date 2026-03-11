import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getWaitlistConfig,
  updateWaitlistConfig,
  updateWaitlistConfigSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'propertyId is required' } }, { status: 400 });
    }

    const config = await getWaitlistConfig({ tenantId: ctx.tenantId, propertyId });
    return NextResponse.json({ data: config });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.WAITLIST_VIEW },
);

export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = updateWaitlistConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateWaitlistConfig(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.WAITLIST_MANAGE, writeAccess: true },
);
