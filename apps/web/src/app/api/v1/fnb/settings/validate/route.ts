import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { validateFnbSettings, validateFnbSettingsSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/settings/validate — validate settings without saving
export const POST = withMiddleware(
  async (request: NextRequest, _ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = validateFnbSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await validateFnbSettings(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' , writeAccess: true },
);
