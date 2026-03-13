import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listFixedAssets, createFixedAsset, createFixedAssetSchema } from '@oppsera/module-accounting';

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
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = createFixedAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const asset = await createFixedAsset(ctx, parsed.data);
    return NextResponse.json({ data: asset }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
