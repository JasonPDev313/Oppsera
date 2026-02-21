import { NextRequest } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getEvalFeed } from '@oppsera/module-semantic';
import type { EvalFeedFilters } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;

  const tenantId = searchParams.get('tenantId') || null;

  const filters: EvalFeedFilters = {
    status: (searchParams.get('status') as EvalFeedFilters['status']) ?? undefined,
    sortBy: (searchParams.get('sortBy') as EvalFeedFilters['sortBy']) ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
    minUserRating: searchParams.get('minUserRating') ? Number(searchParams.get('minUserRating')) : undefined,
    maxUserRating: searchParams.get('maxUserRating') ? Number(searchParams.get('maxUserRating')) : undefined,
    adminVerdict: searchParams.get('adminVerdict') ?? undefined,
    userRole: searchParams.get('userRole') ?? undefined,
    lensId: searchParams.get('lensId') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  };

  if (searchParams.get('start') && searchParams.get('end')) {
    filters.dateRange = { start: searchParams.get('start')!, end: searchParams.get('end')! };
  }

  if (searchParams.get('qualityFlags')) {
    filters.qualityFlags = searchParams.get('qualityFlags')!.split(',');
  }

  const result = await getEvalFeed(tenantId, filters);
  const { NextResponse } = await import('next/server');
  return NextResponse.json({ data: result });

});
