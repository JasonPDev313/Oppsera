import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getModifierLocationHeatmap } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const rows = await getModifierLocationHeatmap({
      tenantId: ctx.tenantId,
      dateFrom,
      dateTo,
      modifierGroupId: url.searchParams.get('modifierGroupId') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'reporting', permission: 'reports.view', cache: 'private, max-age=60, stale-while-revalidate=120' },
);
