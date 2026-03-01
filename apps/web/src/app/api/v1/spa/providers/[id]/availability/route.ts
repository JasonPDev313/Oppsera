import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { withTenant, spaProviders, spaProviderAvailability } from '@oppsera/db';
import {
  setProviderAvailability,
  setProviderAvailabilitySchema,
} from '@oppsera/module-spa';

function extractProviderId(url: string): string | null {
  return url.split('/providers/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// GET /api/v1/spa/providers/[id]/availability — get provider availability schedule
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request.url);
    if (!providerId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const availability = await withTenant(ctx.tenantId, async (tx) => {
      // Validate provider exists
      const [provider] = await tx
        .select({ id: spaProviders.id })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.id, providerId),
            eq(spaProviders.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!provider) {
        return null;
      }

      // Fetch active availability slots
      const slots = await tx
        .select({
          id: spaProviderAvailability.id,
          dayOfWeek: spaProviderAvailability.dayOfWeek,
          startTime: spaProviderAvailability.startTime,
          endTime: spaProviderAvailability.endTime,
          locationId: spaProviderAvailability.locationId,
          effectiveFrom: spaProviderAvailability.effectiveFrom,
          effectiveUntil: spaProviderAvailability.effectiveUntil,
          isActive: spaProviderAvailability.isActive,
        })
        .from(spaProviderAvailability)
        .where(
          and(
            eq(spaProviderAvailability.tenantId, ctx.tenantId),
            eq(spaProviderAvailability.providerId, providerId),
            eq(spaProviderAvailability.isActive, true),
          ),
        );

      return slots.map((row) => ({
        id: row.id,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        locationId: row.locationId ?? null,
        effectiveFrom: row.effectiveFrom,
        effectiveUntil: row.effectiveUntil ?? null,
        isActive: row.isActive,
      }));
    });

    if (availability === null) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Provider not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: availability });
  },
  { entitlement: 'spa', permission: 'spa.providers.view' },
);

// PUT /api/v1/spa/providers/[id]/availability — set (replace) provider weekly availability
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request.url);
    if (!providerId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = setProviderAvailabilitySchema.safeParse({
      ...body,
      providerId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setProviderAvailability(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.providers.manage', writeAccess: true },
);
