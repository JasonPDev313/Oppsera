import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { fireCourse, fireCourseSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/:id/course/fire — fire a course
//
// When firing an unsent course, this also creates kitchen tickets atomically.
// If dispatch fails, the course stays unsent and a 422 is returned.
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 3]!;
    const body = await request.json();
    const parsed = fireCourseSchema.safeParse({ ...body, tabId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    try {
      const { course, dispatch } = await fireCourse(ctx, parsed.data);

      broadcastFnb(ctx, 'kds', 'tabs').catch(() => {});

      return NextResponse.json({
        data: course,
        ...(dispatch ? {
          kdsStatus: {
            state: dispatch.status,
            attemptId: dispatch.attemptId,
            ticketCount: dispatch.ticketsCreated,
            ticketIds: dispatch.ticketIds,
            stationIds: dispatch.stationIds,
            effectiveKdsLocationId: dispatch.effectiveKdsLocationId,
            diagnosis: dispatch.diagnosis,
            errors: dispatch.errors,
          },
        } : {}),
      });
    } catch (err) {
      // KdsDispatchError → 422 with structured dispatch info
      if ((err as Record<string, unknown>).statusCode === 422 && 'dispatch' in (err as Record<string, unknown>)) {
        const dispatch = (err as Record<string, unknown>).dispatch as Record<string, unknown>;
        return NextResponse.json(
          {
            error: {
              code: 'KDS_DISPATCH_FAILED',
              message: (err as Error).message,
            },
            kdsStatus: {
              state: dispatch.status,
              attemptId: dispatch.attemptId,
              ticketCount: dispatch.ticketsCreated ?? 0,
              ticketIds: dispatch.ticketIds ?? [],
              stationIds: dispatch.stationIds ?? [],
              effectiveKdsLocationId: dispatch.effectiveKdsLocationId,
              diagnosis: dispatch.diagnosis ?? [],
              errors: dispatch.errors ?? [],
              failureStage: dispatch.failureStage,
            },
          },
          { status: 422 },
        );
      }
      // Other errors — let middleware handle
      throw err;
    }
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
