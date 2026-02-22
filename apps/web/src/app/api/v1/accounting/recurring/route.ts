import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listRecurringTemplates,
  createRecurringTemplate,
  createRecurringTemplateSchema,
} from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listRecurringTemplates({
      tenantId: ctx.tenantId,
      isActive: url.searchParams.has('isActive')
        ? url.searchParams.get('isActive') === 'true'
        : undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createRecurringTemplateSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createRecurringTemplate(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
