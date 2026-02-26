import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  hostSettingsSchema,
  getDefaultHostSettings,
  mergeHostSettings,
  getFnbSettings,
  updateFnbSettings,
} from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || undefined;

    const result = await getFnbSettings({
      tenantId: ctx.tenantId,
      moduleKey: 'fnb_host',
      locationId,
    });

    const stored = result?.settings as Record<string, unknown> | undefined;
    if (!stored || Object.keys(stored).length === 0) {
      return NextResponse.json({ data: getDefaultHostSettings() });
    }

    const merged = hostSettingsSchema.parse(stored);
    return NextResponse.json({ data: merged });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);

export const PATCH = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || undefined;

    const existing = await getFnbSettings({
      tenantId: ctx.tenantId,
      moduleKey: 'fnb_host',
      locationId,
    });

    const current = existing?.settings && Object.keys(existing.settings).length > 0
      ? hostSettingsSchema.parse(existing.settings)
      : getDefaultHostSettings();

    // Validate the partial update against the schema (strip unknown keys)
    const partialParsed = hostSettingsSchema.partial().safeParse(body);
    if (!partialParsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid settings', details: partialParsed.error.issues } },
        { status: 400 },
      );
    }

    const merged = mergeHostSettings(current, partialParsed.data);

    await updateFnbSettings(ctx, {
      moduleKey: 'fnb_host',
      locationId,
      settings: merged as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ data: merged });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.settings.manage',
    writeAccess: true,
  },
);
