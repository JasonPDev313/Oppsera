import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { changeTierSchema, validateTierTransition, applyTierChange } from '@oppsera/core/erp';
import { db } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import type { BusinessTier } from '@oppsera/shared';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const rows = await db
      .select({
        businessTier: tenants.businessTier,
        businessVertical: tenants.businessVertical,
        tierOverride: tenants.tierOverride,
        tierOverrideReason: tenants.tierOverrideReason,
        tierLastEvaluatedAt: tenants.tierLastEvaluatedAt,
      })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: rows[0] });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = changeTierSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Get current tier
    const rows = await db
      .select({ businessTier: tenants.businessTier })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    const currentTier = (rows[0]?.businessTier as BusinessTier) ?? 'SMB';
    const newTier = parsed.data.newTier as BusinessTier;

    // Validate transition
    const transition = validateTierTransition(currentTier, newTier);
    if (!transition.allowed) {
      return NextResponse.json(
        { error: { code: 'TIER_TRANSITION_BLOCKED', message: 'Tier transition not allowed', warnings: transition.warnings } },
        { status: 422 },
      );
    }

    // Apply change
    await applyTierChange(ctx, ctx.tenantId, newTier, parsed.data.reason);

    return NextResponse.json({
      data: {
        previousTier: currentTier,
        newTier,
        warnings: transition.warnings,
        dataPreservation: transition.dataPreservation,
      },
    });
  },
  { entitlement: 'platform_core', permission: 'settings.manage', writeAccess: true },
);
