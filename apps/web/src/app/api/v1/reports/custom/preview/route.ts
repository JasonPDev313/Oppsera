import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { previewReport } from '@oppsera/module-reporting';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    if (!body.dataset || !body.definition) {
      throw new AppError('VALIDATION_ERROR', 'dataset and definition are required', 400);
    }

    const result = await previewReport({
      tenantId: ctx.tenantId,
      dataset: body.dataset,
      definition: body.definition,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'reporting', permission: 'reports.custom.view' },
);
