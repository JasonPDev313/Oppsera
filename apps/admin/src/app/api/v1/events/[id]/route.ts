import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getDeadLetter } from '@oppsera/core';

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id is required' } },
      { status: 400 },
    );
  }

  const entry = await getDeadLetter(id);
  if (!entry) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Dead letter not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: entry });
});
