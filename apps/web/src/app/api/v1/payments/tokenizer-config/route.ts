import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTokenizerConfig } from '@oppsera/module-payments';

/**
 * GET /api/v1/payments/tokenizer-config?locationId=xxx
 *
 * Returns the CardPointe iFrame Tokenizer URL and site name for the tenant.
 * Only non-sensitive data is returned (no credentials).
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') ?? ctx.locationId ?? undefined;

    const config = await getTokenizerConfig(ctx.tenantId, locationId);

    if (!config) {
      return NextResponse.json(
        { error: { code: 'NO_TOKENIZER', message: 'No card payment tokenizer configured' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: config });
  },
  { entitlement: 'payments', permission: 'tenders.view' },
);
