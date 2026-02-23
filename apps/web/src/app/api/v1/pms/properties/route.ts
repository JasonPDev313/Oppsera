import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { eq } from 'drizzle-orm';
import { db, tenants } from '@oppsera/db';
import {
  listProperties,
  createProperty,
  createPropertySchema,
  bootstrapPropertiesFromLocations,
} from '@oppsera/module-pms';

// GET /api/v1/pms/properties — list properties
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');

    let result = await listProperties({
      tenantId: ctx.tenantId,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    // Auto-bootstrap PMS properties from tenant locations on first access
    if (result.items.length === 0 && !url.searchParams.get('cursor')) {
      // Resolve tenant name outside withTenant (avoids RLS on tenants table)
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.tenantId),
      });
      const fallbackName = tenant?.name ?? 'Default Property';

      const created = await bootstrapPropertiesFromLocations(ctx.tenantId, fallbackName);
      if (created.length > 0) {
        result = await listProperties({
          tenantId: ctx.tenantId,
          limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
        });
      }
    }

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: 'pms.property.view' },
);

// POST /api/v1/pms/properties — create property
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPropertySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createProperty(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.property.manage' , writeAccess: true },
);
