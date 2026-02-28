import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateReceiptSettingsSchema } from '@oppsera/shared';
import { getReceiptSettings, saveReceiptSettings } from '@oppsera/core/settings/receipt-settings';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId') ?? undefined;
    const data = await getReceiptSettings(ctx.tenantId, locationId);
    return NextResponse.json({ data });
  },
  { entitlement: 'orders', permission: 'settings.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { locationId, ...rest } = body;

    const parsed = updateReceiptSettingsSchema.safeParse(rest);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await saveReceiptSettings(ctx, {
      locationId: locationId ?? null,
      settings: parsed.data,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'orders', permission: 'settings.update', writeAccess: true },
);
