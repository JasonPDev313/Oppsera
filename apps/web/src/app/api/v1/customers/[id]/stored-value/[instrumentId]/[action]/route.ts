import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  redeemStoredValue,
  redeemStoredValueSchema,
  reloadStoredValue,
  reloadStoredValueSchema,
  voidStoredValue,
  voidStoredValueSchema,
} from '@oppsera/module-customers';

const ACTIONS: Record<string, true> = { redeem: true, reload: true, void: true };

function extractInstrumentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const svIdx = parts.indexOf('stored-value');
  return parts[svIdx + 1]!;
}

function extractAction(request: NextRequest): string {
  return new URL(request.url).pathname.split('/').at(-1)!;
}

// POST /api/v1/customers/:id/stored-value/:instrumentId/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const instrumentId = extractInstrumentId(request);
    const body = await request.json();

    switch (action) {
      case 'redeem': {
        const parsed = redeemStoredValueSchema.safeParse({ ...body, instrumentId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await redeemStoredValue(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
      case 'reload': {
        const parsed = reloadStoredValueSchema.safeParse({ ...body, instrumentId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await reloadStoredValue(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
      case 'void': {
        const parsed = voidStoredValueSchema.safeParse({ ...body, instrumentId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await voidStoredValue(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'customers', permission: 'customers.stored_value.manage', writeAccess: true },
);
