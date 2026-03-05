import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  saveTransactionTypeMapping,
  deleteTransactionTypeMapping,
  saveTransactionTypeMappingSchema,
  deleteTransactionTypeMappingSchema,
} from '@oppsera/module-accounting';

function extractCode(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// PUT /api/v1/accounting/mappings/transaction-type-mappings/[code]
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const code = extractCode(request);
    const body = await request.json();
    const parsed = saveTransactionTypeMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }
    const result = await saveTransactionTypeMapping(ctx, code, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);

// DELETE /api/v1/accounting/mappings/transaction-type-mappings/[code]
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const code = extractCode(request);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId') || undefined;
    const input = deleteTransactionTypeMappingSchema.parse({ locationId });
    const result = await deleteTransactionTypeMapping(ctx, code, input);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
