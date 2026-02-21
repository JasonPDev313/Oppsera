import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import { terminalLocations, locations } from '@oppsera/db';
import { sql } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateProfitCenterInput } from '../validation';

export async function createProfitCenter(
  ctx: RequestContext,
  input: CreateProfitCenterInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate location belongs to tenant
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, ctx.tenantId),
          eq(locations.id, input.locationId),
          eq(locations.isActive, true),
        ),
      )
      .limit(1);

    if (!location) {
      throw new NotFoundError('Location', input.locationId);
    }

    // Site-level guardrail: if this location is a site with child venues,
    // require explicit opt-in via allowSiteLevel flag
    if (!input.allowSiteLevel) {
      const childVenues = await tx.execute(
        sql`SELECT id FROM locations
            WHERE tenant_id = ${ctx.tenantId}
              AND parent_location_id = ${input.locationId}
              AND is_active = true
            LIMIT 1`,
      );
      if (Array.from(childVenues as Iterable<unknown>).length > 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'This site has venues. Assign profit centers to a venue, or set allowSiteLevel to confirm site-level creation.',
          422,
        );
      }
    }

    // Insert — API `name` maps to DB `title`
    const [created] = await tx
      .insert(terminalLocations)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        title: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        icon: input.icon ?? null,
        tipsApplicable: input.tipsApplicable ?? true,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'platform.profit_center.created.v1', {
      profitCenterId: created!.id,
      locationId: input.locationId,
      name: input.name,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'platform.profit_center.created', 'terminal_location', result.id);
  return result;
}
