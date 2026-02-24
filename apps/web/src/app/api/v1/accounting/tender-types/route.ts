import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { createTenantTenderType, createTenantTenderTypeSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/tender-types — create a custom tender type
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = createTenantTenderTypeSchema.parse(body);
    const result = await createTenantTenderType(ctx, input);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
