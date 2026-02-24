import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db, sql } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  completePreCheckin,
  completePreCheckinSchema,
} from '@oppsera/module-pms';

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // .../guest-portal/[token]/pre-checkin -> token is segments[length-2]
  const token = segments[segments.length - 2]!;

  const body = await request.json();
  const parsed = completePreCheckinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    );
  }

  // Resolve tenantId from token (cross-tenant lookup via unique index)
  const rows = await db.execute(
    sql`SELECT tenant_id, status, expires_at FROM pms_guest_portal_sessions WHERE token = ${token} LIMIT 1`,
  );
  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  if (items.length === 0) {
    return NextResponse.json(
      { error: { code: 'SESSION_NOT_FOUND', message: 'Invalid or expired portal session' } },
      { status: 404 },
    );
  }

  const session = items[0]!;
  if (session.status !== 'active') {
    return NextResponse.json(
      { error: { code: 'SESSION_INACTIVE', message: `Session is ${session.status}` } },
      { status: 410 },
    );
  }
  if (new Date() > (session.expires_at as Date)) {
    return NextResponse.json(
      { error: { code: 'SESSION_EXPIRED', message: 'Guest portal session has expired' } },
      { status: 410 },
    );
  }

  const tenantId = session.tenant_id as string;

  // Build synthetic RequestContext for public portal access
  const ctx = {
    tenantId,
    requestId: crypto.randomUUID(),
    isPlatformAdmin: false,
    user: { id: `guest-portal:${token}`, email: '', role: 'guest' },
  } as unknown as RequestContext;

  try {
    const result = await completePreCheckin(ctx, token, parsed.data);
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'PRE_CHECKIN_FAILED', message: error.message ?? 'Pre-check-in failed' } },
      { status },
    );
  }
}
