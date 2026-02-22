import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  executeRecurringTemplate,
  executeRecurringTemplateSchema,
} from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  // /api/v1/accounting/recurring/{id}/execute
  return parts[parts.length - 2]!;
}

// POST /api/v1/accounting/recurring/:id/execute — run a template now
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json().catch(() => ({}));
    const parsed = executeRecurringTemplateSchema.safeParse({ ...body, templateId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await executeRecurringTemplate(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
