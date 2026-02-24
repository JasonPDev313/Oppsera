import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  createCancellationPolicySchema,
  createCancellationPolicy,
  listCancellationPolicies,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      throw new ValidationError('propertyId is required', [{ field: 'propertyId', message: 'required' }]);
    }
    const data = await listCancellationPolicies(ctx.tenantId, propertyId);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_VIEW },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createCancellationPolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }
    const result = await createCancellationPolicy(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.POLICIES_MANAGE, writeAccess: true },
);
