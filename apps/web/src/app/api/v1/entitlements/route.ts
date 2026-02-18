import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, entitlements } from '@oppsera/db';
import { MODULE_REGISTRY, getEntitlementEngine } from '@oppsera/core/entitlements';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid, ValidationError, ConflictError } from '@oppsera/shared';

const MODULE_REGISTRY_MAP = new Map<string, (typeof MODULE_REGISTRY)[number]>(MODULE_REGISTRY.map((m) => [m.key, m]));

export const GET = withMiddleware(
  async (_request, ctx) => {
    const rows = await db.query.entitlements.findMany({
      where: eq(entitlements.tenantId, ctx.tenantId),
    });

    const result = rows.map((row) => {
      const registryEntry = MODULE_REGISTRY_MAP.get(row.moduleKey);
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

// ── Enable a module ─────────────────────────────────────────────

const enableModuleSchema = z.object({
  moduleKey: z.string().min(1),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = enableModuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { moduleKey } = parsed.data;

    // Verify the module exists in the registry and is v1
    const registryEntry = MODULE_REGISTRY.find((m) => m.key === moduleKey);
    if (!registryEntry || registryEntry.phase !== 'v1') {
      throw new ValidationError('Invalid module', [
        { field: 'moduleKey', message: 'Module is not available for activation' },
      ]);
    }

    // Check if already enabled
    const existing = await db.query.entitlements.findFirst({
      where: and(
        eq(entitlements.tenantId, ctx.tenantId),
        eq(entitlements.moduleKey, moduleKey),
      ),
    });

    if (existing) {
      throw new ConflictError('Module is already enabled');
    }

    // Create entitlement
    const [row] = await db.insert(entitlements).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      moduleKey,
      planTier: 'free',
      isEnabled: true,
    }).returning();

    // Invalidate cache
    await getEntitlementEngine().invalidateEntitlements(ctx.tenantId);

    await auditLog(ctx, 'entitlement.enabled', 'entitlement', row!.id);

    return NextResponse.json({
      data: {
        moduleKey: row!.moduleKey,
        displayName: registryEntry.name,
        isEnabled: row!.isEnabled,
        planTier: row!.planTier,
      },
    }, { status: 201 });
  },
  { permission: 'settings.update' },
);
