import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { MODULE_REGISTRY } from '@oppsera/core';
import type { AccessMode } from '@oppsera/core';

export const POST = withAdminAuth(async (req: NextRequest, _session, params) => {
  const templateId = params?.id;
  if (!templateId) return NextResponse.json({ error: { message: 'Missing template ID' } }, { status: 400 });

  const body = await req.json();
  const tenantId = body.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ error: { message: 'tenantId is required' } }, { status: 400 });

  // Load template
  const templateRows = Array.from(
    (await db.execute(sql`SELECT modules FROM module_templates WHERE id = ${templateId}`)) as Iterable<Record<string, unknown>>,
  );
  if (templateRows.length === 0) {
    return NextResponse.json({ error: { message: 'Template not found' } }, { status: 404 });
  }
  const templateModules = (templateRows[0]!.modules ?? []) as { moduleKey: string; accessMode: AccessMode }[];
  const templateMap = new Map(templateModules.map((m) => [m.moduleKey, m.accessMode]));

  // Load current entitlements
  const currentRows = await db.execute(
    sql`SELECT module_key, access_mode, is_enabled FROM entitlements WHERE tenant_id = ${tenantId}`,
  );
  const currentModes = new Map<string, AccessMode>();
  currentModes.set('platform_core', 'full');
  for (const r of Array.from(currentRows as Iterable<Record<string, unknown>>)) {
    currentModes.set(r.module_key as string, (r.access_mode as AccessMode) ?? (r.is_enabled ? 'full' : 'off'));
  }

  const moduleNames = new Map(MODULE_REGISTRY.map((m) => [m.key, m.name]));

  // Compute diff for ALL modules
  const changes = MODULE_REGISTRY.map((mod) => {
    const currentMode = currentModes.get(mod.key) ?? (mod.key === 'platform_core' ? 'full' : 'off');
    const targetMode = templateMap.get(mod.key) ?? 'off';

    let action: 'enable' | 'disable' | 'upgrade' | 'downgrade' | 'unchanged';
    if (currentMode === targetMode) {
      action = 'unchanged';
    } else if (currentMode === 'off' && targetMode !== 'off') {
      action = 'enable';
    } else if (currentMode !== 'off' && targetMode === 'off') {
      action = 'disable';
    } else if (currentMode === 'view' && targetMode === 'full') {
      action = 'upgrade';
    } else {
      action = 'downgrade';
    }

    return {
      moduleKey: mod.key,
      moduleName: moduleNames.get(mod.key) ?? mod.key,
      currentMode,
      targetMode,
      action,
    };
  }).filter((c) => c.action !== 'unchanged');

  const summary = {
    enabling: changes.filter((c) => c.action === 'enable').length,
    disabling: changes.filter((c) => c.action === 'disable').length,
    upgrading: changes.filter((c) => c.action === 'upgrade').length,
    downgrading: changes.filter((c) => c.action === 'downgrade').length,
  };

  return NextResponse.json({ data: { changes, summary } });
});
