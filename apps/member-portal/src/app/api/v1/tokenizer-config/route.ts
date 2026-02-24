import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';

/**
 * GET /api/v1/tokenizer-config
 *
 * Returns the tokenizer configuration for the member's tenant.
 * Used by the member portal to render card entry + wallet buttons.
 */
export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  const { getTokenizerConfig } = await import('@oppsera/module-payments');
  const config = await getTokenizerConfig(session.tenantId);

  if (!config) {
    return NextResponse.json(
      { error: { code: 'NO_TOKENIZER', message: 'Card payments are not configured' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: config });
});
