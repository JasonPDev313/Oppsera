import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  heartbeatKdsTerminal,
  heartbeatKdsTerminalSchema,
  listKdsTerminalHeartbeats,
} from '@oppsera/module-fnb';

// POST /api/v1/fnb/kds-settings/heartbeat — upsert terminal heartbeat
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = heartbeatKdsTerminalSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await heartbeatKdsTerminal(
      ctx.tenantId,
      ctx.locationId!,
      parsed.data,
    );
    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.view', writeAccess: true },
);

// GET /api/v1/fnb/kds-settings/heartbeat — list all terminal statuses
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const terminals = await listKdsTerminalHeartbeats(ctx.tenantId, ctx.locationId!);
    return NextResponse.json({ data: terminals });
  },
  { entitlement: 'kds', permission: 'kds.manage' },
);
