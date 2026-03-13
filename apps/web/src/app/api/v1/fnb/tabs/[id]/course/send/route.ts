import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { sendCourse, sendCourseSchema, resendCourseToKds } from '@oppsera/module-fnb';
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
    let kdsStatus: {
      ticketCount: number;
      warning?: string;
      effectiveKdsLocationId?: string;
      ticketIds?: string[];
      stationIds?: string[];
    } = { ticketCount: 0 };
    try {
      const ticketRows = await withTenant(ctx.tenantId, (tx) =>
        tx.execute(sql`
          SELECT kt.id, kt.location_id,
                 array_agg(DISTINCT kti.station_id) AS station_ids
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti ON kti.ticket_id = kt.id
          WHERE kt.tenant_id = ${ctx.tenantId}
            AND kt.tab_id = ${tabId}
            AND kt.course_number = ${parsed.data.courseNumber}
          GROUP BY kt.id, kt.location_id
        `),
      );
      const rows = Array.from(ticketRows as Iterable<Record<string, unknown>>);
      const cnt = rows.length;
      const ticketIds = rows.map((r) => r.id as string);
      const stationIdSet = new Set<string>();
      for (const r of rows) {
        const sids = r.station_ids as string[] | null;
        if (sids) for (const sid of sids) stationIdSet.add(sid);
      }
      const effectiveLocationId = (rows[0]?.location_id as string) ?? ctx.locationId;
      kdsStatus = {
        ticketCount: cnt,
        effectiveKdsLocationId: effectiveLocationId,
        ticketIds,
        stationIds: [...stationIdSet],
      };
      if (cnt === 0) {
        // No tickets created — run resend with diagnostics to find out WHY.
        // This both creates the tickets (if routing succeeds) and returns the failure trace.
        try {
          const resendResult = await resendCourseToKds(ctx, {
            tabId,
            courseNumber: parsed.data.courseNumber,
          });
          kdsStatus.ticketCount = resendResult.ticketsCreated;
          (kdsStatus as Record<string, unknown>).diagnosis = resendResult.diagnosis;
          (kdsStatus as Record<string, unknown>).errors = resendResult.errors;
          if (resendResult.ticketsCreated === 0) {
            kdsStatus.warning =
              'Course sent but no kitchen tickets created. ' +
              `Diagnosis: ${resendResult.errors.join('; ') || resendResult.diagnosis.slice(-3).join('; ')}`;
          }
        } catch {
          kdsStatus.warning =
            'Course sent but no kitchen tickets created. Use the resend endpoint for diagnostics.';
        }
      }
    } catch {
      // Non-critical — don't block the send response
    }

    return NextResponse.json({ data: result, kdsStatus });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
