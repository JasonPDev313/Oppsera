import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { MODULE_REGISTRY } from '@oppsera/core';

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const url = new URL(req.url);
  const moduleKey = url.searchParams.get('moduleKey');
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  const moduleNames = new Map(MODULE_REGISTRY.map((m) => [m.key, m.name]));

  let query;
  if (moduleKey && cursor) {
    query = sql`
      SELECT id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source, metadata, created_at
      FROM entitlement_change_log
      WHERE tenant_id = ${tenantId} AND module_key = ${moduleKey} AND id < ${cursor}
      ORDER BY created_at DESC LIMIT ${limit + 1}
    `;
  } else if (moduleKey) {
    query = sql`
      SELECT id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source, metadata, created_at
      FROM entitlement_change_log
      WHERE tenant_id = ${tenantId} AND module_key = ${moduleKey}
      ORDER BY created_at DESC LIMIT ${limit + 1}
    `;
  } else if (cursor) {
    query = sql`
      SELECT id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source, metadata, created_at
      FROM entitlement_change_log
      WHERE tenant_id = ${tenantId} AND id < ${cursor}
      ORDER BY created_at DESC LIMIT ${limit + 1}
    `;
  } else {
    query = sql`
      SELECT id, tenant_id, module_key, previous_mode, new_mode, changed_by, change_reason, change_source, metadata, created_at
      FROM entitlement_change_log
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC LIMIT ${limit + 1}
    `;
  }

  const rows = Array.from((await db.execute(query)) as Iterable<Record<string, unknown>>);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const mapped = items.map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    moduleKey: r.module_key as string,
    moduleName: moduleNames.get(r.module_key as string) ?? (r.module_key as string),
    previousMode: r.previous_mode as string,
    newMode: r.new_mode as string,
    changedBy: r.changed_by as string,
    changeReason: (r.change_reason as string) ?? null,
    changeSource: r.change_source as string,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return NextResponse.json({
    data: {
      items: mapped,
      cursor: hasMore ? items[items.length - 1]!.id as string : null,
      hasMore,
    },
  });
});
