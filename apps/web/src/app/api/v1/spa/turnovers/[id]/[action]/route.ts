import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import {
  startTurnoverTask,
  completeTurnoverTask,
  skipTurnoverTask,
  updateTurnoverTask,
} from '@oppsera/module-spa';

function extractParams(url: string): { id: string; action: string } | null {
  const match = url.match(/\/turnovers\/([^/]+)\/([^/?]+)/);
  return match ? { id: match[1]!, action: match[2]! } : null;
}

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const extracted = extractParams(req.url);
    if (!extracted) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing turnover task ID or action' } },
        { status: 400 },
      );
    }
    const { id, action } = extracted;
    const body = await req.json().catch(() => ({}));

    switch (action) {
      case 'start':
        await startTurnoverTask(ctx, { taskId: id });
        return NextResponse.json({ data: { success: true } });
      case 'complete':
        await completeTurnoverTask(ctx, { taskId: id, notes: body.notes });
        return NextResponse.json({ data: { success: true } });
      case 'skip':
        await skipTurnoverTask(ctx, { taskId: id, reason: body.reason });
        return NextResponse.json({ data: { success: true } });
      case 'update':
        await updateTurnoverTask(ctx, { taskId: id, ...body });
        return NextResponse.json({ data: { success: true } });
      default:
        return NextResponse.json(
          { error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
          { status: 400 },
        );
    }
  },
  { entitlement: 'spa', permission: 'spa.manage', writeAccess: true },
);
