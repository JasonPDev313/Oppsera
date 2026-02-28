import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listFixedAssets, createFixedAsset } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listFixedAssets({
      tenantId: ctx.tenantId,
      status: url.searchParams.get('status') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const {
      assetNumber,
      name,
      description,
      category,
      acquisitionDate,
      acquisitionCost,
      salvageValue,
      usefulLifeMonths,
      depreciationMethod,
      locationId,
      assetGlAccountId,
      depreciationExpenseAccountId,
      accumulatedDepreciationAccountId,
      notes,
      metadata,
    } = body;

    if (!name || !acquisitionDate || !acquisitionCost || !usefulLifeMonths || !depreciationMethod) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'name, acquisitionDate, acquisitionCost, usefulLifeMonths, and depreciationMethod are required' } },
        { status: 400 },
      );
    }

    const asset = await createFixedAsset(ctx, {
      assetNumber,
      name,
      description,
      category,
      acquisitionDate,
      acquisitionCost,
      salvageValue,
      usefulLifeMonths,
      depreciationMethod,
      locationId,
      assetGlAccountId,
      depreciationExpenseAccountId,
      accumulatedDepreciationAccountId,
      notes,
      metadata,
    });
    return NextResponse.json({ data: asset }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
