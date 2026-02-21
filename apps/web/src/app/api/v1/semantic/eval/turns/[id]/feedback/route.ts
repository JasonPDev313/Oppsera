import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { submitUserRating, userFeedbackSchema } from '@oppsera/module-semantic/evaluation';

// POST /api/v1/semantic/eval/turns/[id]/feedback
// Submit user feedback (rating, thumbs up, tags) for a single eval turn.
// Users can only rate their OWN turns (enforced in submitUserRating).

export const POST = withMiddleware(
  async (request, ctx, { params }: { params: Promise<{ id: string }> }) => {
    const { id: evalTurnId } = await params;

    const body = await request.json();
    const parsed = userFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    if (
      parsed.data.rating === undefined &&
      parsed.data.thumbsUp === undefined &&
      parsed.data.tags === undefined &&
      parsed.data.text === undefined
    ) {
      throw new ValidationError('Validation failed', [
        { field: 'body', message: 'At least one feedback field (rating, thumbsUp, tags, or text) is required' },
      ]);
    }

    await submitUserRating(evalTurnId, ctx.tenantId, ctx.user.id, {
      rating: parsed.data.rating,
      thumbsUp: parsed.data.thumbsUp,
      text: parsed.data.text,
      tags: parsed.data.tags as string[] | undefined,
    });

    return NextResponse.json({ data: { success: true } });
  },
  { permission: 'semantic.query', entitlement: 'semantic' },
);
