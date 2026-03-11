import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { locations } from '@oppsera/db';
import { withTenant, sql } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { z } from 'zod';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

const updateVenueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/locations/venues/:id
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const rows = await withTenant(ctx.tenantId, (tx) =>
      tx.execute(
        sql`SELECT id, name, location_type, parent_location_id, is_active
            FROM locations
            WHERE tenant_id = ${ctx.tenantId} AND id = ${id} AND location_type = 'venue'
            LIMIT 1`,
      ),
    );

    const venues = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      locationType: String(r.location_type),
      parentLocationId: r.parent_location_id ? String(r.parent_location_id) : null,
      isActive: Boolean(r.is_active),
    }));

    if (venues.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Venue '${id}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: venues[0] });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// PATCH /api/v1/locations/venues/:id
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    let body = {};
    try { body = await request.json(); } catch { /* validation will reject */ }
    const parsed = updateVenueSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await publishWithOutbox(ctx, async (tx) => {
      // Verify venue exists and belongs to tenant
      const [existing] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.tenantId, ctx.tenantId),
            eq(locations.id, id),
            eq(locations.locationType, 'venue'),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Venue', id);
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      const [updated] = await tx
        .update(locations)
        .set(updates)
        .where(eq(locations.id, id))
        .returning();

      const event = buildEventFromContext(ctx, 'platform.venue.updated.v1', {
        venueId: id,
        changes: parsed.data,
      });

      return { result: updated!, events: [event] };
    });

    auditLogDeferred(ctx, 'platform.venue.updated', 'location', id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'platform_core', permission: 'settings.update', writeAccess: true },
);

// DELETE /api/v1/locations/venues/:id (soft-delete)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    await publishWithOutbox(ctx, async (tx) => {
      const [existing] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.tenantId, ctx.tenantId),
            eq(locations.id, id),
            eq(locations.locationType, 'venue'),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Venue', id);
      }

      const [updated] = await tx
        .update(locations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(locations.id, id))
        .returning();

      const event = buildEventFromContext(ctx, 'platform.venue.deleted.v1', {
        venueId: id,
      });

      return { result: updated!, events: [event] };
    });

    auditLogDeferred(ctx, 'platform.venue.deleted', 'location', id);
    return NextResponse.json({ data: { id } });
  },
  { entitlement: 'platform_core', permission: 'settings.update', writeAccess: true },
);
