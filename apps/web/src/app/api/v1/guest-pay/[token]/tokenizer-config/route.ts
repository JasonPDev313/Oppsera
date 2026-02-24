import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGuestPaySessionByToken } from '@oppsera/module-fnb';
import { getTokenizerConfig } from '@oppsera/module-payments';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

/**
 * GET /api/v1/guest-pay/:token/tokenizer-config
 *
 * Returns the CardPointe tokenizer config for the guest pay session's tenant/location.
 * Public endpoint (no auth) — validates session token instead.
 * Only returns non-sensitive data (site name, iframe URL).
 */
export const GET = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/guest-pay/{token}/tokenizer-config
    const token = segments[segments.length - 2]!;

    // Validate session token
    const session = await getGuestPaySessionByToken(token);
    if (!session) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } },
        { status: 404 },
      );
    }

    if (session.status !== 'active') {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_ACTIVE', message: 'Payment session is not active' } },
        { status: 409 },
      );
    }

    // Look up tenant/location from session
    const sessionRows = await db.execute(
      sql`SELECT tenant_id, location_id FROM guest_pay_sessions WHERE id = ${session.id}`,
    );
    const sessionRow = Array.from(sessionRows as Iterable<Record<string, unknown>>)[0];
    if (!sessionRow) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Session data not found' } },
        { status: 404 },
      );
    }

    const tenantId = sessionRow.tenant_id as string;
    const locationId = sessionRow.location_id as string;

    const config = await getTokenizerConfig(tenantId, locationId);

    if (!config) {
      return NextResponse.json(
        { error: { code: 'NO_TOKENIZER', message: 'Card payments are not configured for this location' } },
        { status: 404 },
      );
    }

    // Return the full client config — frontend decides what to render
    return NextResponse.json({ data: config });
  },
  { public: true },
);
