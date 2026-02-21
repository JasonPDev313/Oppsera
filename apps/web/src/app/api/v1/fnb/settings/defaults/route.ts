import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getFnbSettingsDefaults, getFnbSettingsDefaultsSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/settings/defaults
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const parsed = getFnbSettingsDefaultsSchema.safeParse({ tenantId: ctx.tenantId });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getFnbSettingsDefaults(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);
