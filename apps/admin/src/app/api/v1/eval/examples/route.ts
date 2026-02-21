import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getGoldenExamples } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const difficulty = searchParams.get('difficulty') ?? undefined;

  const examples = await getGoldenExamples(
    tenantId,
    category as Parameters<typeof getGoldenExamples>[1],
    difficulty as Parameters<typeof getGoldenExamples>[2],
  );

  return NextResponse.json({ data: examples });
});
