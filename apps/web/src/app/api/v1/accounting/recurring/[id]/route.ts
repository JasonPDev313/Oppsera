import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRecurringTemplate,
  updateRecurringTemplate,
  deactivateRecurringTemplate,
  updateRecurringTemplateSchema,
} from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getRecurringTemplate(ctx.tenantId, id);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Recurring template not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateRecurringTemplateSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateRecurringTemplate(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await deactivateRecurringTemplate(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
