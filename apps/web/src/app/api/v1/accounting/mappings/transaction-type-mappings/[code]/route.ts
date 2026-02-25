import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  saveTransactionTypeMapping,
  deleteTransactionTypeMapping,
  saveTransactionTypeMappingSchema,
  deleteTransactionTypeMappingSchema,
} from '@oppsera/module-accounting';

// PUT /api/v1/accounting/mappings/transaction-type-mappings/[code]
export const PUT = withMiddleware(
  async (request: NextRequest, ctx, { params }: { params: Promise<{ code: string }> }) => {
    const { code } = await params;
    const body = await request.json();
    const input = saveTransactionTypeMappingSchema.parse(body);
    const result = await saveTransactionTypeMapping(ctx, code, input);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);

// DELETE /api/v1/accounting/mappings/transaction-type-mappings/[code]
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx, { params }: { params: Promise<{ code: string }> }) => {
    const { code } = await params;
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId') || undefined;
    const input = deleteTransactionTypeMappingSchema.parse({ locationId });
    const result = await deleteTransactionTypeMapping(ctx, code, input);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
