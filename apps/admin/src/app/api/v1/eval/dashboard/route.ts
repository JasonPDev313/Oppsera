import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getQualityDashboard } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;
  const start = searchParams.get('start') ?? undefined;
  const end = searchParams.get('end') ?? undefined;

  const data = await getQualityDashboard(tenantId, { start, end });
  return NextResponse.json({ data });
});
