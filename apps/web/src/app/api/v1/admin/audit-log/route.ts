import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuditLogger } from '@oppsera/core/audit';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'tenantId query parameter is required' } },
        { status: 400 },
      );
    }

    const entityType = url.searchParams.get('entityType') ?? undefined;
    const entityId = url.searchParams.get('entityId') ?? undefined;
    const actorUserId = url.searchParams.get('actorUserId') ?? undefined;
    const action = url.searchParams.get('action') ?? undefined;
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

    const logger = getAuditLogger();
    const result = await logger.query(tenantId, {
      entityType,
      entityId,
      actorUserId,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit,
    });

    return NextResponse.json({ data: result });
  },
);
