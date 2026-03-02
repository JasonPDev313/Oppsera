import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { withTenant, spaBookingWidgetConfig } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import {
  updateBookingWidgetConfig,
  updateBookingWidgetConfigSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/booking/config — get booking widget config
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const config = await withTenant(ctx.tenantId, async (tx) => {
      const conditions = [eq(spaBookingWidgetConfig.tenantId, ctx.tenantId)];
      if (ctx.locationId) {
        conditions.push(eq(spaBookingWidgetConfig.locationId, ctx.locationId));
      }

      const [row] = await tx
        .select()
        .from(spaBookingWidgetConfig)
        .where(and(...conditions))
        .limit(1);

      return row ?? null;
    });

    return NextResponse.json({ data: config });
  },
  { entitlement: 'spa', permission: 'spa.settings.view' },
);

// PATCH /api/v1/spa/booking/config — update booking widget config
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateBookingWidgetConfigSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const config = await updateBookingWidgetConfig(ctx, parsed.data);
    return NextResponse.json({ data: config });
  },
  { entitlement: 'spa', permission: 'spa.booking.manage', writeAccess: true },
);
