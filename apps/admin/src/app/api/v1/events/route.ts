import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import {
  listDeadLetters,
  getDeadLetterStats,
  retryDeadLetter,
  resolveDeadLetter,
  discardDeadLetter,
  getEventBus,
} from '@oppsera/core';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const view = sp.get('view');

  if (view === 'stats') {
    const stats = await getDeadLetterStats();
    return NextResponse.json({ data: stats });
  }

  const result = await listDeadLetters({
    status: sp.get('status') ?? undefined,
    eventType: sp.get('eventType') ?? undefined,
    consumerName: sp.get('consumerName') ?? undefined,
    tenantId: sp.get('tenantId') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
    limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
  });

  return NextResponse.json({
    data: result.items,
    meta: { cursor: result.cursor, hasMore: result.hasMore },
  });
});

export const POST = withAdminAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const { action, id, notes } = body;

  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id is required' } },
      { status: 400 },
    );
  }

  switch (action) {
    case 'retry': {
      const eventBus = getEventBus();
      const result = await retryDeadLetter(id, eventBus);
      if (!result.success) {
        return NextResponse.json(
          { error: { code: 'RETRY_FAILED', message: result.error } },
          { status: 422 },
        );
      }
      return NextResponse.json({ data: { success: true } });
    }

    case 'resolve': {
      const ok = await resolveDeadLetter(id, `admin:${session.adminId}`, notes);
      if (!ok) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Dead letter not found or not in failed status' } },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: { success: true } });
    }

    case 'discard': {
      const ok = await discardDeadLetter(id, `admin:${session.adminId}`, notes);
      if (!ok) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Dead letter not found or not in failed status' } },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: { success: true } });
    }

    default:
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `Unknown action: ${action}` } },
        { status: 400 },
      );
  }
}, 'admin');
