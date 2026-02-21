import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { terminalLocations, locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

const DEFAULT_TITLE = 'Default';
const DEFAULT_CODE = 'DEFAULT';

/**
 * Find-or-create a "Default" profit center for simple mode.
 * Idempotent: returns existing if one already exists for this locationId.
 */
export async function ensureDefaultProfitCenter(
  ctx: RequestContext,
  locationId: string,
): Promise<{ id: string; created: boolean }> {
  return publishWithOutbox(ctx, async (tx) => {
    // Validate location belongs to tenant
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, ctx.tenantId),
          eq(locations.id, locationId),
          eq(locations.isActive, true),
        ),
      )
      .limit(1);

    if (!location) {
      throw new NotFoundError('Location', locationId);
    }

    // Check for existing default profit center
    const [existing] = await tx
      .select({ id: terminalLocations.id })
      .from(terminalLocations)
      .where(
        and(
          eq(terminalLocations.tenantId, ctx.tenantId),
          eq(terminalLocations.locationId, locationId),
          eq(terminalLocations.code, DEFAULT_CODE),
          eq(terminalLocations.isActive, true),
        ),
      )
      .limit(1);

    if (existing) {
      return { result: { id: existing.id, created: false as boolean }, events: [] };
    }

    // Create new Default profit center
    const [created] = await tx
      .insert(terminalLocations)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        locationId,
        title: DEFAULT_TITLE,
        code: DEFAULT_CODE,
        tipsApplicable: true,
        isActive: true,
        sortOrder: 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'platform.profit_center.created.v1', {
      profitCenterId: created!.id,
      locationId,
      name: DEFAULT_TITLE,
    });

    return { result: { id: created!.id, created: true as boolean }, events: [event] };
  });
}
