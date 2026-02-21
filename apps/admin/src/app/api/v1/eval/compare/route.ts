import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getComparativeAnalysis } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;
  const periodA = {
    start: searchParams.get('aStart') ?? '',
    end: searchParams.get('aEnd') ?? '',
  };
  const periodB = {
    start: searchParams.get('bStart') ?? '',
    end: searchParams.get('bEnd') ?? '',
  };

  if (!periodA.start || !periodA.end || !periodB.start || !periodB.end) {
    return NextResponse.json(
      { error: { message: 'aStart, aEnd, bStart, bEnd are required' } },
      { status: 400 },
    );
  }

  const data = await getComparativeAnalysis(tenantId, periodA, periodB);
  return NextResponse.json({ data });
});
