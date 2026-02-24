import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listDeviceAssignments,
  assignDevice,
  assignDeviceSchema,
} from '@oppsera/module-payments';

/**
 * GET /api/v1/settings/payment-processors/devices
 * List all device assignments for the tenant.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId') ?? undefined;
    const devices = await listDeviceAssignments(ctx.tenantId, providerId);
    return NextResponse.json({ data: devices });
  },
  { entitlement: 'payments', permission: 'settings.view' },
);

/**
 * POST /api/v1/settings/payment-processors/devices
 * Assign a physical payment device (HSN) to a POS terminal.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = assignDeviceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await assignDevice(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'settings.manage', writeAccess: true },
);
