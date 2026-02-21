import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getEvalSession } from '@oppsera/module-semantic';

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing session id' } }, { status: 400 });

    const session = await getEvalSession(id);
    if (!session) return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });

    return NextResponse.json({ data: session });
  },
);
