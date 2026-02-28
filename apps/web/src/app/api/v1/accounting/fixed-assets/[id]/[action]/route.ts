import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { recordDepreciation, disposeFixedAsset } from '@oppsera/module-accounting';

function extractIdAndAction(request: NextRequest): { id: string; action: string } {
  const segments = request.nextUrl.pathname.split('/');
  return { id: segments[segments.length - 2]!, action: segments[segments.length - 1]! };
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { id, action } = extractIdAndAction(request);

    switch (action) {
      case 'depreciate': {
        const body = await request.json();
        const { periodDate } = body;

        if (!periodDate) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'periodDate is required' } },
            { status: 400 },
          );
        }

        const result = await recordDepreciation(ctx, { assetId: id, periodDate });
        return NextResponse.json({ data: result });
      }

      case 'dispose': {
        const body = await request.json();
        const { disposalDate, disposalProceeds, disposalGlAccountId } = body;

        if (!disposalDate) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'disposalDate is required' } },
            { status: 400 },
          );
        }

        const result = await disposeFixedAsset(ctx, {
          assetId: id,
          disposalDate,
          disposalProceeds,
          disposalGlAccountId,
        });
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
          { status: 404 },
        );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
