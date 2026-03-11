import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, generateUlid } from '@oppsera/shared';
import { locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { z } from 'zod';

const createVenueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  parentLocationId: z.string().min(1, 'Parent site is required'),
});

// POST /api/v1/locations/venues
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* validation will reject */ }
    const parsed = createVenueSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { name, parentLocationId } = parsed.data;

    const result = await publishWithOutbox(ctx, async (tx) => {
      // Validate parent site belongs to tenant and is a site
      const [parentSite] = await tx
        .select({ id: locations.id, locationType: locations.locationType })
        .from(locations)
        .where(
          and(
            eq(locations.tenantId, ctx.tenantId),
            eq(locations.id, parentLocationId),
            eq(locations.isActive, true),
          ),
        )
        .limit(1);

      if (!parentSite || parentSite.locationType !== 'site') {
        throw new ValidationError('Invalid parent site', [
          { field: 'parentLocationId', message: 'Parent must be an active site' },
        ]);
      }

      const [created] = await tx
        .insert(locations)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          name: name.trim(),
          locationType: 'venue',
          parentLocationId,
          timezone: 'America/New_York',
        })
        .returning();

      const event = buildEventFromContext(ctx, 'platform.venue.created.v1', {
        venueId: created!.id,
        parentLocationId,
        name: name.trim(),
      });

      return { result: created!, events: [event] };
    });

    auditLogDeferred(ctx, 'platform.venue.created', 'location', result.id);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'settings.update', writeAccess: true },
);
