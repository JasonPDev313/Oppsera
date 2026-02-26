import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, getVertical } from '@oppsera/shared';
import { changeTierSchema, validateTierTransition, applyTierChange } from '@oppsera/core/erp';
import { db, withTenant } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq, sql } from 'drizzle-orm';
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
        name: tenants.name,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, { status: 404 });
    }

    const tenant = rows[0]!;

    // Gather stats in parallel
    const [locationRows, userRows, glRows, entitlementRows] = await withTenant(ctx.tenantId, (tx) =>
      Promise.all([
        tx.execute(sql`SELECT COUNT(*)::int AS count FROM locations WHERE tenant_id = ${ctx.tenantId}`),
        tx.execute(sql`SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = ${ctx.tenantId}`),
        tx.execute(sql`SELECT COUNT(*)::int AS count FROM gl_accounts WHERE tenant_id = ${ctx.tenantId} AND is_active = true`),
        tx.execute(sql`SELECT module_key FROM entitlements WHERE tenant_id = ${ctx.tenantId} AND access_mode != 'off'`),
      ]),
    );

    const locationArr = Array.from(locationRows as Iterable<Record<string, unknown>>);
    const userArr = Array.from(userRows as Iterable<Record<string, unknown>>);
    const glArr = Array.from(glRows as Iterable<Record<string, unknown>>);
    const entitlementArr = Array.from(entitlementRows as Iterable<Record<string, unknown>>);

    const enabledModules = entitlementArr.map((r) => String(r.module_key));

    // Resolve vertical info from constants
    const vertical = getVertical(tenant.businessVertical);

    return NextResponse.json({
      data: {
        businessTier: tenant.businessTier,
        businessVertical: tenant.businessVertical,
        tierOverride: tenant.tierOverride,
        tierOverrideReason: tenant.tierOverrideReason,
        tierLastEvaluatedAt: tenant.tierLastEvaluatedAt,
        tenantName: tenant.name,
        createdAt: tenant.createdAt,
        locationCount: locationArr[0] ? Number(locationArr[0].count) : 0,
        userCount: userArr[0] ? Number(userArr[0].count) : 0,
        glAccountCount: glArr[0] ? Number(glArr[0].count) : 0,
        enabledModuleCount: enabledModules.length,
        enabledModules,
        verticalInfo: vertical
          ? { name: vertical.name, icon: vertical.icon, description: vertical.description, recommendedModules: vertical.recommendedModules }
          : null,
      },
    });
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
  { entitlement: 'platform_core', permission: 'settings.update', writeAccess: true },
);
