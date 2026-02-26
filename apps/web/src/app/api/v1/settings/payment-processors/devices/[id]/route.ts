import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateDeviceAssignment,
  removeDeviceAssignment,
  updateDeviceAssignmentSchema,
} from '@oppsera/module-payments';

/**
 * PATCH /api/v1/settings/payment-processors/devices/[id]
 * Update a device assignment (HSN, model, label, active status).
 */
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/devices/')[1]?.split('?')[0] ?? '';
    const body = await request.json();
    const parsed = updateDeviceAssignmentSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateDeviceAssignment(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);

/**
 * DELETE /api/v1/settings/payment-processors/devices/[id]
 * Remove (deactivate) a device assignment.
 */
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/devices/')[1]?.split('?')[0] ?? '';
    const result = await removeDeviceAssignment(ctx, { id });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);
