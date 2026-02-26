import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listProviderCredentials,
  saveProviderCredentials,
  saveCredentialsSchema,
} from '@oppsera/module-payments';

function extractProviderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('payment-processors') + 1]!;
}

/**
 * GET /api/v1/settings/payment-processors/:providerId/credentials
 * List credential entries (WITHOUT decrypted values).
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request);
    const credentials = await listProviderCredentials(ctx.tenantId, providerId);
    return NextResponse.json({ data: credentials });
  },
  { entitlement: 'payments', permission: 'settings.view' },
);

/**
 * POST /api/v1/settings/payment-processors/:providerId/credentials
 * Save (encrypt and store) credentials.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request);
    const body = await request.json();
    const parsed = saveCredentialsSchema.safeParse({ ...body, providerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await saveProviderCredentials(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);
