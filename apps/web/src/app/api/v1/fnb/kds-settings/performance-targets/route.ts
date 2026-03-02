import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listPerformanceTargets,
  upsertPerformanceTarget,
  upsertPerformanceTargetSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/performance-targets — list performance targets
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const targets = await listPerformanceTargets({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      stationId: url.searchParams.get('stationId') ?? undefined,
    });
    return NextResponse.json({ data: targets });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/kds-settings/performance-targets — upsert performance target
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }

    const parsed = upsertPerformanceTargetSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const target = await upsertPerformanceTarget(ctx, parsed.data);
    return NextResponse.json({ data: target }, { status: 200 });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);
