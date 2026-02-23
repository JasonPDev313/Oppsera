import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getVendorAccounting,
  updateVendorAccounting,
  updateVendorAccountingSchema,
} from '@oppsera/module-ap';

// GET /api/v1/ap/vendors/:vendorId/accounting — get vendor accounting settings
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const vendorId = parts[parts.length - 2]!;
    const result = await getVendorAccounting({ tenantId: ctx.tenantId, vendorId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);

// PUT /api/v1/ap/vendors/:vendorId/accounting — update vendor accounting settings
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const vendorId = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = updateVendorAccountingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateVendorAccounting(ctx, vendorId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' , writeAccess: true },
);
