import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { submitFeedback, SubmitFeedbackSchema } from '@oppsera/module-ai-support';

// POST /api/v1/ai-support/feedback — submit thumbs-up/down feedback on a message
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }

    const parsed = SubmitFeedbackSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await submitFeedback(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat', writeAccess: true },
);
