import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createProviderTimeOff,
  createProviderTimeOffSchema,
} from '@oppsera/module-spa';

function extractProviderId(url: string): string | null {
  return url.split('/providers/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// POST /api/v1/spa/providers/[id]/time-off — add time-off for provider
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request.url);
    if (!providerId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = createProviderTimeOffSchema.safeParse({
      ...body,
      providerId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const timeOff = await createProviderTimeOff(ctx, parsed.data);
    return NextResponse.json({ data: timeOff }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.providers.manage', writeAccess: true },
);
