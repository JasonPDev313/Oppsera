import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getProblematicPatterns } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;
  const minOccurrences = searchParams.get('minOccurrences')
    ? Number(searchParams.get('minOccurrences'))
    : undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;

  const patterns = await getProblematicPatterns(tenantId, { minOccurrences, limit });
  return NextResponse.json({ data: patterns });
});
