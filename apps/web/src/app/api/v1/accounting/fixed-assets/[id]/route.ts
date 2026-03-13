import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getFixedAsset, updateFixedAsset, updateFixedAssetSchema } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/');
  return segments[segments.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const asset = await getFixedAsset({ tenantId: ctx.tenantId, assetId: id });

    if (!asset) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Fixed asset not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: asset });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = updateFixedAssetSchema.omit({ assetId: true }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }
    const updated = await updateFixedAsset(ctx, { assetId: id, ...parsed.data });
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
