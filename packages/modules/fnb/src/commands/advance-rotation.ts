import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { fnbRotationTracker } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { AdvanceRotationInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

/**
 * Advances the host-stand rotation to the next server.
 * Round-robin through all active servers for the given location and date.
 * If no rotation tracker exists, creates one from active assignments.
 */
export async function advanceRotation(
  ctx: RequestContext,
  input: AdvanceRotationInput,
) {
  return publishWithOutbox(ctx, async (tx) => {
    // Get or create rotation tracker
    const [existing] = await (tx as any)
      .select()
      .from(fnbRotationTracker)
      .where(and(
        eq(fnbRotationTracker.tenantId, ctx.tenantId),
        eq(fnbRotationTracker.locationId, input.locationId),
        eq(fnbRotationTracker.businessDate, input.businessDate),
      ))
      .limit(1);

    if (existing) {
      const order = existing.rotationOrder as string[];
      const currentIdx = order.indexOf(existing.nextServerUserId);
      const nextIdx = (currentIdx + 1) % order.length;
      const nextServer = order[nextIdx]!;

      const [updated] = await (tx as any)
        .update(fnbRotationTracker)
        .set({
          nextServerUserId: nextServer,
          lastSeatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fnbRotationTracker.id, existing.id))
        .returning();

      const event = buildEventFromContext(ctx, FNB_EVENTS.ROTATION_ADVANCED, {
        locationId: input.locationId,
        businessDate: input.businessDate,
        nextServerUserId: nextServer,
      });

      return { result: updated!, events: [event] };
    }

    // No tracker exists — build from active assignments
    const rows = await (tx as any).execute(sql`
      SELECT DISTINCT server_user_id
      FROM fnb_server_assignments
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${input.locationId}
        AND business_date = ${input.businessDate}
        AND status = 'active'
      ORDER BY server_user_id
    `);

    const serverIds = Array.from(rows as Iterable<Record<string, unknown>>)
      .map((r) => String(r.server_user_id));

    if (serverIds.length === 0) {
      return { result: null, events: [] };
    }

    const [created] = await (tx as any)
      .insert(fnbRotationTracker)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        businessDate: input.businessDate,
        nextServerUserId: serverIds[0]!,
        rotationOrder: serverIds,
        lastSeatedAt: new Date(),
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.ROTATION_ADVANCED, {
      locationId: input.locationId,
      businessDate: input.businessDate,
      nextServerUserId: serverIds[0]!,
    });

    return { result: created!, events: [event] };
  });
}
