import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCloseOrchestratorRun } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const runId = extractId(request);
    const run = await getCloseOrchestratorRun(ctx.tenantId, runId);

    if (!run) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Close orchestrator run not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: run });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
