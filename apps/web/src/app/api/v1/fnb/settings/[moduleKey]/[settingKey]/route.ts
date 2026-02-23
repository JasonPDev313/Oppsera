import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getFnbSetting,
  updateFnbSetting,
  getFnbSettingSchema,
  updateFnbSettingSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/settings/[moduleKey]/[settingKey]
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const settingKey = parts[parts.length - 1]!;
    const moduleKey = parts[parts.length - 2]!;
    const url = request.nextUrl;
    const parsed = getFnbSettingSchema.safeParse({
      tenantId: ctx.tenantId,
      moduleKey,
      settingKey,
      locationId: url.searchParams.get('locationId') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getFnbSetting(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);

// PATCH /api/v1/fnb/settings/[moduleKey]/[settingKey]
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parts = request.nextUrl.pathname.split('/');
    const settingKey = parts[parts.length - 1]!;
    const moduleKey = parts[parts.length - 2]!;
    const parsed = updateFnbSettingSchema.safeParse({ ...body, moduleKey, settingKey });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await updateFnbSetting(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' , writeAccess: true },
);
