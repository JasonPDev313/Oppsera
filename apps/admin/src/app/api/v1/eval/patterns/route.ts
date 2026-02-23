import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getProblematicPatterns } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start = searchParams.get('start') ?? thirtyDaysAgo.toISOString();
  const end = searchParams.get('end') ?? now.toISOString();

  const patterns = await getProblematicPatterns(tenantId, { start, end });
  return NextResponse.json({ data: patterns });
});
