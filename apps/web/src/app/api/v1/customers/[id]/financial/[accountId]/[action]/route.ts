import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  adjustLedger,
  adjustLedgerSchema,
  configureAutopay,
  configureAutopaySchema,
  updateCreditLimit,
  updateCreditLimitSchema,
  placeFinancialHold,
  placeFinancialHoldSchema,
  liftFinancialHold,
  liftFinancialHoldSchema,
} from '@oppsera/module-customers';

const POST_ACTIONS: Record<string, true> = { adjust: true, hold: true };
const PATCH_ACTIONS: Record<string, true> = { autopay: true, 'credit-limit': true };
const DELETE_ACTIONS: Record<string, true> = { hold: true };

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('financial');
  return parts[idx + 1]!;
}

function extractAction(request: NextRequest): string {
  return new URL(request.url).pathname.split('/').at(-1)!;
}

const middleware = { entitlement: 'customers' as const, permission: 'customers.financial.manage', writeAccess: true as const };

// POST /api/v1/customers/:id/financial/:accountId/adjust|hold
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!POST_ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const accountId = extractAccountId(request);
    const body = await request.json();

    switch (action) {
      case 'adjust': {
        const parsed = adjustLedgerSchema.safeParse({ ...body, billingAccountId: accountId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await adjustLedger(ctx, parsed.data);
        return NextResponse.json({ data: result }, { status: 201 });
      }
      case 'hold': {
        const parsed = placeFinancialHoldSchema.safeParse({ ...body, accountId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await placeFinancialHold(ctx, parsed.data);
        return NextResponse.json({ data: result }, { status: 201 });
      }
    }
  },
  middleware,
);

// PATCH /api/v1/customers/:id/financial/:accountId/autopay|credit-limit
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!PATCH_ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const accountId = extractAccountId(request);
    const body = await request.json();

    switch (action) {
      case 'autopay': {
        const parsed = configureAutopaySchema.safeParse({ ...body, accountId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await configureAutopay(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
      case 'credit-limit': {
        const parsed = updateCreditLimitSchema.safeParse({ ...body, accountId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await updateCreditLimit(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
    }
  },
  middleware,
);

// DELETE /api/v1/customers/:id/financial/:accountId/hold — lift financial hold
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!DELETE_ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const accountId = extractAccountId(request);
    const body = await request.json();

    const parsed = liftFinancialHoldSchema.safeParse({ ...body, accountId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await liftFinancialHold(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  middleware,
);
