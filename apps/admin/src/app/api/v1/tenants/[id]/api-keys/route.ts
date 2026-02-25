import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Tenant ID required' } }, { status: 400 });
  }

  const result = await db.execute(sql`
    SELECT id, tenant_id, name, key_prefix, is_enabled, expires_at, revoked_at, created_at
    FROM api_keys
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
  `);

  const keys = Array.from(result as Iterable<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    keyPrefix: r.key_prefix as string,
    isEnabled: r.is_enabled as boolean,
    expiresAt: r.expires_at as string | null,
    revokedAt: r.revoked_at as string | null,
    createdAt: r.created_at as string,
    status: r.revoked_at ? 'revoked' : r.is_enabled ? 'active' : 'disabled',
  }));

  return NextResponse.json({ data: keys });
}, { permission: 'tenants.view' });
