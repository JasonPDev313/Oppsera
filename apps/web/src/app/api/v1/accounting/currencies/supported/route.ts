import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanModifyAccounting } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import { withTenant } from '@oppsera/db';
import {
  getAccountingSettings,
  updateSupportedCurrencies,
  updateSupportedCurrenciesSchema,
} from '@oppsera/module-accounting';

// GET /api/v1/accounting/currencies/supported — list supported currencies
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const settings = await withTenant(ctx.tenantId, async (tx) => {
      return getAccountingSettings(tx, ctx.tenantId);
    });

    if (!settings) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Accounting not configured' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        baseCurrency: settings.baseCurrency ?? 'USD',
        supportedCurrencies: settings.supportedCurrencies ?? ['USD'],
      },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// PATCH /api/v1/accounting/currencies/supported — update supported currencies
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    assertImpersonationCanModifyAccounting(ctx);

    const body = await request.json();
    const parsed = updateSupportedCurrenciesSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateSupportedCurrencies(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
