import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getService,
  updateService,
  archiveService,
  updateServiceSchema,
} from '@oppsera/module-spa';

function extractServiceId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/spa/services/:id
  return parts[parts.length - 1]!;
}

// GET /api/v1/spa/services/:id — service detail with addons and resource requirements
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const serviceId = extractServiceId(request);
    const service = await getService(ctx.tenantId, serviceId);

    if (!service) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Service not found: ${serviceId}` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: service });
  },
  { entitlement: 'spa', permission: 'spa.services.view' },
);

// PATCH /api/v1/spa/services/:id — partial update
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const serviceId = extractServiceId(request);
    const body = await request.json();
    const parsed = updateServiceSchema.safeParse({ ...body, id: serviceId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const service = await updateService(ctx, parsed.data);
    return NextResponse.json({ data: service });
  },
  { entitlement: 'spa', permission: 'spa.services.manage', writeAccess: true },
);

// DELETE /api/v1/spa/services/:id — archive service
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const serviceId = extractServiceId(request);

    // Optional reason from query params or body
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body is fine for DELETE
    }

    const service = await archiveService(ctx, { id: serviceId, reason });
    return NextResponse.json({ data: service });
  },
  { entitlement: 'spa', permission: 'spa.services.manage', writeAccess: true },
);
