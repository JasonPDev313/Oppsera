import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { listCourseDefinitions, upsertCourseDefinitionSchema } from '@oppsera/module-fnb';
import { withTenant } from '@oppsera/db';
import { fnbCourseDefinitions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

// GET /api/v1/fnb/course-definitions?locationId=X
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';

    const definitions = await listCourseDefinitions({
      tenantId: ctx.tenantId,
      locationId,
    });
    return NextResponse.json({ data: definitions });
  },
  { entitlement: 'fnb', permission: 'fnb.view' },
);

// POST /api/v1/fnb/course-definitions — upsert a course definition
// Body: { courseNumber, courseName, sortOrder?, isActive? }
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const parsed = upsertCourseDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    if (!ctx.locationId) {
      return NextResponse.json({ error: { code: 'LOCATION_REQUIRED', message: 'Location header is required' } }, { status: 400 });
    }
    const locationId = ctx.locationId;
    const { courseNumber, courseName, sortOrder, isActive } = parsed.data;

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(fnbCourseDefinitions)
        .where(and(
          eq(fnbCourseDefinitions.tenantId, ctx.tenantId),
          eq(fnbCourseDefinitions.locationId, locationId),
          eq(fnbCourseDefinitions.courseNumber, courseNumber),
        ))
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(fnbCourseDefinitions)
          .set({ courseName, sortOrder, isActive, updatedAt: new Date() })
          .where(eq(fnbCourseDefinitions.id, existing.id))
          .returning();
        return updated;
      }

      const [inserted] = await tx
        .insert(fnbCourseDefinitions)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          locationId,
          courseNumber,
          courseName,
          sortOrder,
          isActive,
        })
        .returning();
      return inserted;
    });

    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'fnb', permission: 'fnb.manage', writeAccess: true },
);

// DELETE /api/v1/fnb/course-definitions — deactivate a course definition by courseNumber
// Body: { courseNumber }
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const courseNumber = Number(body.courseNumber);
    if (!courseNumber || !Number.isInteger(courseNumber)) {
      throw new ValidationError('Validation failed', [{ field: 'courseNumber', message: 'Valid courseNumber is required' }]);
    }

    if (!ctx.locationId) {
      return NextResponse.json({ error: { code: 'LOCATION_REQUIRED', message: 'Location header is required' } }, { status: 400 });
    }

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const updated = await tx
        .update(fnbCourseDefinitions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(fnbCourseDefinitions.tenantId, ctx.tenantId),
          eq(fnbCourseDefinitions.locationId, ctx.locationId!),
          eq(fnbCourseDefinitions.courseNumber, courseNumber),
        ))
        .returning();
      return updated[0] ?? null;
    });

    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'fnb', permission: 'fnb.manage', writeAccess: true },
);
