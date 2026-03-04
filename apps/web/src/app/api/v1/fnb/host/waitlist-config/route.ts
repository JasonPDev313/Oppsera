import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getWaitlistConfig,
  upsertWaitlistConfig,
} from '@oppsera/module-fnb';
import { z } from 'zod';

/**
 * GET /api/v1/fnb/host/waitlist-config
 *
 * Returns the waitlist configuration for the current location.
 * Permission: pos_fnb.host.manage
 */
export const GET = withMiddleware(
  async (_req: NextRequest, ctx) => {
    if (!ctx.locationId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Location ID is required' } },
        { status: 400 },
      );
    }

    const config = await getWaitlistConfig(ctx.tenantId, ctx.locationId);

    return NextResponse.json({ data: config });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);

// ── Update schema ─────────────────────────────────────────────────
const updateSchema = z.object({
  enabled: z.boolean().optional(),
  slugOverride: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').nullable().optional(),
  formConfig: z.record(z.string(), z.unknown()).optional(),
  notificationConfig: z.record(z.string(), z.unknown()).optional(),
  queueConfig: z.record(z.string(), z.unknown()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  contentConfig: z.record(z.string(), z.unknown()).optional(),
  operatingHours: z.record(z.string(), z.unknown()).optional(),
});

/**
 * PATCH /api/v1/fnb/host/waitlist-config
 *
 * Updates waitlist configuration for the current location.
 * Partial updates supported — only provided fields are changed.
 * Permission: pos_fnb.host.manage
 */
export const PATCH = withMiddleware(
  async (req: NextRequest, ctx) => {
    if (!ctx.locationId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Location ID is required' } },
        { status: 400 },
      );
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid waitlist config input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await upsertWaitlistConfig(ctx, {
      locationId: ctx.locationId,
      ...parsed.data,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);
