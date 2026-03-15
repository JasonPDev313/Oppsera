import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  CreateEscalationSchema,
  createEscalation,
} from '@oppsera/module-ai-support';

// POST /api/v1/ai-support/escalations — create a human agent handoff escalation
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try {
      body = await request.json();
    } catch {
      /* empty body → validation will reject */
    }

    const parsed = CreateEscalationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const escalation = await createEscalation(ctx, parsed.data);
    return NextResponse.json({ data: escalation }, { status: 201 });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat', writeAccess: true },
);
