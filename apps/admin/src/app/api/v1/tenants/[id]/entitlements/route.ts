import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { MODULE_REGISTRY, validateModeChange, getEntitlementEngine } from '@oppsera/core';
import type { AccessMode } from '@oppsera/core';
import { generateUlid } from '@oppsera/shared';

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const rows = await db.execute(
    sql`SELECT id, module_key, plan_tier, is_enabled, access_mode, activated_at, expires_at,
               changed_by, change_reason, updated_at
        FROM entitlements
        WHERE tenant_id = ${tenantId}`,
  );

  const existing = new Map<string, Record<string, unknown>>();
  for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
    existing.set(r.module_key as string, r);
  }

  // Build the current access mode map for dependency resolution
  const currentModes = new Map<string, AccessMode>();
  for (const mod of MODULE_REGISTRY) {
    const ent = existing.get(mod.key);
    if (ent) {
      currentModes.set(mod.key, (ent.access_mode as AccessMode) ?? (ent.is_enabled ? 'full' : 'off'));
    } else {
      currentModes.set(mod.key, mod.key === 'platform_core' ? 'full' : 'off');
    }
  }

  const items = MODULE_REGISTRY.map((mod) => {
    const ent = existing.get(mod.key);
    const accessMode: AccessMode = ent
      ? ((ent.access_mode as AccessMode) ?? (ent.is_enabled ? 'full' : 'off'))
      : (mod.key === 'platform_core' ? 'full' : 'off');

    const activeDependents = MODULE_REGISTRY
      .filter((m) => m.dependencies.includes(mod.key) && (currentModes.get(m.key) ?? 'off') !== 'off')
      .map((m) => m.key);

    return {
      id: ent ? (ent.id as string) : null,
      tenantId,
      moduleKey: mod.key,
      moduleName: mod.name,
      moduleDescription: mod.description,
      accessMode,
      planTier: ent ? (ent.plan_tier as string) : 'standard',
      isEnabled: accessMode !== 'off',
      riskLevel: mod.riskLevel,
      category: mod.category,
      supportsViewMode: mod.supportsViewMode,
      dependencies: mod.dependencies,
      dependents: activeDependents,
      activatedAt: ent?.activated_at ? (ent.activated_at as Date).toISOString() : null,
      expiresAt: ent?.expires_at ? (ent.expires_at as Date).toISOString() : null,
      changedBy: (ent?.changed_by as string) ?? null,
      changeReason: (ent?.change_reason as string) ?? null,
      lastChangedAt: ent?.updated_at ? (ent.updated_at as Date).toISOString() : null,
    };
  });

  const summary = {
    totalModules: items.length,
    fullAccess: items.filter((i) => i.accessMode === 'full').length,
    viewOnly: items.filter((i) => i.accessMode === 'view').length,
    off: items.filter((i) => i.accessMode === 'off').length,
  };

  return NextResponse.json({ data: { modules: items, summary } });
});

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const moduleKey = body.moduleKey as string | undefined;
  const accessMode = (body.accessMode ?? 'full') as AccessMode;
  const reason = body.reason as string | undefined;
  const planTier = (body.planTier ?? 'standard') as string;
  const autoEnableDependencies = body.autoEnableDependencies === true;

  if (!moduleKey) {
    return NextResponse.json({ error: { message: 'moduleKey is required' } }, { status: 400 });
  }
  if (!['off', 'view', 'full'].includes(accessMode)) {
    return NextResponse.json({ error: { message: 'accessMode must be off, view, or full' } }, { status: 400 });
  }

  const validModule = MODULE_REGISTRY.find((m) => m.key === moduleKey);
  if (!validModule) {
    return NextResponse.json({ error: { message: `Unknown module: ${moduleKey}` } }, { status: 400 });
  }
  if (accessMode === 'view' && !validModule.supportsViewMode) {
    return NextResponse.json(
      { error: { message: `${validModule.name} does not support view-only mode` } },
      { status: 400 },
    );
  }

  // Load current entitlements for dependency validation
  const currentRows = await db.execute(
    sql`SELECT module_key, access_mode, is_enabled FROM entitlements WHERE tenant_id = ${tenantId}`,
  );
  const currentModes = new Map<string, AccessMode>();
  currentModes.set('platform_core', 'full');
  for (const r of Array.from(currentRows as Iterable<Record<string, unknown>>)) {
    currentModes.set(r.module_key as string, (r.access_mode as AccessMode) ?? (r.is_enabled ? 'full' : 'off'));
  }

  const check = validateModeChange(moduleKey, accessMode, currentModes);
  const changedByLabel = `admin:${session.adminId}`;

  if (check.reasonRequired && !reason) {
    return NextResponse.json(
      { error: { message: `A reason is required when changing ${validModule.name} (${validModule.riskLevel} risk)` } },
      { status: 400 },
    );
  }

  // Missing dependencies
  if (!check.allowed && check.missingDependencies.length > 0) {
    if (!autoEnableDependencies) {
      return NextResponse.json({
        error: {
          code: 'DEPENDENCY_MISSING',
          message: `Cannot enable ${validModule.name}: missing dependencies`,
          details: check.missingDependencies,
        },
      }, { status: 400 });
    }
    for (const dep of check.missingDependencies) {
      await db.execute(sql`
        INSERT INTO entitlements (id, tenant_id, module_key, plan_tier, is_enabled, access_mode, activated_at, changed_by, change_reason, previous_mode)
        VALUES (${generateUlid()}, ${tenantId}, ${dep.key}, 'standard', true, 'view', NOW(), ${changedByLabel}, 'Auto-enabled as dependency', 'off')
        ON CONFLICT (tenant_id, module_key)
        DO UPDATE SET is_enabled = true, access_mode = 'view', changed_by = ${changedByLabel},
          change_reason = 'Auto-enabled as dependency', previous_mode = entitlements.access_mode, updated_at = NOW()
      `);
      await db.execute(sql`
        INSERT INTO entitlement_change_log (id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source)
        VALUES (${generateUlid()}, ${tenantId}, ${dep.key}, 'off', 'view', ${changedByLabel}, 'Auto-enabled as dependency', 'manual')
      `);
    }
  }

  // Active dependents blocking disable
  if (!check.allowed && check.dependents.length > 0) {
    return NextResponse.json({
      error: {
        code: 'HAS_DEPENDENTS',
        message: `Cannot disable ${validModule.name}: other modules depend on it`,
        details: check.dependents,
      },
    }, { status: 400 });
  }

  const previousMode = currentModes.get(moduleKey) ?? 'off';
  const isEnabled = accessMode !== 'off';

  // Upsert entitlement
  await db.execute(sql`
    INSERT INTO entitlements (id, tenant_id, module_key, plan_tier, is_enabled, access_mode, activated_at, changed_by, change_reason, previous_mode)
    VALUES (${generateUlid()}, ${tenantId}, ${moduleKey}, ${planTier}, ${isEnabled}, ${accessMode}, NOW(), ${changedByLabel}, ${reason ?? null}, ${previousMode})
    ON CONFLICT (tenant_id, module_key)
    DO UPDATE SET
      is_enabled = ${isEnabled},
      access_mode = ${accessMode},
      plan_tier = ${planTier},
      changed_by = ${changedByLabel},
      change_reason = ${reason ?? null},
      previous_mode = entitlements.access_mode,
      updated_at = NOW()
  `);

  // Log the change
  if (previousMode !== accessMode) {
    await db.execute(sql`
      INSERT INTO entitlement_change_log (id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source)
      VALUES (${generateUlid()}, ${tenantId}, ${moduleKey}, ${previousMode}, ${accessMode}, ${changedByLabel}, ${reason ?? null}, 'manual')
    `);
  }

  // Invalidate cache
  await getEntitlementEngine().invalidateEntitlements(tenantId);

  return NextResponse.json({
    data: {
      tenantId,
      moduleKey,
      accessMode,
      isEnabled,
      planTier,
      previousMode,
      autoEnabledDependencies: check.missingDependencies.length > 0 && autoEnableDependencies
        ? check.missingDependencies.map((d) => d.key)
        : [],
    },
  });
}, 'admin');
