import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, entitlements } from '@oppsera/db';
import { MODULE_REGISTRY } from '@oppsera/core/entitlements';

export const GET = withMiddleware(
  async (_request, ctx) => {
    const rows = await db.query.entitlements.findMany({
      where: eq(entitlements.tenantId, ctx.tenantId),
    });

    const result = rows.map((row) => {
      const registryEntry = MODULE_REGISTRY.find((m) => m.key === row.moduleKey);
      return {
        moduleKey: row.moduleKey,
        displayName: registryEntry?.name ?? row.moduleKey,
        isEnabled: row.isEnabled,
        planTier: row.planTier,
        limits: row.limits,
        activatedAt: row.activatedAt,
        expiresAt: row.expiresAt,
      };
    });

    return NextResponse.json({ data: { entitlements: result } });
  },
  { permission: 'settings.view' },
);
