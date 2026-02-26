import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { classifyTenant } from '@oppsera/core/erp';
import { db, withTenant } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq, sql } from 'drizzle-orm';
import type { BusinessTier } from '@oppsera/shared';

export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    // Get current tier
    const tenantRows = await db
      .select({ businessTier: tenants.businessTier })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    const currentTier = (tenantRows[0]?.businessTier as BusinessTier) ?? 'SMB';

    // Gather metrics for classification
    const metrics = await withTenant(ctx.tenantId, async (tx) => {
      const [locationResult, userResult, glResult] = await Promise.all([
        tx.execute(sql`
          SELECT COUNT(*)::int AS count FROM locations
          WHERE tenant_id = ${ctx.tenantId}
        `),
        tx.execute(sql`
          SELECT COUNT(*)::int AS count FROM users
          WHERE tenant_id = ${ctx.tenantId}
        `),
        tx.execute(sql`
          SELECT COUNT(*)::int AS count FROM gl_accounts
          WHERE tenant_id = ${ctx.tenantId} AND is_active = true
        `),
      ]);

      const locationArr = Array.from(locationResult as Iterable<Record<string, unknown>>);
      const userArr = Array.from(userResult as Iterable<Record<string, unknown>>);
      const glArr = Array.from(glResult as Iterable<Record<string, unknown>>);

      return {
        annualRevenue: 0, // TODO: compute from reporting read models when available
        locationCount: locationArr[0] ? Number(locationArr[0].count) : 0,
        userCount: userArr[0] ? Number(userArr[0].count) : 0,
        glAccountCount: glArr[0] ? Number(glArr[0].count) : 0,
      };
    });

    const recommendedTier = classifyTenant(metrics);

    // Update last evaluated timestamp
    await db
      .update(tenants)
      .set({ tierLastEvaluatedAt: new Date() })
      .where(eq(tenants.id, ctx.tenantId));

    return NextResponse.json({
      data: {
        currentTier,
        recommendedTier,
        metrics,
        shouldUpgrade: recommendedTier !== currentTier,
      },
    });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);
