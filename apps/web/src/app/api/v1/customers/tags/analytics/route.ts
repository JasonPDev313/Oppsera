import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getTagPopulationTrends,
  getTagOverlapMatrix,
  getTagEffectiveness,
  getTagHealth,
} from '@oppsera/module-customers';

// GET /api/v1/customers/tags/analytics?metric=health|trends|overlap|effectiveness
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get('metric') ?? 'health';

    switch (metric) {
      case 'health': {
        const result = await getTagHealth(ctx.tenantId);
        return NextResponse.json({ data: result });
      }

      case 'trends': {
        const tagIds = searchParams.get('tagIds')?.split(',').filter(Boolean) ?? undefined;
        const days = searchParams.has('days') ? Number(searchParams.get('days')) : undefined;
        const result = await getTagPopulationTrends({
          tenantId: ctx.tenantId,
          tagIds,
          days,
        });
        return NextResponse.json({ data: result });
      }

      case 'overlap': {
        const result = await getTagOverlapMatrix(ctx.tenantId);
        return NextResponse.json({ data: result });
      }

      case 'effectiveness': {
        const tagId = searchParams.get('tagId');
        if (!tagId) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'tagId is required for effectiveness metric' } },
            { status: 400 },
          );
        }
        const result = await getTagEffectiveness({
          tenantId: ctx.tenantId,
          tagId,
        });
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: `Unknown metric: ${metric}. Valid: health, trends, overlap, effectiveness` } },
          { status: 400 },
        );
    }
  },
  { entitlement: 'customers', permission: 'customers.tags.view' },
);
