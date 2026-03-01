import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getProviderEligibility,
  setProviderEligibility,
  setProviderServiceEligibilitySchema,
} from '@oppsera/module-spa';

function extractId(url: string): string | null {
  return url.split('/providers/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// GET /api/v1/spa/providers/[id]/eligibility — get provider's eligible services
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const eligibility = await getProviderEligibility(ctx.tenantId, id);
    return NextResponse.json({ data: eligibility });
  },
  { entitlement: 'spa', permission: 'spa.providers.view' },
);

// POST /api/v1/spa/providers/[id]/eligibility — set provider eligibility (bulk set eligible services)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = setProviderServiceEligibilitySchema.safeParse({ ...body, providerId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setProviderEligibility(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.providers.manage', writeAccess: true },
);
