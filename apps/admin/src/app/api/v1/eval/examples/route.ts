import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getGoldenExamples } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;
  const category = searchParams.get('category') ?? undefined;
  const difficulty = searchParams.get('difficulty') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
  const cursor = searchParams.get('cursor') ?? undefined;

  const examples = await getGoldenExamples(tenantId, {
    category: category as never,
    difficulty: difficulty as never,
    tag,
    limit,
    cursor,
  });

  return NextResponse.json({ data: examples });
});
