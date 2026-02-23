import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getFnbSettings,
  updateFnbSettings,
  getFnbSettingsSchema,
  updateFnbSettingsSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/settings/[moduleKey]
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const moduleKey = parts[parts.length - 1]!;
    const url = request.nextUrl;
    const parsed = getFnbSettingsSchema.safeParse({
      tenantId: ctx.tenantId,
      moduleKey,
      locationId: url.searchParams.get('locationId') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getFnbSettings(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);

// PATCH /api/v1/fnb/settings/[moduleKey]
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parts = request.nextUrl.pathname.split('/');
    const moduleKey = parts[parts.length - 1]!;
    const parsed = updateFnbSettingsSchema.safeParse({ ...body, moduleKey });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await updateFnbSettings(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' , writeAccess: true },
);
