import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createGlClassification, createGlClassificationSchema, listGlClassifications } from '@oppsera/module-accounting';

// GET /api/v1/accounting/classifications — list classifications
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await listGlClassifications({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/classifications — create classification
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createGlClassificationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const classification = await createGlClassification(ctx, parsed.data);
    return NextResponse.json({ data: classification }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
