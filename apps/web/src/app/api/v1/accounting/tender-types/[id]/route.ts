import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  updateTenantTenderType,
  deactivateTenderType,
  updateTenantTenderTypeSchema,
} from '@oppsera/module-accounting';

// PATCH /api/v1/accounting/tender-types/[id] — update a custom tender type
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/tender-types/')[1]?.split('?')[0] ?? '';
    const body = await request.json();
    const input = updateTenantTenderTypeSchema.parse(body);
    const result = await updateTenantTenderType(ctx, id, input);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);

// DELETE /api/v1/accounting/tender-types/[id] — deactivate a custom tender type
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/tender-types/')[1]?.split('?')[0] ?? '';
    const result = await deactivateTenderType(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
