import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProviderPerformance } from '@oppsera/module-spa';

function extractId(url: string): string | null {
  return url.split('/providers/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// GET /api/v1/spa/providers/[id]/performance — provider performance metrics
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractId(request.url);
    if (!providerId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const params = request.nextUrl.searchParams;
    const startDate = params.get('startDate') ?? undefined;
    const endDate = params.get('endDate') ?? undefined;

    const result = await getProviderPerformance({
      tenantId: ctx.tenantId,
      providerId,
      startDate,
      endDate,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'spa', permission: 'spa.providers.view' },
);
