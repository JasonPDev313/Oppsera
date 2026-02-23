import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getEvalTurnDetail } from '@oppsera/module-semantic';

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing turn id' } }, { status: 400 });

    const turn = await getEvalTurnDetail(id);
    if (!turn) return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });

    return NextResponse.json({ data: turn });
  },
);
