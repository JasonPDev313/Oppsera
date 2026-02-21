import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { MODULE_REGISTRY, validateModeChange } from '@oppsera/core';
import type { AccessMode } from '@oppsera/core';

export const POST = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const moduleKey = body.moduleKey as string | undefined;
  const accessMode = body.accessMode as AccessMode | undefined;

  if (!moduleKey || !accessMode) {
    return NextResponse.json({ error: { message: 'moduleKey and accessMode are required' } }, { status: 400 });
  }

  const validModule = MODULE_REGISTRY.find((m) => m.key === moduleKey);
  if (!validModule) {
    return NextResponse.json({ error: { message: `Unknown module: ${moduleKey}` } }, { status: 400 });
  }

  const rows = await db.execute(
    sql`SELECT module_key, access_mode, is_enabled FROM entitlements WHERE tenant_id = ${tenantId}`,
  );
  const currentModes = new Map<string, AccessMode>();
  currentModes.set('platform_core', 'full');
  for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
    currentModes.set(r.module_key as string, (r.access_mode as AccessMode) ?? (r.is_enabled ? 'full' : 'off'));
  }

  const result = validateModeChange(moduleKey, accessMode, currentModes);

  return NextResponse.json({ data: result });
});
