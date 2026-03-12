import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { sendCourse, sendCourseSchema } from '@oppsera/module-fnb';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// POST /api/v1/fnb/tabs/:id/course/send — send a course to kitchen
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 3]!;
    const body = await request.json();
    const parsed = sendCourseSchema.safeParse({ ...body, tabId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await sendCourse(ctx, parsed.data);
    broadcastFnb(ctx, 'kds', 'tabs').catch(() => {});

    // Post-send verification: check if the inline event consumer created tickets.
    // By the time sendCourse returns, publishWithOutbox has already awaited inline dispatch.
    // If no tickets exist, the consumer silently failed — surface this to the POS.
    let kdsStatus: { ticketCount: number; warning?: string } = { ticketCount: 0 };
    try {
      const ticketRows = await withTenant(ctx.tenantId, (tx) =>
        tx.execute(sql`
          SELECT count(*)::int AS cnt
          FROM fnb_kitchen_tickets
          WHERE tenant_id = ${ctx.tenantId}
            AND tab_id = ${tabId}
            AND course_number = ${parsed.data.courseNumber}
        `),
      );
      const cnt = Number(
        Array.from(ticketRows as Iterable<Record<string, unknown>>)[0]?.cnt ?? 0,
      );
      kdsStatus = { ticketCount: cnt };
      if (cnt === 0) {
        kdsStatus.warning =
          'Course marked as sent but no kitchen tickets were created. ' +
          'Check KDS station configuration and routing rules at this location. ' +
          'Use GET /api/v1/fnb/kds-settings/diagnostics?locationId=...&catalogItemId=... for details.';
      }
    } catch {
      // Non-critical — don't block the send response
    }

    return NextResponse.json({ data: result, kdsStatus });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
