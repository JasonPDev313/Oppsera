import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listCleaningTypes,
  createCleaningType,
  createCleaningTypeSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) {
      throw new ValidationError('propertyId is required', [{ field: 'propertyId', message: 'Required' }]);
    }
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const data = await listCleaningTypes(ctx.tenantId, propertyId, includeInactive);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_VIEW },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = createCleaningTypeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }

    const result = await createCleaningType(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_MANAGE, writeAccess: true },
);
