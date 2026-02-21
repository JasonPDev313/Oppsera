import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { MODULE_REGISTRY, getEntitlementEngine } from '@oppsera/core';
import type { AccessMode } from '@oppsera/core';
import { generateUlid } from '@oppsera/shared';

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const changes = body.changes as { moduleKey: string; accessMode: AccessMode }[] | undefined;
  const reason = body.reason as string | undefined;
  const source = (body.source ?? 'manual') as string;

  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: { message: 'changes array is required' } }, { status: 400 });
  }

  // Validate all module keys
  for (const c of changes) {
    if (!MODULE_REGISTRY.find((m) => m.key === c.moduleKey)) {
      return NextResponse.json({ error: { message: `Unknown module: ${c.moduleKey}` } }, { status: 400 });
    }
    if (!['off', 'view', 'full'].includes(c.accessMode)) {
      return NextResponse.json({ error: { message: `Invalid accessMode for ${c.moduleKey}` } }, { status: 400 });
    }
  }

  // Load current modes
  const currentRows = await db.execute(
    sql`SELECT module_key, access_mode, is_enabled FROM entitlements WHERE tenant_id = ${tenantId}`,
  );
  const currentModes = new Map<string, AccessMode>();
  currentModes.set('platform_core', 'full');
  for (const r of Array.from(currentRows as Iterable<Record<string, unknown>>)) {
    currentModes.set(r.module_key as string, (r.access_mode as AccessMode) ?? (r.is_enabled ? 'full' : 'off'));
  }

  const changedByLabel = `admin:${session.adminId}`;
  const applied: { moduleKey: string; previousMode: string; newMode: string }[] = [];

  for (const c of changes) {
    const previousMode = currentModes.get(c.moduleKey) ?? 'off';
    if (previousMode === c.accessMode) continue;

    const isEnabled = c.accessMode !== 'off';
    await db.execute(sql`
      INSERT INTO entitlements (id, tenant_id, module_key, plan_tier, is_enabled, access_mode, activated_at, changed_by, change_reason, previous_mode)
      VALUES (${generateUlid()}, ${tenantId}, ${c.moduleKey}, 'standard', ${isEnabled}, ${c.accessMode}, NOW(), ${changedByLabel}, ${reason ?? null}, ${previousMode})
      ON CONFLICT (tenant_id, module_key)
      DO UPDATE SET is_enabled = ${isEnabled}, access_mode = ${c.accessMode}, changed_by = ${changedByLabel},
        change_reason = ${reason ?? null}, previous_mode = entitlements.access_mode, updated_at = NOW()
    `);

    await db.execute(sql`
      INSERT INTO entitlement_change_log (id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source)
      VALUES (${generateUlid()}, ${tenantId}, ${c.moduleKey}, ${previousMode}, ${c.accessMode}, ${changedByLabel}, ${reason ?? null}, ${source})
    `);

    applied.push({ moduleKey: c.moduleKey, previousMode, newMode: c.accessMode });
    currentModes.set(c.moduleKey, c.accessMode);
  }

  await getEntitlementEngine().invalidateEntitlements(tenantId);

  return NextResponse.json({ data: { applied, count: applied.length } });
}, 'admin');
